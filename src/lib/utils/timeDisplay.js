/**
 * Time display helpers for volunteer roles.
 * Roles with flexible times are stored as start_time "00:00", end_time "00:00" in the DB.
 * Event dates (YYYY-MM-DD) are displayed in Pacific (America/Los_Angeles) throughout the app.
 */

const FLEXIBLE_START = '00:00';
const PACIFIC_TZ = 'America/Los_Angeles';

function getPacificDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parts.find((part) => part.type === 'year')?.value || '',
    month: parts.find((part) => part.type === 'month')?.value || '',
    day: parts.find((part) => part.type === 'day')?.value || ''
  };
}

/**
 * Parse a date-only string (YYYY-MM-DD) without timezone shift.
 * Returns a Date at noon UTC so the calendar day is correct in all timezones.
 */
export function parseEventDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return null;
  const trimmed = dateString.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return new Date(trimmed + 'T12:00:00.000Z');
}

/**
 * Month-only scheduling (completion_month stores YYYY-MM-01).
 * style short => "Jun 2026", long => "June 2026"
 */
export function formatCompletionMonthInPacific(dateString, style = 'short') {
  const d = parseEventDate(dateString);
  if (!d) return 'Flexible';
  const opts =
    style === 'long'
      ? { month: 'long', year: 'numeric', timeZone: PACIFIC_TZ }
      : { month: 'short', year: 'numeric', timeZone: PACIFIC_TZ };
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}

/**
 * Date line for a role: specific event date, completion month, or "Flexible".
 */
export function formatRoleScheduleDate(role, style = 'short') {
  if (!role) return 'Flexible';
  if (role.event_date) return formatEventDateInPacific(role.event_date, style);
  if (role.completion_month) return formatCompletionMonthInPacific(role.completion_month, style);
  return 'Flexible';
}

/** Sort key (ms); roles without a date or month sort last. */
export function getRoleScheduleSortTime(role) {
  if (!role) return Number.POSITIVE_INFINITY;
  if (role.event_date) {
    const t = parseEventDate(role.event_date)?.getTime();
    return t == null ? Number.POSITIVE_INFINITY : t;
  }
  if (role.completion_month) {
    const t = parseEventDate(role.completion_month)?.getTime();
    return t == null ? Number.POSITIVE_INFINITY : t;
  }
  return Number.POSITIVE_INFINITY;
}

function lastDayOfMonthUtc(y, mZeroIndexed) {
  return new Date(Date.UTC(y, mZeroIndexed + 1, 0));
}

