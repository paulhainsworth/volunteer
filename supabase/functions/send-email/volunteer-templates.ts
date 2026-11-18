const site = 'https://volunteer.berkeleyomnium.com/#';
const htmlEntities: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function isVolunteerNotification(kind: unknown): kind is VolunteerNotification {
  return kind === 'confirmation' || kind === 'guardian_signup' ||
    kind === 'guardian_waiver' || kind === 'cancellation';
}

type VolunteerNotification = 'confirmation' | 'guardian_signup' | 'guardian_waiver' | 'cancellation';

type Notice = {
  recipients: string[];
  volunteerName: string | null;
  firstName: string | null;
  guardianName: string | null;
  roleId: string | null;
  roleName: string | null;
  roleDate: string | null;
  roleMonth: string | null;
  roleStart: string | null;
  roleEnd: string | null;
  roleLocation: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

export function buildVolunteerMail(kind: VolunteerNotification, notice: Notice) {
  const volunteer = notice.volunteerName?.trim() || 'the volunteer';
  const guardianGreeting = escapeHtml(notice.guardianName?.trim() || 'there');
  const roleName = notice.roleName || 'volunteer role';
  const roleDate = notice.roleDate
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(notice.roleDate))
    : notice.roleMonth
      ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(notice.roleMonth))
      : 'Flexible';
  const roleTime = notice.roleStart && notice.roleEnd
    ? `${notice.roleStart.slice(0, 5)}–${notice.roleEnd.slice(0, 5)}`
    : 'Flexible';
  const roleInfo = `<ul><li><strong>${escapeHtml(roleName)}</strong></li><li>Date: ${escapeHtml(roleDate)}</li><li>Time: ${escapeHtml(roleTime)}</li>${notice.roleLocation ? `<li>Location: ${escapeHtml(notice.roleLocation)}</li>` : ''}</ul>`;
  const roleLink = `<p><a href="${site}/signup/${encodeURIComponent(notice.roleId || '')}">View role details</a></p>`;

  let subject: string;
  let html: string;
  switch (kind) {
    case 'confirmation':
      subject = `You're signed up: ${roleName} – Berkeley Omnium`;
      html = `<h2>Thanks for volunteering!</h2><p>Hi ${escapeHtml(notice.firstName || 'there')},</p><p>You're signed up for:</p>${roleInfo}${roleLink}`;
      break;
    case 'guardian_signup':
      subject = `Confirmation: You signed the waiver for ${volunteer} – Berkeley Omnium`;
      html = `<h2>Parent/Guardian confirmation</h2><p>Hi ${guardianGreeting},</p><p>You signed the waiver on behalf of <strong>${escapeHtml(volunteer)}</strong>.</p>${roleInfo}${roleLink}`;
      break;
    case 'guardian_waiver':
      subject = `Confirmation: You signed the waiver for ${volunteer} – Berkeley Omnium`;
      html = `<h2>Parent/Guardian confirmation</h2><p>Hi ${guardianGreeting},</p><p>You signed the waiver on behalf of <strong>${escapeHtml(volunteer)}</strong>.</p><p><a href="${site}/my-signups">Volunteer hub – My Signups</a></p>`;
      break;
    case 'cancellation':
      subject = `Volunteer Cancellation: ${roleName}`;
      html = `<h2>Volunteer Cancellation Notice</h2><p><strong>${escapeHtml(volunteer)}</strong> has cancelled their signup for:</p>${roleInfo}<p>You may want to reach out to find a replacement.</p>`;
      break;
  }
  return { subject, html, recipients: notice.recipients };
}
