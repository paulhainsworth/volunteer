/**
 * Public signup for Kids Clinic + Race: validate, persist, send Resend confirmation.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Same verified sender as send-magic-link (Resend requires a verified domain + address). */
const RESEND_FROM = 'Volunteer Manager <notifications@berkeleyomnium.com>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WAIVER_VERSION = 'USAC-Base-2024-Rev-5-2024'

const GENDERS = new Set(['girl', 'boy', 'non_binary', 'prefer_not_to_say'])

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function buildConfirmationHtml(parentFirst: string, childName: string): string {
  const greeting = escapeHtml(parentFirst.trim() || 'there')
  const child = escapeHtml(childName.trim())
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;max-width:560px;width:100%;">
        <tr>
          <td style="background:#1a56b0;padding:24px 28px;text-align:center;">
            <div style="color:#ffffff;font-size:18px;font-weight:700;">2026 Berkeley Omnium</div>
            <div style="color:#b4d4f0;font-size:13px;margin-top:4px;">Kids Clinic + Race</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 24px;">
            <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111827;">Thank you for signing up ${child}!</p>
            <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.55;">
              Hi ${greeting}, we received your waiver and registration. We’re looking forward to seeing ${child} at the event.
            </p>
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Event</p>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.5;">
              <strong>2026 Berkeley Omnium Kids Clinic + Race</strong><br />
              Sunday, April 19, 2026<br />
              Ohlone Park (McGee/Hearst), Berkeley
            </p>
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Schedule</p>
            <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#374151;line-height:1.5;">
              <li><strong>11:00am – 11:45am</strong> — Kids play and skills clinic hosted by Trek. Bring a bike and helmet.</li>
              <li><strong>11:45am – 11:55am</strong> — Kids race with medals and podiums for winners.</li>
              <li><strong>12:00pm</strong> — Free ice cream post clinic and race for the kids (while supplies last) by Mr. Dewie’s Cashew Ice Cream.</li>
            </ul>
            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">
              Questions? Contact <a href="mailto:berkeleyomnium@gmail.com" style="color:#1a56b0;">berkeleyomnium@gmail.com</a>
              · <a href="https://berkeleybikeclub.org/races" style="color:#1a56b0;">berkeleybikeclub.org/races</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const parent_first_name = String(body?.parent_first_name ?? '').trim()
    const parent_last_name = String(body?.parent_last_name ?? '').trim()
    const parent_email = String(body?.parent_email ?? '').trim().toLowerCase()
    const child_name = String(body?.child_name ?? '').trim()
    const child_gender = String(body?.child_gender ?? '').trim()
    const child_age = Number(body?.child_age)
    const waiver_consent = Boolean(body?.waiver_consent)

    if (!parent_first_name || !parent_last_name) {
      return new Response(JSON.stringify({ error: 'Parent first and last name are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!isValidEmail(parent_email)) {
      return new Response(JSON.stringify({ error: 'A valid parent email is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!child_name) {
      return new Response(JSON.stringify({ error: "Child's name is required." }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!GENDERS.has(child_gender)) {
      return new Response(JSON.stringify({ error: 'Please select a valid gender option.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!Number.isFinite(child_age) || child_age < 1 || child_age > 17) {
      return new Response(JSON.stringify({ error: 'Child age must be between 1 and 17.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!waiver_consent) {
      return new Response(JSON.stringify({ error: 'You must consent to the waiver to sign up.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { error: insertError } = await supabase.from('kids_clinic_signups').insert({
      parent_first_name,
      parent_last_name,
      parent_email,
      child_name,
      child_gender,
      child_age: Math.round(child_age),
      waiver_version: WAIVER_VERSION,
      waiver_consent: true,
    })

    if (insertError) {
      console.error('[submit-kids-clinic-signup] insert error:', insertError)
      return new Response(JSON.stringify({ error: 'Could not save signup. Please try again later.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Read at request time (matches Supabase secrets injection; avoids stale top-level reads).
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim()
    let emailSent = false

    if (!resendKey) {
      console.warn('[submit-kids-clinic-signup] RESEND_API_KEY missing or empty; skipping email.')
    } else {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [parent_email],
          subject: 'Kids Clinic signup confirmed — 2026 Berkeley Omnium',
          html: buildConfirmationHtml(parent_first_name, child_name),
        }),
      })

      const raw = await res.text()
      if (!res.ok) {
        let detail = raw
        try {
          const j = JSON.parse(raw) as { message?: string; name?: string }
          detail = [j?.name, j?.message, raw].filter(Boolean).join(' | ')
        } catch {
          /* keep raw */
        }
        console.error('[submit-kids-clinic-signup] Resend failed', {
          status: res.status,
          to: parent_email,
          detail,
        })
      } else {
        try {
          const j = JSON.parse(raw) as { id?: string }
          console.log('[submit-kids-clinic-signup] Resend ok', { id: j?.id ?? null, to: parent_email })
          emailSent = Boolean(j?.id)
        } catch {
          console.error('[submit-kids-clinic-signup] Resend 200 but body not JSON:', raw.slice(0, 500))
        }
        if (res.ok && !emailSent) {
          // Rare: treat HTTP 2xx as sent even if id missing
          emailSent = true
        }
      }
    }

    return new Response(JSON.stringify({ success: true, emailSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[submit-kids-clinic-signup]', e)
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
