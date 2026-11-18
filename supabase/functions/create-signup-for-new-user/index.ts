import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function response(status: number, body: object) {
  return new Response(JSON.stringify(body), { status, headers })
}

// Compatibility endpoint for older clients. The RPC uses the authenticated
// subject and requires a current recorded waiver before confirming a seat.
serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' })

  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) return response(401, { error: 'Sign in before confirming your signup' })

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_ANON_KEY')!
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return response(401, { error: 'Sign in before confirming your signup' })

  const body = await request.json().catch(() => null)
  if (typeof body?.role_id !== 'string') return response(400, { error: 'A volunteer role is required' })

  const { error: signupError } = await client.rpc('confirm_volunteer_signup', {
    p_role_id: body.role_id,
    p_phone: typeof body.phone === 'string' ? body.phone : null,
  })
  if (signupError) return response(409, { error: signupError.message })
  return response(200, { ok: true })
})
