import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL = Deno.env.get('DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PACIFIC_TZ = 'America/Los_Angeles'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch (_) {
    return null
  }
}

function isAuthorizedServiceRoleToken(token: string) {
  if (!token) return false
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true
  const payload = decodeJwtPayload(token)
  if (!payload) return false
  const expectedRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  return payload.role === 'service_role' && payload.ref === expectedRef
}

type SummaryMetrics = {
  summary_date: string
  yesterday_signups: number
  critical_roles_with_signup_yesterday: number
  open_role_count: number
  open_spots: number
  open_critical_role_count: number
  open_critical_spots: number
}

type OpenCriticalRole = {
  id: string
  name: string
  event_date: string | null
  completion_month: string | null
  positions_total: number
  critical_positions_required: number
  positions_filled: number
  overall_open_spots: number
  open_spots: number
}

function getCriticalPositionsRequired(role: { positions_total?: number | null; critical_positions_required?: number | null; critical?: boolean | null }) {
  const positionsTotal = Math.max(Number(role.positions_total) || 0, 0)

  if (role.critical_positions_required !== undefined && role.critical_positions_required !== null) {
    return Math.min(Math.max(Number(role.critical_positions_required) || 0, 0), positionsTotal)
  }

  return role.critical ? positionsTotal : 0
}

function getCriticalOpenSpots(role: { positions_total?: number | null; critical_positions_required?: number | null; critical?: boolean | null; positions_filled?: number | null }) {
  return Math.max(getCriticalPositionsRequired(role) - (Number(role.positions_filled) || 0), 0)
}

function getPacificParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
  }
}

function toPacificDateString(date = new Date()) {
  const { year, month, day } = getPacificParts(date)
  return `${year}-${month}-${day}`
}

function toPacificHour(date = new Date()) {
  return Number(getPacificParts(date).hour)
}

function toPacificDateStringFromIso(isoString: string | null | undefined) {
  if (!isoString) return ''
  return toPacificDateString(new Date(isoString))
}

