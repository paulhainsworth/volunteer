/**
 * Time display helpers for volunteer roles.
 * Roles with flexible times are stored as start_time "00:00", end_time "00:00" in the DB.
 */

const FLEXIBLE_START = '00:00';
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

/** "Flexible" or "7:00 AM - 9:00 AM". Use for display in UI. */
export function formatTimeRange(role) {
  if (!role) return '';
  if (isFlexibleTime(role)) return 'Flexible';
  const s = role.start_time || '';
  const e = role.end_time || '';
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
