/**
 * Creates a signup for a user who just registered (PII flow).
 * Callable without JWT. Only allows signup if the user was created in the last 2 minutes,
 * so only the client that just got user_id from signUp() can use it.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_AGE_SECONDS = 120 // 2 minutes

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { user_id, role_id, phone } = body

    if (!user_id || !role_id) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id or role_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Ensure user exists and was created very recently (proof that caller just did signUp)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
    })
    if (!userRes.ok) {
      return new Response(
        JSON.stringify({ error: 'User not found or invalid' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const authUser = await userRes.json()
    const createdAt = authUser?.created_at
    if (!createdAt) {
      return new Response(
        JSON.stringify({ error: 'Invalid user data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const created = new Date(createdAt).getTime()
    const now = Date.now()
    if (now - created > MAX_AGE_SECONDS * 1000) {
      return new Response(
        JSON.stringify({ error: 'Signup window expired. Please sign in and sign up for the role again.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Role must exist
    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from('volunteer_roles')
      .select('id')
      .eq('id', role_id)
      .single()
    if (roleError || !roleRow) {
      return new Response(
        JSON.stringify({ error: 'Role not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check existing signup
    const { data: existingSignup, error: signupLookupError } = await supabaseAdmin
      .from('signups')
      .select('id, status')
      .eq('volunteer_id', user_id)
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
            phone: phone != null ? String(phone).trim() || null : null,
            waiver_signed: false,
          })
          .eq('id', existingSignup.id)
      } else {
        return new Response(
          JSON.stringify({ error: 'Already signed up for this role.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      const { error: signupInsertError } = await supabaseAdmin.from('signups').insert({
        role_id,
        volunteer_id: user_id,
        status: 'confirmed',
        phone: phone != null ? String(phone).trim() || null : null,
        waiver_signed: false,
      })
      if (signupInsertError) {
        return new Response(
          JSON.stringify({ error: 'Failed to create signup', details: signupInsertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-signup-for-new-user error:', err)
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
