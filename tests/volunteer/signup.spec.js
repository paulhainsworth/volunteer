import { test, expect, profile, role, signInFixture, user, waiver } from '../helpers/browser.js';

const fallback = '/functions/v1/create-signup-for-new-user';

async function openSignup(page, backend) {
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 1 }]);
  backend.reply('GET', '/rest/v1/waiver_settings', waiver);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Club' }]);
  backend.reply('POST', '/auth/v1/signup', user);
  await page.goto(`/#/signup/${role.id}`);
  await page.getByLabel('First Name').fill('Test');
  await page.getByLabel('Last Name').fill('Volunteer');
  await page.getByLabel(/Email Address/).fill(user.email);
  await page.getByLabel(/Emergency Contact Name/).fill('Fixture Contact');
  await page.getByLabel(/Emergency Contact Phone/).fill('5550100');
  await page.locator('#guest-affiliation').selectOption('fixture-team');
}

test('requires consent and confirms the signup when email confirmation is pending', async ({ page, backend }) => {
  backend.reply('POST', fallback, { ok: true });
  backend.reply('POST', '/functions/v1/send-email', { ok: true });
  backend.reply('POST', '/functions/v1/send-welcome-with-magic-link', { ok: true });
  await openSignup(page, backend);
  const submit = page.getByRole('button', { name: 'Complete Signup' });
  await expect(submit).toBeDisabled();
  expect(backend.calls('POST', '/auth/v1/signup')).toBe(0);
  await page.getByRole('checkbox', { name: /I have read and agree/ }).check();
  await submit.click();
  await expect(page.getByText("You're all set!")).toBeVisible();
  expect(backend.calls('POST', fallback)).toBe(1);
});

test('failed signup never displays a confirmation', async ({ page, backend }) => {
  backend.reply('POST', fallback, { error: 'Role closed' }, 409);
  await openSignup(page, backend);
  await page.getByRole('checkbox', { name: /I have read and agree/ }).check();
  await page.getByRole('button', { name: 'Complete Signup' }).click();
  await expect(page.getByText('Edge Function returned a non-2xx status code')).toBeVisible();
  await expect(page.getByText("You're all set!")).toHaveCount(0);
  expect(backend.calls('POST', fallback)).toBe(1);
});

test('a returning volunteer sees the existing signup instead of a second checkout form', async ({ page, backend }) => {
  await signInFixture(page, backend);
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 1 }]);
  backend.reply('GET', '/rest/v1/signups', [{ id: 'fixture-signup', role_id: role.id, role }]);
  await page.goto(`/#/signup/${role.id}`);
  await expect(page.getByText("You're signed up!")).toBeVisible();
  expect(backend.calls('POST', '/rest/v1/signups')).toBe(0);
});

test('volunteer cancellation removes the assignment from My Signups', async ({ page, backend }) => {
  await signInFixture(page, backend, 'volunteer', {
    signups: [{ id: 'fixture-signup', role_id: role.id, status: 'confirmed', role }],
  });
  backend.reply('PATCH', '/rest/v1/signups', {});
  backend.handle('GET', '/rest/v1/profiles', (_request, url) => ({
    body: url.searchParams.has('id') ? [profile] : [],
  }));
  await expect(page.getByText(role.name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel Signup', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Cancel Signup' }).click();
  await expect(page.getByText(role.name, { exact: true })).toHaveCount(0);
  expect(backend.calls('PATCH', '/rest/v1/signups')).toBe(1);
});

test('signed-in volunteers can confirm one assignment and see it in My Signups', async ({ page, backend }) => {
  await signInFixture(page, backend);
  const assignments = [];
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 0 }]);
  backend.handle('GET', '/rest/v1/signups', () => ({ body: assignments }));
  backend.reply('POST', '/functions/v1/send-email', { success: true });
  backend.handle('POST', '/rest/v1/signups', (request) => {
    const row = request.postDataJSON();
    expect(row).toMatchObject({ volunteer_id: user.id, role_id: role.id, status: 'confirmed' });
    const saved = { ...row, id: 'fixture-assignment', role };
    assignments.push(saved);
    return { body: saved, status: 201 };
  });
  await page.goto(`/#/signup/${role.id}`);
  await page.getByRole('button', { name: 'Confirm Signup' }).click();
  await expect(page.getByText("You're all set!")).toBeVisible();
  await expect(page).toHaveURL(/#\/my-signups$/);
  await expect(page.getByRole('heading', { name: role.name, exact: true })).toBeVisible();
  expect(backend.calls('POST', '/rest/v1/signups')).toBe(1);
});
