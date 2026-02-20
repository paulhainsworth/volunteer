/**
 * Sends a magic link email using our branded HTML (same layout as docs/magic-link-email-revised.html).
 * Used when a user requests a sign-in link from the login page (#/auth/login).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function escapeHref(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function buildMagicLinkHtml(actionLink: string): string {
  const href = escapeHref(actionLink)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Log in to 2026 Berkeley Omnium Volunteer Hub</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
    <tr>
      <td align="center">

        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;max-width:520px;width:100%;">
          <tr>
            <td style="background:#1a56b0;padding:24px 32px;text-align:center;">
              <div style="color:#ffffff;font-size:18px;font-weight:700;">2026 Berkeley Omnium</div>
              <div style="color:#b4d4f0;font-size:13px;margin-top:4px;">Volunteer Hub</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">Your login link</p>
              <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.5;">
                We received a request to log in. Click the button below to sign in — no password needed.
              </p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${href}"
                       style="display:inline-block;background:#1a56b0;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:12px 32px;">
                      Log In to Volunteer Hub
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:13px;color:#6b7280;text-align:center;">
                This link expires in 60 minutes and can only be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 24px;font-size:13px;color:#6b7280;line-height:1.5;">
              If you didn't request this link, you can safely ignore this email. Someone may have entered your email address by mistake.
            </td>
          </tr>
        </table>

        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <tr>
            <td style="padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">
              Sent by 2026 Berkeley Omnium Volunteer Hub, Berkeley CA
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`
}

interface RequestBody {
  to: string
  redirectTo: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' } })
  }

  try {
    const { to, redirectTo }: RequestBody = await req.json()

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

    const html = buildMagicLinkHtml(actionLink)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Volunteer Manager <notifications@berkeleyomnium.com>',
        to: [to],
        subject: 'Log in to 2026 Berkeley Omnium Volunteer Hub',
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
    console.error('send-magic-link error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
