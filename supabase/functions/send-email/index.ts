import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildVolunteerMail, isVolunteerNotification } from './volunteer-templates.ts'

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

function jsonSuccess(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ success: true, ...body }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function deliverEmail(to: string, subject: string, html: string) {
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Volunteer Manager <notifications@berkeleyomnium.com>',
      to: [to], subject, html,
    }),
  })
  if (!result.ok) {
    console.error('Mail provider rejected delivery', { status: result.status })
    return { status: result.status }
  }
  const data = await result.json()
  return { id: data.id }
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

    const body = await req.json()
    if (body.notification !== undefined) {
      const { kind, reference } = body.notification ?? {}
      if (!isVolunteerNotification(kind) || (kind !== 'guardian_waiver' &&
          (typeof reference !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(reference)))) {
        return jsonError('Invalid volunteer notification', 400)
      }
      const { data: notice, error } = await supabase.rpc('claim_volunteer_mail', {
        p_volunteer: user.id,
        p_kind: kind,
        p_reference: kind === 'guardian_waiver' ? null : reference,
      })
      if (error) return jsonError('Failed to prepare volunteer notification', 500)
      if (!notice) return jsonSuccess({ skipped: true })
      const { recipients, subject, html } = buildVolunteerMail(kind, notice)
      const deliveries = await Promise.allSettled(recipients.map((to) => deliverEmail(to, subject, html)))
      if (deliveries.some((delivery) => delivery.status === 'rejected' || delivery.value.status)) {
        return jsonError('Failed to send one or more notifications', 502)
      }
      return jsonSuccess({})
    }

    if (Deno.env.get('SEND_EMAIL_STAFF_ONLY') !== 'false') {
      const { data: profile, error } = await supabase.from('profiles')
        .select('role').eq('id', user.id).maybeSingle()
      if (error || !['admin', 'volunteer_leader'].includes(profile?.role)) {
        return jsonError('Staff access required', 403)
      }
    }

    const { to, subject, html } = body
    if ([to, subject, html].some((value) => typeof value !== 'string' || !value.trim())) {
      return jsonError('Missing required fields: to, subject, html', 400)
    }

    const delivery = await deliverEmail(to, subject, html)
    if (delivery.status) return jsonError('Failed to send email', delivery.status)
    return jsonSuccess({ id: delivery.id })
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