function formatEventDate(dateString: string | null) {
  if (!dateString) return 'TBD'
  const parsed = new Date(`${dateString}T12:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function formatRoleScheduleLabel(role: { event_date?: string | null; completion_month?: string | null }) {
  if (role.event_date) return formatEventDate(role.event_date)
  if (role.completion_month) {
    const parsed = new Date(`${role.completion_month}T12:00:00.000Z`)
    return new Intl.DateTimeFormat('en-US', {
      timeZone: PACIFIC_TZ,
      month: 'short',
      year: 'numeric',
    }).format(parsed)
  }
  return 'Flexible'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmailHtml(metrics: SummaryMetrics, roles: OpenCriticalRole[]) {
  const roleItems = roles.length
    ? roles
        .map((role) => {
          const dateLabel = formatRoleScheduleLabel(role)
          return `
            <li style="margin: 0 0 12px;">
              <strong>${escapeHtml(role.name)}</strong> (${escapeHtml(dateLabel)}): ${role.open_spots} critical spots still open out of ${role.critical_positions_required} required
            </li>
          `
        })
        .join('')
    : '<li style="margin: 0 0 12px;">All critical roles are currently filled.</li>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily Volunteer Summary</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;max-width:620px;width:100%;">
          <tr>
            <td style="background:#1a56b0;padding:24px 32px;text-align:center;">
              <div style="color:#ffffff;font-size:20px;font-weight:700;">2026 Berkeley Omnium</div>
              <div style="color:#dbeafe;font-size:14px;margin-top:4px;">Daily volunteer summary</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;font-size:16px;color:#111827;line-height:1.6;">
                Good morning. Here is your volunteer signup snapshot for <strong>${escapeHtml(metrics.summary_date)}</strong> and the current state of unfilled roles.
              </p>

              <div style="background:#f8fafc;border:1px solid #e5e7eb;padding:20px 24px;margin-bottom:24px;">
                <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">Yesterday's activity</h2>
                <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
                  <li>${metrics.yesterday_signups} volunteer signups yesterday</li>
                  <li>${metrics.critical_roles_with_signup_yesterday} critical roles received at least one signup yesterday</li>
                  <li>${metrics.open_spots} volunteer spots still need to be filled across ${metrics.open_role_count} roles</li>
                  <li>${metrics.open_critical_spots} critical spots still need to be filled across ${metrics.open_critical_role_count} roles</li>
                </ul>
              </div>

              <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">Critical roles still needing volunteers</h2>
              <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
                ${roleItems}
              </ul>

              <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;color:#6b7280;">
                Sent automatically at 8am Pacific by the Berkeley Omnium Volunteer Hub.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildSlackPayload(metrics: SummaryMetrics, roles: OpenCriticalRole[]) {
  const summaryDateLabel = formatEventDate(metrics.summary_date)
  const roleLines = roles.length
    ? roles.map((role) => `• *${role.name}* (${formatRoleScheduleLabel(role)}): ${role.open_spots} critical spots still open out of ${role.critical_positions_required} required`)
    : ['• All critical roles are currently filled']

  return {
    text: `Daily volunteer summary for ${summaryDateLabel}: ${metrics.open_critical_spots} critical spots to fill across ${metrics.open_critical_role_count} roles.`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Daily volunteer summary: ${summaryDateLabel}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Yesterday's activity*\n` +
            `• ${metrics.yesterday_signups} volunteer signups yesterday\n` +
            `• ${metrics.critical_roles_with_signup_yesterday} critical roles received at least one signup yesterday\n` +
            `• ${metrics.open_spots} volunteer spots still need to be filled across ${metrics.open_role_count} roles\n` +
            `• ${metrics.open_critical_spots} critical spots still need to be filled across ${metrics.open_critical_role_count} roles`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Critical roles still needing volunteers*\n${roleLines.join('\n')}`,
        },
      },
    ],
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch (_) {
    return String(error)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!isAuthorizedServiceRoleToken(token)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY secret' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const body = await req.json().catch(() => ({}))
    const force = body?.force === true
    const source = body?.source || 'cron'

    const { data: digestSettings, error: digestSettingsErr } = await supabaseAdmin
      .from('email_digest_settings')
      .select('admin_daily_volunteer_summary_enabled')
      .eq('id', 1)
      .maybeSingle()

    if (digestSettingsErr) {
      console.error('send-daily-admin-summary: email_digest_settings lookup failed', digestSettingsErr)
    }

    const adminSummaryEnabled = digestSettings?.admin_daily_volunteer_summary_enabled !== false

    if (!adminSummaryEnabled) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason:
            'Daily volunteer summary is disabled (Admin → Communications: automated admin summary email).',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const now = new Date()
    const pacificHour = toPacificHour(now)

    if (!force && pacificHour !== 8) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Not in the 8am Pacific hour' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const summaryDate = toPacificDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))

    const { data: existingRun, error: existingRunError } = await supabaseAdmin
      .from('admin_daily_summary_runs')
      .select('summary_date, status')
      .eq('summary_date', summaryDate)
      .maybeSingle()

    if (existingRunError) throw existingRunError

    if (existingRun?.status === 'sent' && !force) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Summary already sent for this Pacific date' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (existingRun?.status === 'processing' && !force) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Summary already processing' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (existingRun) {
      const { error: updateRunError } = await supabaseAdmin
        .from('admin_daily_summary_runs')
        .update({
          status: 'processing',
          run_started_at: now.toISOString(),
          sent_at: null,
          error: null,
          run_source: source,
          metrics: null,
        })
        .eq('summary_date', summaryDate)
      if (updateRunError) throw updateRunError
    } else {
      const { error: insertRunError } = await supabaseAdmin
        .from('admin_daily_summary_runs')
        .insert({
          summary_date: summaryDate,
          status: 'processing',
          run_started_at: now.toISOString(),
          run_source: source,
        })
      if (insertRunError) throw insertRunError
    }

    const { data: admins, error: adminsError } = await supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('role', 'admin')
      .not('email', 'is', null)

    if (adminsError) throw adminsError

    if (!admins || admins.length === 0) {
      throw new Error('No admin recipients found')
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('volunteer_roles')
      .select('id, name, event_date, completion_month, positions_total, critical, critical_positions_required')

    if (rolesError) throw rolesError

    const roleIds = (roles || []).map((role) => role.id)
    const countByRole: Record<string, number> = {}

    if (roleIds.length > 0) {
      const { data: confirmedSignups, error: confirmedSignupsError } = await supabaseAdmin
        .from('signups')
        .select('role_id')
        .eq('status', 'confirmed')
        .in('role_id', roleIds)

      if (confirmedSignupsError) throw confirmedSignupsError

      for (const signup of confirmedSignups || []) {
        countByRole[signup.role_id] = (countByRole[signup.role_id] || 0) + 1
      }
    }

    const recentSince = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
    const { data: recentSignups, error: recentSignupsError } = await supabaseAdmin
      .from('signups')
      .select(`
        role_id,
        signed_up_at,
        status,
        role:volunteer_roles!role_id(
          id,
          critical,
          critical_positions_required,
          positions_total
        )
      `)
      .gte('signed_up_at', recentSince)

    if (recentSignupsError) throw recentSignupsError

    const yesterdayConfirmedSignups = (recentSignups || []).filter((signup) => {
      if (signup.status !== 'confirmed') return false
      return toPacificDateStringFromIso(signup.signed_up_at) === summaryDate
    })

    const criticalRoleIdsYesterday = new Set(
      yesterdayConfirmedSignups
        .filter((signup) => {
          const role = Array.isArray(signup.role) ? signup.role[0] : signup.role
          return getCriticalPositionsRequired(role || {}) > 0
        })
        .map((signup) => signup.role_id)
    )

    const rolesWithCounts = (roles || []).map((role) => {
      const positionsFilled = countByRole[role.id] || 0
      const criticalOpenSpots = getCriticalOpenSpots({
        ...role,
        positions_filled: positionsFilled,
      })
      const overallOpenSpots = Math.max((role.positions_total || 0) - positionsFilled, 0)
      return {
        ...role,
        critical_positions_required: getCriticalPositionsRequired(role),
        positions_filled: positionsFilled,
        overall_open_spots: overallOpenSpots,
        open_spots: criticalOpenSpots,
      }
    })

    const openRoles = rolesWithCounts.filter((role) => role.overall_open_spots > 0)
    const openCriticalRoles = openRoles
      .filter((role) => role.open_spots > 0)
      .sort((a, b) => {
        if (b.open_spots !== a.open_spots) return b.open_spots - a.open_spots
        const sa = `${a.event_date || ''}|${a.completion_month || ''}`
        const sb = `${b.event_date || ''}|${b.completion_month || ''}`
        if (sa !== sb) return sa.localeCompare(sb)
        return a.name.localeCompare(b.name)
      })

    const openSpots = openRoles.reduce((sum, role) => sum + role.overall_open_spots, 0)
    const openCriticalSpots = openCriticalRoles.reduce((sum, role) => sum + role.open_spots, 0)

    const metrics: SummaryMetrics = {
      summary_date: summaryDate,
      yesterday_signups: yesterdayConfirmedSignups.length,
      critical_roles_with_signup_yesterday: criticalRoleIdsYesterday.size,
      open_role_count: openRoles.length,
      open_spots: openSpots,
      open_critical_role_count: openCriticalRoles.length,
      open_critical_spots: openCriticalSpots,
    }

    const subjectDate = formatEventDate(summaryDate)
    const subject = `Daily volunteer summary for ${subjectDate}`
    const html = buildEmailHtml(metrics, openCriticalRoles)

    for (let index = 0; index < admins.length; index += 1) {
      const admin = admins[index]
      const adminName = [admin.first_name, admin.last_name].filter(Boolean).join(' ').trim()
      const personalizedHtml = adminName
        ? html.replace(
            'Good morning. Here is your volunteer signup snapshot',
            `Good morning ${escapeHtml(adminName)}. Here is your volunteer signup snapshot`
          )
        : html

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Volunteer Manager <notifications@berkeleyomnium.com>',
          to: [admin.email],
          subject,
          html: personalizedHtml,
        }),
      })

      if (!resendResponse.ok) {
        const resendError = await resendResponse.text()
        throw new Error(`Failed to send email to ${admin.email}: ${resendError}`)
      }

      // Resend allows 5 requests/second on the current plan; keep comfortably below that.
      if (index < admins.length - 1) {
        await sleep(250)
      }
    }

    if (DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL) {
      const slackResponse = await fetch(DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildSlackPayload(metrics, openCriticalRoles)),
      })

      if (!slackResponse.ok) {
        const slackError = await slackResponse.text()
        throw new Error(`Failed to post daily summary to Slack: ${slackError}`)
      }
    }

    const { error: markSentError } = await supabaseAdmin
      .from('admin_daily_summary_runs')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        run_source: source,
        metrics,
        error: null,
      })
      .eq('summary_date', summaryDate)

    if (markSentError) throw markSentError

    return new Response(JSON.stringify({ success: true, metrics, recipients: admins.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in send-daily-admin-summary:', error)
    const now = new Date()
    const summaryDate = toPacificDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))

    await supabaseAdmin
      .from('admin_daily_summary_runs')
      .upsert({
        summary_date: summaryDate,
        status: 'failed',
        run_started_at: now.toISOString(),
        error: getErrorMessage(error),
      })

    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
