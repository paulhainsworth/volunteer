import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsPDF } from 'https://esm.sh/jspdf@3.0.4'
import autoTable from 'https://esm.sh/jspdf-autotable@5.0.7?deps=jspdf@3.0.4'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PACIFIC_TZ = 'America/Los_Angeles'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Beneficiary = { label: string; affiliationNames: string[] }

const NICA_BENEFICIARIES: Beneficiary[] = [
  { label: 'Albany', affiliationNames: ['Albany', 'Albany High School Mountain Bike Team'] },
  { label: 'Berkeley', affiliationNames: ['Berkeley', 'Berkeley Mountain Bike Association'] },
  { label: 'El Cerrito', affiliationNames: ['El Cerrito', 'El Cerrito High School'] },
  { label: 'Oakland Composite', affiliationNames: ['Oakland Composite'] },
  { label: 'Oakland Technical', affiliationNames: ['Oakland Technical', 'Oakland Technical High School MTB'] },
  { label: 'Skyline', affiliationNames: ['Skyline', 'Skyline High School Mountain Bike Team'] },
]

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
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') }
}

function toPacificDateString(date = new Date()) {
  const { year, month, day } = getPacificParts(date)
  return `${year}-${month}-${day}`
}

function toPacificHour(date = new Date()) {
  return Number(getPacificParts(date).hour)
}

function isFlexibleTime(role: { start_time?: string | null; end_time?: string | null } | null) {
  if (!role) return false
  const start = String(role.start_time || '').trim().toLowerCase()
  const end = String(role.end_time || '').trim().toLowerCase()
  if (start === 'flexible' || end === 'flexible') return true
  const ns = (t: string) => (t.startsWith('00:00') ? '00:00' : t)
  return ns(String(role.start_time || '')) === '00:00' && ns(String(role.end_time || '')) === '00:00'
}

