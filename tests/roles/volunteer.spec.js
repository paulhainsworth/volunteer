import { test, expect, ownProfile, profile, role, signInFixture } from '../helpers/browser.js';

test('volunteer saves an emergency-contact edit', async ({ page, backend }) => {
  await signInFixture(page, backend);
  await expect(page).toHaveURL(/#\/my-signups$/);
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.handle('PATCH', '/rest/v1/profiles', (request) => {
    const update = request.postDataJSON();
    expect(update).toMatchObject({ emergency_contact_name: 'Updated Fixture Contact' });
    backend.reply('POST', ownProfile, { ...profile, ...update });
    return { body: {} };
  });
  await page.goto('/#/profile');
  const contact = page.getByLabel('Emergency Contact Name');
  await expect(contact).toHaveValue(profile.emergency_contact_name);
  await contact.fill('Updated Fixture Contact');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Profile updated successfully!')).toBeVisible();
  expect(backend.calls('PATCH', '/rest/v1/profiles')).toBe(1);
});

test('a signed-in volunteer can reload the profile page', async ({ page, backend }) => {
  await signInFixture(page, backend);
  await expect(page).toHaveURL(/#\/my-signups$/);
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  await page.goto('/#/profile');
  await expect(page.getByLabel('Emergency Contact Name')).toHaveValue(profile.emergency_contact_name);
  await page.reload();
  await expect(page.getByLabel('Emergency Contact Name')).toHaveValue(profile.emergency_contact_name);
  await expect(page).toHaveURL(/#\/profile$/);
});

test('a signed-out visitor is redirected from the profile page to sign-in', async ({ page, backend }) => {
  await page.goto('/#/profile');
  await expect(page).toHaveURL(/#\/auth\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  expect(backend.calls('POST', ownProfile)).toBe(0);
});

test('public team invite renders open roles and takes the volunteer to signup', async ({ page, backend }) => {
  const domainId = '00000000-0000-4000-8000-000000000011';
  backend.reply('GET', '/rest/v1/volunteer_leader_domains', { id: domainId, name: 'Course Team', roles: [role] });
  backend.reply('GET', '/rest/v1/signups', []);
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('GET', '/rest/v1/waiver_settings', { version: 1, waiver_text: 'Fixture waiver' });
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', []);
  await page.goto(`/#/invite/${domainId}`);
  await expect(page.getByRole('heading', { name: 'Course Team', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: role.name })).toBeVisible();
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page).toHaveURL(new RegExp(`#/signup/${role.id}$`));
});

test('an expired directory link returns to the home page', async ({ page, backend }) => {
  backend.reply('GET', '/rest/v1/volunteer_roles', []);
  await page.clock.setFixedTime(new Date('2026-11-18T20:00:00Z'));
  await page.goto('/#/contacts');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByLabel('Search volunteers')).toHaveCount(0);
});

for (const staffRole of ['admin', 'volunteer_leader']) {
  test(`${staffRole} can search the event directory during the enabled window`, async ({ page, backend }) => {
    await page.clock.setFixedTime(new Date('2026-04-18T20:00:00Z'));
    await signInFixture(page, backend, staffRole);
    await expect(page).toHaveURL(/#\/my-signups$/);
    const endpoint = '/rest/v1/rpc/search_volunteer_contacts';
    backend.handle('POST', endpoint, (request) => {
      expect(request.postDataJSON()).toEqual({ p_query: 'Roster' });
      return { body: [{
        id: profile.id, first_name: 'Roster', last_name: 'Fixture',
        email: 'roster@example.invalid', role_names: [role.name],
      }] };
    });
    await page.goto('/#/contacts');
    await page.getByLabel('Search volunteers').fill('Ro');
    expect(backend.calls('POST', endpoint)).toBe(0);
    await page.getByLabel('Search volunteers').fill('Roster');
    await expect(page.getByRole('heading', { name: 'Roster Fixture' })).toBeVisible();
    await expect(page.getByText(role.name, { exact: true })).toBeVisible();
  });
}

test('the public board page shows directors and expands a biography', async ({ page, backend }) => {
  await page.route('https://images.squarespace-cdn.com/**', (request) => request.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>',
  }));
  await page.goto('/#/board');
  await expect(page.getByRole('heading', { name: 'Board of Directors' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand bio' }).first().click();
  const collapse = page.getByRole('button', { name: 'Collapse bio' });
  await expect(collapse).toBeVisible();
  await collapse.click();
  await expect(collapse).toHaveCount(0);
});
