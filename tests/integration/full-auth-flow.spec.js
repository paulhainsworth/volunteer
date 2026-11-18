import { test, expect, profile, signInFixture } from '../helpers/browser.js';

for (const [role, nav] of [['volunteer', 'Browse Roles'], ['volunteer_leader', 'My Roles'], ['admin', 'Dashboard']]) {
  test(`magic link signs in the ${role} session and sign-out clears it`, async ({ page, backend }) => {
    backend.reply('POST', '/auth/v1/logout', {});
    await signInFixture(page, backend, role);
    await expect(page).toHaveURL(/#\/my-signups$/);
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByRole('link', { name: nav, exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: 'Sign Out' }).click();
    await expect(navigation.getByRole('link', { name: 'Sign In' })).toBeVisible();
    await page.reload();
    await expect(navigation.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });
}

test('reload keeps a signed-in volunteer on My Signups', async ({ page, backend }) => {
  await signInFixture(page, backend);
  await expect(page).toHaveURL(/#\/my-signups$/);
  // MySignups.svelte:25–28 redirects before auth bootstrap can restore a persisted session.
  test.fail();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My Volunteer Signups' })).toBeVisible();
});

test('first login collects an emergency contact before opening volunteer opportunities', async ({ page, backend }) => {
  await signInFixture(page, backend, 'volunteer', { profileFields: { emergency_contact_name: null } });
  await expect(page).toHaveURL(/#\/onboarding$/);
  backend.reply('GET', '/rest/v1/volunteer_roles', []);
  backend.handle('PATCH', '/rest/v1/profiles', (request) => {
    expect(request.postDataJSON()).toMatchObject({ emergency_contact_relationship: 'Friend' });
    backend.reply('GET', '/rest/v1/profiles', [profile]);
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
