/**
 * Sends the welcome email with a magic link so the user can sign in with one click.
 * Uses Supabase Admin to generate the link (server-side only).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  to: string
  first_name: string
  /** Full URL to redirect after sign-in (e.g. https://example.com/#/volunteer). Must be in Supabase redirect allow list. */
  redirectTo: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, first_name, redirectTo }: RequestBody = await req.json()

    if (!to || !redirectTo) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, redirectTo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: to,
      options: { redirectTo },
    })

    if (linkError) {
      console.error('generateLink error:', linkError)
      return new Response(
        JSON.stringify({ error: 'Failed to generate magic link', details: linkError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Response shape: { properties: { action_link }, user, ... } or top-level action_link
    const actionLink =
      (linkData as { action_link?: string })?.action_link ??
      (linkData as { properties?: { action_link?: string } })?.properties?.action_link

    if (!actionLink) {
      console.error('No action_link in generateLink response:', linkData)
      return new Response(
        JSON.stringify({ error: 'Magic link not returned' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const firstName = first_name?.trim() || 'there'
    const baseUrl = redirectTo.split('#')[0]
    const browseUrl = `${baseUrl}#/volunteer`

    const html = `
      <h2>Welcome to Berkeley Omnium 2026!</h2>
      <p>Hi ${firstName},</p>
      <p>Thanks for signing up to volunteer. We're excited to have you.</p>
      <p><strong>To return to the volunteer site:</strong></p>
      <p><a href="${actionLink}">Click here to sign in</a> — one click, no password needed.</p>
      <p>Or <a href="${browseUrl}">browse volunteer opportunities</a> (you can sign in when you're ready to manage your signups).</p>
      <p>– Berkeley Omnium Volunteer Team</p>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Volunteer Manager <notifications@berkeleyomnium.com>',
        to: [to],
        subject: 'Welcome to 2026 Berkeley Omnium',
        html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Resend API error:', errText)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errText }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await res.json()
    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('send-welcome-with-magic-link error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
