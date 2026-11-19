import { test, expect, role, signInFixture, user } from '../helpers/browser.js';

const signupId = '00000000-0000-4000-8000-000000000012';
const volunteer = {
  id: '00000000-0000-4000-8000-000000000013',
  first_name: 'Roster', last_name: 'Fixture', email: 'roster@example.invalid', phone: '5550102',
};
const signup = { id: signupId, status: 'confirmed', volunteer };

async function openRoster(page, backend, signups) {
  await signInFixture(page, backend, 'volunteer_leader');
  await expect(page).toHaveURL(/#\/my-signups$/);
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.reply('GET', '/rest/v1/volunteer_leader_domains', []);
  backend.handle('GET', '/rest/v1/volunteer_roles', () => ({ body: [{ ...role, signups: signups() }] }));
  await page.getByRole('link', { name: 'My Roles', exact: true }).click();
  await expect(page.getByRole('heading', { name: role.name })).toBeVisible();
}

test('leader shares an invite link for the assigned role', async ({ page, backend }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (value) => { window.fixtureInvite = value; } },
    });
  });
  await openRoster(page, backend, () => [signup]);
  await page.getByRole('button', { name: 'Share invite link' }).click();
  await expect(page.getByText('Invite link copied to clipboard.')).toBeVisible();
  expect(await page.evaluate(() => window.fixtureInvite)).toMatch(new RegExp(`#/signup/${role.id}$`));
});

test('leader edits a roster entry and removes it after confirmation', async ({ page, backend }) => {
  let entry = { ...signup, volunteer: { ...volunteer } };
  const signups = '/rest/v1/signups';
  await openRoster(page, backend, () => entry ? [entry] : []);
  backend.handle('PATCH', '/rest/v1/profiles', (request, url) => {
    expect(url.searchParams.get('id')).toBe(`eq.${volunteer.id}`);
    const payload = request.postDataJSON();
    expect(payload.first_name).toBe('Updated');
    entry.volunteer = { ...entry.volunteer, ...payload };
    return { body: {} };
  });
  backend.reply('PATCH', signups, {});
  backend.handle('DELETE', signups, (_, url) => {
    expect(url.searchParams.get('id')).toBe(`eq.${signupId}`);
    entry = null;
    return { body: {} };
  });

  await page.getByRole('button', { name: 'Open volunteer actions' }).click();
  await page.getByRole('button', { name: 'Edit volunteer', exact: true }).click();
  await page.getByLabel(`Edit first name for ${volunteer.email}`).fill('Updated');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Updated Fixture', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open volunteer actions' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove volunteer', exact: true }).click();
  await expect(page.getByText('Volunteer removed.')).toBeVisible();
  await expect(page.getByText('Updated Fixture', { exact: true })).toHaveCount(0);
});

test('leader sends a message to a volunteer on the assigned roster', async ({ page, backend }) => {
  const mail = '/functions/v1/send-email';
  await openRoster(page, backend, () => [signup]);
  backend.handle('POST', mail, (request) => {
    expect(request.postDataJSON()).toMatchObject({ to: volunteer.email, subject: 'Fixture shift reminder' });
    expect(request.postDataJSON().html).toContain('Bring a water bottle.');
    return { body: { success: true } };
  });
  await page.getByRole('button', { name: 'Email My Volunteers' }).click();
  await page.getByLabel('Subject').fill('Fixture shift reminder');
  await page.getByLabel('Message').fill('Bring a water bottle.');
  await page.getByRole('button', { name: /send email/i }).click();
  await expect.poll(() => backend.calls('POST', mail)).toBe(1);
});


test('leader assigns and removes roles in their own domain', async ({ page, backend }) => {
  const domainId = '00000000-0000-4000-8000-000000000016';
  const domain = { id: domainId, name: 'Fixture Leader Domain', leader_id: user.id };
  let assigned = null;
  await signInFixture(page, backend, 'volunteer_leader');
  await expect(page).toHaveURL(/#\/my-signups$/);
  backend.handle('GET', '/rest/v1/volunteer_leader_domains', (_, url) => {
    expect(url.searchParams.get('leader_id')).toBe(`eq.${user.id}`);
    return { body: [domain] };
  });
  backend.handle('GET', '/rest/v1/volunteer_roles', () => ({
    body: [{ ...role, domain_id: assigned }],
  }));
  backend.handle('PATCH', '/rest/v1/volunteer_roles', (request) => {
    assigned = request.postDataJSON().domain_id;
    return { body: {} };
  });
  await page.goto(`/#/admin/domains?manageDomain=${domainId}`);
  await expect(page.getByRole('heading', { name: `Assign Roles to ${domain.name}` })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Create Domain' })).toHaveCount(0);
  await page.getByTitle('Add to domain').click();
  await expect(page.getByRole('heading', { name: 'Assigned Roles (1)', exact: true })).toBeVisible();
  expect(assigned).toBe(domainId);
  await page.getByTitle('Remove from domain').click();
  await expect(page.getByRole('heading', { name: 'Assigned Roles (0)', exact: true })).toBeVisible();
  expect(assigned).toBeNull();
});
