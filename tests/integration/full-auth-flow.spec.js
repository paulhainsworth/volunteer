import { test, expect, ownProfile, profile, signInFixture } from '../helpers/browser.js';

for (const [role, nav] of [['volunteer', 'Browse Roles'], ['volunteer_leader', 'My Roles'], ['admin', 'Dashboard']]) {
  test(`magic link signs in the ${role} session and sign-out clears it`, async ({ page, backend }) => {
    backend.reply('POST', '/auth/v1/logout', {});
    backend.reply('GET', '/rest/v1/volunteer_roles', []);
    await signInFixture(page, backend, role);
    await expect(page).toHaveURL(/#\/my-signups$/);
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByRole('link', { name: nav, exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/#\/auth\/login$/);
    await expect(navigation.getByRole('link', { name: 'Sign In' })).toBeVisible();
    await page.reload();
    await expect(navigation.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });
}

test('reload keeps a signed-in volunteer on My Signups', async ({ page, backend }) => {
  await signInFixture(page, backend);
  await expect(page).toHaveURL(/#\/my-signups$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My Volunteer Signups' })).toBeVisible();
  await expect(page).toHaveURL(/#\/my-signups$/);
});

test('a signed-out visit to My Signups redirects to sign-in', async ({ page, backend }) => {
  await page.goto('/#/my-signups');
  await expect(page).toHaveURL(/#\/auth\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  expect(backend.calls('GET', '/rest/v1/signups')).toBe(0);
});

test('first login collects an emergency contact before opening volunteer opportunities', async ({ page, backend }) => {
  await signInFixture(page, backend, 'volunteer', { profileFields: { emergency_contact_name: null } });
  await expect(page).toHaveURL(/#\/onboarding$/);
  backend.reply('GET', '/rest/v1/volunteer_roles', []);
  backend.handle('PATCH', '/rest/v1/profiles', (request) => {
    expect(request.postDataJSON()).toMatchObject({ emergency_contact_relationship: 'Friend' });
    backend.reply('POST', ownProfile, profile);
    return { body: {} };
  });
  await page.getByLabel(/Emergency Contact Name/).fill('Test Contact');
  await page.getByLabel(/Emergency Contact Phone/).fill('5550100');
  const submit = page.getByRole('button', { name: 'Complete Setup & Get Started' });
  await submit.click();
  expect(backend.calls('PATCH', '/rest/v1/profiles')).toBe(0);
  await page.getByLabel(/Relationship/).selectOption('Friend');
  await submit.click();
  await expect(page).toHaveURL(/#\/volunteer$/);
  expect(backend.calls('PATCH', '/rest/v1/profiles')).toBe(1);
});

for (const role of ['volunteer', 'volunteer_leader']) {
  test(`the ${role} cannot open the organizer roles screen`, async ({ page, backend }) => {
    await signInFixture(page, backend, role);
    backend.reply('GET', '/rest/v1/volunteer_roles', []);
    await page.goto('/#/admin/roles');
    await expect(page).toHaveURL(/#\/volunteer$/);
    await expect(page.getByRole('heading', { name: 'Volunteer Opportunities' })).toBeVisible();
    expect(backend.calls('GET', '/rest/v1/volunteer_leader_domains')).toBe(0);
  });
}