function formatYmdUtc(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if the role's schedule (date or completion month) is strictly before today in Pacific. */
export function isRoleScheduleInPast(role) {
  const today = getTodayDateInPacific();
  if (!today || !role) return false;
  if (role.event_date) {
    return String(role.event_date).slice(0, 10) < today;
  }
  if (role.completion_month) {
    const d = parseEventDate(role.completion_month);
    if (!d) return false;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const last = lastDayOfMonthUtc(y, m);
    return formatYmdUtc(last) < today;
  }
  return false;
}

/**
 * Approximate calendar days until the role's scheduled day (event) or end of completion month.
 * Fully flexible roles return Infinity.
 */
export function getApproxDaysUntilScheduleEnd(role) {
  if (!role) return Number.POSITIVE_INFINITY;
  if (role.event_date) {
    const t = parseEventDate(role.event_date)?.getTime();
    if (t == null) return Number.POSITIVE_INFINITY;
    return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
  }
  if (role.completion_month) {
    const d = parseEventDate(role.completion_month);
    if (!d) return Number.POSITIVE_INFINITY;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const last = lastDayOfMonthUtc(y, m);
    return Math.ceil((last.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }
  return Number.POSITIVE_INFINITY;
}

/** Stable key for grouping roles by schedule in admin comms (date / month / flexible). */
export function getRoleScheduleGroupKey(role) {
  if (!role) return 'flexible';
  if (role.event_date) return `d:${String(role.event_date).slice(0, 10)}`;
  if (role.completion_month) return `m:${String(role.completion_month).slice(0, 10)}`;
  return 'flexible';
}

/**
 * Format an event_date (YYYY-MM-DD) in Pacific time for display.
 * style: 'short' => "Sun, Apr 19"  |  'long' => "Sunday, April 19, 2026"
 */
export function formatEventDateInPacific(dateString, style = 'short') {
  const d = parseEventDate(dateString);
  if (!d) return 'TBD';
  const opts = style === 'long'
    ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: PACIFIC_TZ }
    : { weekday: 'short', month: 'short', day: 'numeric', timeZone: PACIFIC_TZ };
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}

/** Return today's date in Pacific as YYYY-MM-DD for DB comparisons. */
export function getTodayDateInPacific() {
  const { year, month, day } = getPacificDateParts();
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

const FLEXIBLE_END = '00:00';

function normalizeTime(t) {
  if (t == null) return '';
  const s = String(t).trim();
  return s.startsWith('00:00') ? '00:00' : s;
}

/** True if role has flexible times (stored as 00:00/00:00 in DB, or "flexible" from CSV parse). */
export function isFlexibleTime(role) {
  if (!role) return false;
  const start = String(role.start_time ?? '').trim().toLowerCase();
  const end = String(role.end_time ?? '').trim().toLowerCase();
  if (!start && !end) return true;
  if (start === 'flexible' || end === 'flexible') return true;
  return normalizeTime(role.start_time) === FLEXIBLE_START && normalizeTime(role.end_time) === FLEXIBLE_END;
}

/** Format time "HH:MM" or "HH:MM:SS" to "7:00 AM" style. */
export function formatTime(time) {
  if (!time) return '';
  const s = String(time).trim();
  const part = s.slice(0, 5);
  const [h, m] = part.split(':').map(Number);
  const hour = isNaN(h) ? 0 : h;
  const min = isNaN(m) ? 0 : m;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const mins = String(min).padStart(2, '0');
  return `${displayHour}:${mins} ${ampm}`;
}

/** "Flexible" when no times or 00:00/00:00, or "7:00 AM – 9:00 AM". Use for display in UI. */
export function formatTimeRange(role) {
  if (!role) return '';
  const s = role.start_time ?? '';
  const e = role.end_time ?? '';
  if (!s && !e) return 'Flexible';
  if (isFlexibleTime(role)) return 'Flexible';
  if (!s || !e) return 'Flexible';
  return `${formatTime(s)} – ${formatTime(e)}`;
}

/** Duration in hours, or null if flexible. */
export function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);
  if (start === FLEXIBLE_START && end === FLEXIBLE_END) return null;
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return Number.NaN;
  return (e - s) / 60;
}

/** Minutes after midnight for "HH:MM" or "HH:MM:SS", or null when the value is not a time. */
export function timeToMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const ICS_PACIFIC_TIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${PACIFIC_TZ}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'TZNAME:PDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'TZNAME:PST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
];

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold content lines at 75 octets as RFC 5545 requires. */
function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Add days to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addDays(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function icsLocalDateTime(dateString, minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${dateString.replace(/-/g, '')}T${hh}${mm}00`;
}

/**
 * Build an iCalendar file for a role. Times are Pacific wall-clock times tagged with
 * TZID, so calendar apps place the shift correctly whatever the device time zone.
 * Flexible or untimed roles become all-day events. Returns null when the role has no date.
 */
export function buildRoleCalendarFile(role, { uid, now = new Date() } = {}) {
  const day = String(role?.event_date || role?.completion_month || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const start = timeToMinutes(role.start_time);
  const end = timeToMinutes(role.end_time);
  let when;
  if (isFlexibleTime(role) || start == null || end == null) {
    when = [
      `DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, '')}`
    ];
  } else {
    // A shift that ends at or before its start time runs past midnight.
    const endDay = end > start ? day : addDays(day, 1);
    when = [
      `DTSTART;TZID=${PACIFIC_TZ}:${icsLocalDateTime(day, start)}`,
      `DTEND;TZID=${PACIFIC_TZ}:${icsLocalDateTime(endDay, end)}`
    ];
  }

  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Berkeley Omnium Volunteer Hub//EN',
    'CALSCALE:GREGORIAN',
    ...ICS_PACIFIC_TIMEZONE,
    'BEGIN:VEVENT',
    `UID:${uid}@volunteer-manager`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${escapeIcsText(`${role.name} - Volunteer`)}`,
    `DESCRIPTION:${escapeIcsText(role.description)}`,
    `LOCATION:${escapeIcsText(role.location)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/** Values to store in DB for "flexible" times. */
export function flexibleSentinel() {
  return { start_time: FLEXIBLE_START, end_time: FLEXIBLE_END };
}

/** Display estimate_duration_hours: "—" when null or 0, otherwise e.g. "2.5h". */
export function formatEstimateDuration(hours) {
  if (hours == null || hours === 0) return '—';
  const h = Number(hours);
  if (isNaN(h)) return '—';
  return h % 1 === 0 ? `${h}h` : `${h}h`;
}
