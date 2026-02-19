import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const user = await userRes.json()
    if (!user?.id) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { domainId, first_name, last_name, email, phone } = body
    if (!domainId || !first_name || !last_name || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: domainId, first_name, last_name, email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let leaderId: string

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingProfile) {
      leaderId = existingProfile.id
      await supabaseAdmin
        .from('profiles')
        .update({
          first_name,
          last_name,
          phone: phone || null,
          role: 'volunteer_leader',
          updated_at: new Date().toISOString(),
        })
        .eq('id', leaderId)
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
          email: email.toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: {
            first_name,
            last_name,
            role: 'volunteer_leader',
            phone: phone || '',
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
      leaderId = createData.id

      for (let i = 0; i < 15; i++) {
        const { data: p } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', leaderId)
          .maybeSingle()
        if (p) break
        await new Promise((r) => setTimeout(r, 300))
      }
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('volunteer_leader_domains')
      .update({ leader_id: leaderId, updated_at: new Date().toISOString() })
      .eq('id', domainId)
      .select()
      .maybeSingle()

    if (updateError) {
      console.error('Update domain error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to assign leader', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!updated) {
      return new Response(
        JSON.stringify({ error: 'Domain not found or cannot be updated' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, userId: leaderId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-leader error:', err)
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
