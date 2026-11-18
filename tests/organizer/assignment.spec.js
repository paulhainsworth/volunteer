import { test, expect, profile, role, signInFixture } from '../helpers/browser.js';

test('an organizer creates one volunteer assignment and requests a welcome email', async ({ page, backend }) => {
  const assignment = '/functions/v1/create-volunteer-and-signup';
  const welcome = '/functions/v1/send-welcome-with-magic-link';
  await signInFixture(page, backend, 'admin');
  const newVolunteer = { ...profile, id: 'created-volunteer', email: 'new@example.invalid', first_name: 'New' };
  let saved = false;
  backend.handle('GET', '/rest/v1/profiles', (_request, url) => ({
    body: url.searchParams.has('id') ? [{ ...profile, role: 'admin' }] : saved ? [newVolunteer] : [],
  }));
  backend.reply('GET', '/rest/v1/volunteer_contacts', []);
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Club' }]);
  backend.reply('POST', '/functions/v1/notify-slack-signup', { ok: true });
  backend.reply('POST', welcome, { ok: true });
  backend.handle('POST', assignment, (request) => {
    expect(request.postDataJSON()).toMatchObject({ email: newVolunteer.email, role_id: role.id });
    saved = true;
    return { body: { volunteerId: newVolunteer.id } };
  });

  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Volunteer' }).click();
  await page.getByLabel(/First Name/).fill('New');
  await page.getByLabel(/Last Name/).fill('Volunteer');
  await page.getByLabel(/Email Address/).fill(newVolunteer.email);
  await page.getByLabel(/Team \/ Club Affiliation/).selectOption('fixture-team');
  await page.getByLabel('Select a role').selectOption(role.id);
  const confirmation = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Create Volunteer' }).click({ noWaitAfter: true });
  const dialog = await confirmation;
  expect(dialog.message()).toContain('Volunteer created successfully');
  await dialog.accept();
  await expect(page.getByText(newVolunteer.email, { exact: true })).toBeVisible();
  expect(backend.calls('POST', assignment)).toBe(1);
  await expect.poll(() => backend.calls('POST', welcome)).toBe(1);
});

test('the leader dashboard displays roles assigned to the leader', async ({ page, backend }) => {
  await signInFixture(page, backend, 'volunteer_leader');
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.reply('GET', '/rest/v1/volunteer_leader_domains', []);
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  await page.getByRole('link', { name: 'My Roles' }).click();
  await expect(page.getByRole('heading', { name: 'Volunteer Leader Dashboard' })).toBeVisible();
  await expect(page.getByText(role.name, { exact: true })).toBeVisible();
});