function formatEventDateShort(dateString: string) {
  if (!dateString) return 'TBD'
  const d = new Date(`${dateString}T12:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

function hoursForSignup(signup: { role?: { start_time?: string; end_time?: string } | null }) {
  const role = signup?.role
  if (!role) return 0
  if (isFlexibleTime(role)) return 0
  const start = new Date(`2000-01-01 ${role.start_time}`)
  const end = new Date(`2000-01-01 ${role.end_time}`)
  return Math.round(((end.getTime() - start.getTime()) / (1000 * 60 * 60)) * 100) / 100
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function beneficiaryForAffiliationName(
  affName: string,
  beneficiaries: Beneficiary[],
): Beneficiary | null {
  return beneficiaries.find((b) => b.affiliationNames.includes(affName)) ?? null
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function buildPdfBase64(
  beneficiaryLabel: string,
  tableBody: string[][],
  summary: { totalVolunteers: number; totalRoles: number; totalHours: number },
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const sideMargin = 28
  const tableWidth = pageW - sideMargin * 2
  const col = (f: number) => Math.floor(tableWidth * f)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(`2026 Berkeley Omnium — ${beneficiaryLabel} Volunteers`, pageW / 2, 42, { align: 'center' })

  const head = [[
    'email',
    'first_name',
    'last_name',
    'phone',
    'team_club_affiliation',
    'signed_up_role',
    'event_date',
    'hours',
  ]]

  let finalY = 90
  if (tableBody.length) {
    const c0 = col(0.17)
    const c1 = col(0.09)
    const c2 = col(0.09)
    const c3 = col(0.11)
    const c4 = col(0.14)
    const c5 = col(0.21)
    const c6 = col(0.1)
    const c7 = tableWidth - c0 - c1 - c2 - c3 - c4 - c5 - c6
    autoTable(doc, {
      startY: 56,
      margin: { left: sideMargin, right: sideMargin },
      tableWidth,
      head,
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [246, 248, 250], textColor: [36, 41, 47], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: c0 },
        1: { cellWidth: c1 },
        2: { cellWidth: c2 },
        3: { cellWidth: c3 },
        4: { cellWidth: c4 },
        5: { cellWidth: c5 },
        6: { cellWidth: c6 },
        7: { cellWidth: c7 },
      },
    })
    finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(80, 86, 94)
    doc.text(
      'No volunteers with this team affiliation and at least one confirmed signup.',
      pageW / 2,
      68,
      { align: 'center' },
    )
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
  }

  const summaryTableW = Math.min(420, tableWidth)
  autoTable(doc, {
    startY: finalY + 18,
    margin: { left: sideMargin, right: sideMargin },
    tableWidth: summaryTableW,
    body: [
      ['Total Volunteers', 'Roles', 'Volunteer hours'],
      [
        String(summary.totalVolunteers),
        String(summary.totalRoles),
        summary.totalHours.toFixed(2),
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: summaryTableW / 3 },
      1: { cellWidth: summaryTableW / 3 },
      2: { cellWidth: summaryTableW / 3 },
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    didParseCell(data: { section: string; row: { index: number }; cell: { styles: Record<string, unknown> } }) {
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [246, 248, 250]
      }
    },
  })

  const out = doc.output('arraybuffer') as ArrayBuffer
  return arrayBufferToBase64(out)
}

function sanitizeFilenamePart(label: string) {
  return String(label).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

type ProfileRow = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: string | null
  team_club_affiliation_id: string | null
  signups: Array<{
    id: string
    status: string
    role: { id: string; name: string; event_date: string; start_time: string; end_time: string } | null
  }> | null
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
    const now = new Date()
    const pacificHour = toPacificHour(now)

    if (!force && pacificHour !== 8) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Not in the 8am Pacific hour' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const todayPacific = toPacificDateString(now)

    const { data: affiliations, error: affErr } = await supabaseAdmin
      .from('team_club_affiliations')
      .select('id, name')

    if (affErr) throw affErr

    const affById = new Map((affiliations || []).map((a) => [a.id, a.name]))

    const { data: coaches, error: coachesErr } = await supabaseAdmin
      .from('nica_coaches')
      .select('id, email, first_name, last_name, team_club_affiliation_id, email_end_date')
      .gte('email_end_date', todayPacific)

    if (coachesErr) throw coachesErr

    if (!coaches?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No active coaches' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0
    const errors: string[] = []

    for (let i = 0; i < coaches.length; i++) {
      const coach = coaches[i]!
      try {
        const { data: already } = await supabaseAdmin
          .from('nica_coach_digest_runs')
          .select('coach_id')
          .eq('coach_id', coach.id)
          .eq('pacific_date', todayPacific)
          .maybeSingle()

        if (already && !force) {
          continue
        }

        const affName = affById.get(coach.team_club_affiliation_id) || ''
        const beneficiary = beneficiaryForAffiliationName(affName, NICA_BENEFICIARIES)
        if (!beneficiary) {
          errors.push(`Coach ${coach.email}: affiliation not in NICA list`)
          continue
        }

        const matchingIds = (affiliations || [])
          .filter((a) => beneficiary.affiliationNames.includes(a.name))
          .map((a) => a.id)

        if (matchingIds.length === 0) {
          errors.push(`Coach ${coach.email}: no matching affiliation ids`)
          continue
        }

        const { data: profiles, error: profErr } = await supabaseAdmin
          .from('profiles')
          .select(`
            id, email, first_name, last_name, phone, role, team_club_affiliation_id,
            signups:signups!volunteer_id(
              id, status,
              role:volunteer_roles!role_id(id, name, event_date, start_time, end_time)
            )
          `)
          .in('team_club_affiliation_id', matchingIds)
          .in('role', ['volunteer', 'volunteer_leader'])

        if (profErr) throw profErr

        const exportRows: Array<{
          email: string
          first_name: string
          last_name: string
          phone: string
          team: string
          roleName: string
          eventDate: string
          hoursDisplay: string
          hours: number
        }> = []

        for (const v of (profiles || []) as ProfileRow[]) {
          if (v.role !== 'volunteer' && v.role !== 'volunteer_leader') continue
          const teamName = affiliations?.find((a) => a.id === v.team_club_affiliation_id)?.name || ''
          for (const s of v.signups || []) {
            const r = s.role && Array.isArray(s.role) ? s.role[0] : s.role
            if (s.status !== 'confirmed' || !r) continue
            const signup = { role: r }
            const flex = isFlexibleTime(r)
            const h = hoursForSignup(signup)
            exportRows.push({
              email: v.email || '',
              first_name: v.first_name || '',
              last_name: v.last_name || '',
              phone: v.phone != null && v.phone !== '' ? String(v.phone) : '',
              team: teamName,
              roleName: r.name || '',
              eventDate: r.event_date || '',
              hoursDisplay: flex ? '—' : (Number.isFinite(h) ? String(h) : '0'),
              hours: Number.isFinite(h) ? h : 0,
            })
          }
        }

        exportRows.sort((a, b) => {
          const ln = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: 'base' })
          if (ln !== 0) return ln
          const fn = a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' })
          if (fn !== 0) return fn
          const d = a.eventDate.localeCompare(b.eventDate)
          if (d !== 0) return d
          return a.roleName.localeCompare(b.roleName, undefined, { sensitivity: 'base' })
        })

        const distinctEmails = new Set(exportRows.map((r) => r.email.toLowerCase().trim()).filter(Boolean))
        const totalVolunteers = distinctEmails.size
        const totalRoles = exportRows.length
        const totalHours = Math.round(exportRows.reduce((sum, r) => sum + r.hours, 0) * 100) / 100

        const tableBody = exportRows.map((r) => [
          r.email,
          r.first_name,
          r.last_name,
          r.phone,
          r.team,
          r.roleName,
          formatEventDateShort(r.eventDate),
          r.hoursDisplay,
        ])

        const pdfBase64 = buildPdfBase64(beneficiary.label, tableBody, {
          totalVolunteers,
          totalRoles,
          totalHours,
        })

        const pdfName = `2026-Omnium-${sanitizeFilenamePart(beneficiary.label)}-Volunteers.pdf`
        const coachName = [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim()
        const dateLabel = formatEventDateShort(todayPacific)

        const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e7eb;max-width:620px;">
        <tr><td style="background:#1a56b0;padding:24px 32px;text-align:center;">
          <div style="color:#fff;font-size:20px;font-weight:700;">2026 Berkeley Omnium</div>
          <div style="color:#dbeafe;font-size:14px;margin-top:4px;">NICA volunteer digest</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;color:#111827;">
            ${coachName ? `Hi ${escapeHtml(coachName)},` : 'Hi,'}
          </p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
            Here is the daily summary for <strong>${escapeHtml(beneficiary.label)}</strong> as of <strong>${escapeHtml(dateLabel)}</strong> (Pacific).
          </p>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;padding:20px 24px;margin-bottom:20px;">
            <h2 style="margin:0 0 12px;font-size:17px;color:#111827;">Summary</h2>
            <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
              <li><strong>${totalVolunteers}</strong> volunteers (with at least one confirmed signup)</li>
              <li><strong>${totalRoles}</strong> volunteer roles (confirmed signups)</li>
              <li><strong>${totalHours.toFixed(2)}</strong> total volunteer hours (shift lengths)</li>
            </ul>
          </div>
          <p style="margin:0;font-size:14px;color:#374151;">
            The full <strong>NICA export</strong> listing is attached as a PDF (same layout as the admin &ldquo;NICA Export&rdquo; tool).
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
            Daily emails run through <strong>${escapeHtml(formatEventDateShort(coach.email_end_date))}</strong> (Pacific), inclusive. Sent at 8:00 a.m. PT.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Volunteer Manager <notifications@berkeleyomnium.com>',
            to: [coach.email],
            subject: `NICA volunteer digest — ${beneficiary.label} — ${dateLabel}`,
            html,
            attachments: [{ filename: pdfName, content: pdfBase64 }],
          }),
        })

        if (!resendResponse.ok) {
          const txt = await resendResponse.text()
          throw new Error(`Resend: ${txt}`)
        }

        const { error: insErr } = await supabaseAdmin.from('nica_coach_digest_runs').insert({
          coach_id: coach.id,
          pacific_date: todayPacific,
        })
        if (insErr && (insErr as { code?: string }).code !== '23505') throw insErr

        sent += 1
        if (i < coaches.length - 1) await sleep(300)
      } catch (e) {
        errors.push(`${coach.email}: ${getErrorMessage(e)}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        todayPacific,
        errors: errors.length ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('send-nica-coach-digest:', error)
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
