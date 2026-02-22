/**
 * Posts a message to a Slack channel when a volunteer signs up for a role.
 * Uses Slack Web API (chat.postMessage) with a bot token — works on free Slack.
 * Requires: SLACK_BOT_TOKEN (xoxb-...), SLACK_SIGNUP_CHANNEL_ID (channel ID or name, e.g. C01234 or #volunteer-signups).
 */
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
    const slackToken = Deno.env.get('SLACK_BOT_TOKEN')
    const slackChannel = Deno.env.get('SLACK_SIGNUP_CHANNEL_ID')

    if (!slackToken || !slackChannel) {
      console.error('SLACK_BOT_TOKEN or SLACK_SIGNUP_CHANNEL_ID is not set')
      return new Response(
        JSON.stringify({ error: 'Slack not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    const body = await req.json() as {
      role_id: string
      role_name?: string
      volunteer_id?: string
      volunteer_name?: string
      volunteer_email?: string
    }

    const { role_id, role_name, volunteer_id, volunteer_name, volunteer_email } = body
    if (!role_id) {
      return new Response(
        JSON.stringify({ error: 'Missing role_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let roleName = role_name
    let rolePositionsTotal = 0
    const { data: roleRow } = await supabaseAdmin
      .from('volunteer_roles')
      .select('name, positions_total')
      .eq('id', role_id)
      .single()
    if (roleRow) {
      roleName = roleName ?? roleRow.name ?? 'Unknown role'
      rolePositionsTotal = Number(roleRow.positions_total) || 0
    } else if (!roleName) {
      roleName = 'Unknown role'
    }

    const { count: roleSignups } = await supabaseAdmin
      .from('signups')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', role_id)
      .eq('status', 'confirmed')

    const { count: totalSignups } = await supabaseAdmin
      .from('signups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'confirmed')

    const { data: totalPositionsRow } = await supabaseAdmin
      .from('volunteer_roles')
      .select('positions_total')
    const totalPositions = (totalPositionsRow ?? []).reduce((sum, r) => sum + (Number(r.positions_total) || 0), 0)

    let name = volunteer_name
    let email = volunteer_email
    if (volunteer_id && (!name || !email)) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', volunteer_id)
        .single()
      if (profile) {
        name = name ?? ([profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email)
        email = email ?? (profile.email ?? '')
      }
    }

    const displayName = (name && name.trim()) ? name.trim() : (email || 'A volunteer')
    const displayEmail = email ? ` (${email})` : ''

    const roleFilled = `${roleSignups ?? 0}/${rolePositionsTotal || 1} of ${roleName} filled`
    const allFilled = `${totalSignups ?? 0}/${totalPositions || 1} of all volunteer roles filled!`
    const text = `:raising_hand: New volunteer signup: *${displayName}*${displayEmail} signed up for *${roleName}*.\n\n${roleFilled}\n${allFilled}`

    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${slackToken}`,
      },
      body: JSON.stringify({ channel: slackChannel, text }),
    })

    const slackData = await slackRes.json().catch(() => ({}))
    if (!slackRes.ok || !slackData.ok) {
      console.error('Slack API error:', slackRes.status, slackData)
      return new Response(
        JSON.stringify({ error: 'Failed to post to Slack', details: slackData.error ?? slackRes.statusText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('notify-slack-signup error:', err)
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
