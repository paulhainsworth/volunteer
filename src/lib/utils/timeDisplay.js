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
  const s = new Date(`2000-01-01 ${start}`);
  const e = new Date(`2000-01-01 ${end}`);
  return (e.getTime() - s.getTime()) / (1000 * 60 * 60);
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
