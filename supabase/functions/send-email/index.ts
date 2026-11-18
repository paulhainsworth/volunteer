import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface EmailRequest {
  to: string
  subject: string
  html: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonError('Method not allowed', 405)
    }
    const bearer = req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)
    if (!bearer) return jsonError('Authentication required', 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearer[1])
    if (authError || !user) return jsonError('Authentication required', 401)

    if (Deno.env.get('SEND_EMAIL_STAFF_ONLY') === 'true') {
      const { data: profile, error } = await supabase.from('profiles')
        .select('role').eq('id', user.id).maybeSingle()
      if (error || !['admin', 'volunteer_leader'].includes(profile?.role)) {
        return jsonError('Staff access required', 403)
      }
    }

    const { to, subject, html }: EmailRequest = await req.json()

    // Validate inputs
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Send email using Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Volunteer Manager <notifications@berkeleyomnium.com>',
        to: [to],
        subject: subject,
        html: html,
      }),
    })

    if (!res.ok) {
      console.error('Mail provider rejected delivery', { status: res.status })
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { 
          status: res.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const data = await res.json()

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch {
    console.error('Mail delivery did not complete')
    return new Response(
      JSON.stringify({ error: 'Failed to send email' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

