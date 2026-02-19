/**
 * Time display helpers for volunteer roles.
 * Roles with flexible times are stored as start_time "00:00", end_time "00:00" in the DB.
 * Event dates (YYYY-MM-DD) are displayed in Pacific (America/Los_Angeles) throughout the app.
 */

const FLEXIBLE_START = '00:00';
const PACIFIC_TZ = 'America/Los_Angeles';

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

const FLEXIBLE_END = '00:00';

function normalizeTime(t) {
  if (t == null) return '';
  const s = String(t).trim();
  return s.startsWith('00:00') ? '00:00' : s;
}

/** True if role has flexible times (stored as 00:00/00:00 in DB, or "flexible" from CSV parse). */
export function isFlexibleTime(role) {
  if (!role) return false;
  const start = String(role.start_time || '').trim().toLowerCase();
  const end = String(role.end_time || '').trim().toLowerCase();
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

/** "TBD" when no times set, "Flexible" for 00:00/00:00, or "7:00 AM – 9:00 AM". Use for display in UI. */
export function formatTimeRange(role) {
  if (!role) return '';
  const s = role.start_time ?? '';
  const e = role.end_time ?? '';
  if (!s && !e) return 'TBD';
  if (isFlexibleTime(role)) return 'Flexible';
  if (!s || !e) return 'TBD';
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
