import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': authHeader, 'apikey': supabaseServiceKey },
    })
    if (!userRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const authUser = await userRes.json()
    if (!authUser?.id) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const {
      role_id,
      email,
      first_name,
      last_name,
      phone,
      team_club_affiliation_id,
    } = body

    if (!role_id || !email?.trim() || !first_name?.trim() || !last_name?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: role_id, email, first_name, last_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const emailNorm = email.trim().toLowerCase()

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from('volunteer_roles')
      .select('id, name, positions_total, leader_id, domain_id')
      .eq('id', role_id)
      .single()

    if (roleError || !roleRow) {
      return new Response(
        JSON.stringify({ error: 'Role not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .single()

    const isAdmin = callerProfile?.role === 'admin'
    const isLeaderOfRole = roleRow.leader_id === authUser.id
    let isLeaderOfDomain = false
    if (!isAdmin && roleRow.domain_id) {
      const { data: domainRow } = await supabaseAdmin
        .from('volunteer_leader_domains')
        .select('leader_id')
        .eq('id', roleRow.domain_id)
        .single()
      isLeaderOfDomain = domainRow?.leader_id === authUser.id
    }

    if (!isAdmin && !isLeaderOfRole && !isLeaderOfDomain) {
      return new Response(
        JSON.stringify({ error: 'You are not allowed to add volunteers to this role' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let volunteerId: string

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, phone, team_club_affiliation_id')
      .ilike('email', emailNorm)
      .maybeSingle()

    if (existingProfile) {
      volunteerId = existingProfile.id
      const updates: Record<string, unknown> = {}
      if (!existingProfile.first_name && first_name) updates.first_name = first_name.trim()
      if (!existingProfile.last_name && last_name) updates.last_name = last_name.trim()
      if (phone !== undefined && phone !== existingProfile.phone) updates.phone = phone?.trim() || null
      if (team_club_affiliation_id != null && existingProfile.team_club_affiliation_id !== team_club_affiliation_id) {
        updates.team_club_affiliation_id = team_club_affiliation_id || null
      }
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin
          .from('profiles')
          .update(updates)
          .eq('id', volunteerId)
      }
    } else {
      const password = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
      const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
        },
        body: JSON.stringify({
          email: emailNorm,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            team_club_affiliation_id: team_club_affiliation_id || null,
          },
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        console.error('Create user error:', err)
        return new Response(
          JSON.stringify({ error: 'Failed to create user', details: err }),
          { status: createRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const createData = await createRes.json()
      volunteerId = createData.id

      for (let i = 0; i < 20; i++) {
        const { data: p } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', volunteerId)
          .maybeSingle()
        if (p) break
        await new Promise((r) => setTimeout(r, 250))
      }

      const { error: profileUpsertError } = await supabaseAdmin.from('profiles').upsert({
        id: volunteerId,
        email: emailNorm,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        phone: phone?.trim() || null,
        role: 'volunteer',
        team_club_affiliation_id: team_club_affiliation_id || null,
      })

      if (profileUpsertError) {
        console.error('Profile upsert error:', profileUpsertError)
        return new Response(
          JSON.stringify({ error: 'Failed to create profile', details: profileUpsertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const { data: existingSignup, error: signupLookupError } = await supabaseAdmin
      .from('signups')
      .select('id, status')
      .eq('volunteer_id', volunteerId)
      .eq('role_id', role_id)
      .maybeSingle()

    if (signupLookupError) {
      return new Response(
        JSON.stringify({ error: 'Failed to check signup', details: signupLookupError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (existingSignup) {
      if (existingSignup.status === 'cancelled') {
        await supabaseAdmin
          .from('signups')
          .update({
            status: 'confirmed',
            phone: phone?.trim() || null,
            waiver_signed: false,
          })
          .eq('id', existingSignup.id)
      } else {
        return new Response(
          JSON.stringify({ error: 'This volunteer is already signed up for this role.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      const { error: signupInsertError } = await supabaseAdmin.from('signups').insert({
        role_id,
        volunteer_id: volunteerId,
        status: 'confirmed',
        phone: phone?.trim() || null,
        waiver_signed: false,
      })
      if (signupInsertError) {
        return new Response(
          JSON.stringify({ error: 'Failed to create signup', details: signupInsertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const roleName = roleRow?.name ?? 'Unknown role'
    const rolePositionsTotal = Number(roleRow?.positions_total) || 0
    const volunteerName = [first_name, last_name].filter(Boolean).join(' ').trim() || email
    const slackToken = Deno.env.get('SLACK_BOT_TOKEN')
    const slackChannel = Deno.env.get('SLACK_SIGNUP_CHANNEL_ID')
    if (slackToken && slackChannel) {
      try {
        const { count: roleSignups } = await supabaseAdmin
          .from('signups')
          .select('*', { count: 'exact', head: true })
          .eq('role_id', role_id)
          .eq('status', 'confirmed')
        const { count: totalSignups } = await supabaseAdmin
          .from('signups')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'confirmed')
        const { data: totalPositionsRows } = await supabaseAdmin
          .from('volunteer_roles')
          .select('positions_total')
        const totalPositions = (totalPositionsRows ?? []).reduce((sum, r) => sum + (Number(r.positions_total) || 0), 0)
        const roleFilled = `${roleSignups ?? 0}/${rolePositionsTotal || 1} of ${roleName} filled`
        const allFilled = `${totalSignups ?? 0}/${totalPositions || 1} of all volunteer roles filled!`
        const text = `:raising_hand: New volunteer signup: *${volunteerName}* (${email}) signed up for *${roleName}*.\n\n${roleFilled}\n${allFilled}`
        const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${slackToken}`,
          },
          body: JSON.stringify({ channel: slackChannel, text }),
        })
        if (!slackRes.ok) {
          const err = await slackRes.json().catch(() => ({}))
          console.error('Slack notify error:', slackRes.status, err)
        }
      } catch (slackErr) {
        console.error('Slack notify error:', slackErr)
      }
    }

    return new Response(
      JSON.stringify({ volunteerId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-volunteer-and-signup error:', err)
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
