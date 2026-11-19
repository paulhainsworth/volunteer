import { test, expect, ownProfile, fixtureSession, profile, role, signInFixture, user, waiver } from '../helpers/browser.js';

const confirmation = '/rest/v1/rpc/confirm_volunteer_signup';

async function openSignup(page, backend, authResponse = user) {
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 1 }]);
  backend.reply('GET', '/rest/v1/waiver_settings', waiver);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Club' }]);
  backend.handle('POST', '/auth/v1/signup', (_request, url) => {
    const destination = new URL(url.searchParams.get('redirect_to'));
    expect(destination.searchParams.get('signup_role')).toBe(role.id);
    return { body: authResponse };
  });
  await page.goto(`/#/signup/${role.id}`);
  await page.getByLabel('First Name').fill('Test');
  await page.getByLabel('Last Name').fill('Volunteer');
  await page.getByLabel(/Email Address/).fill(user.email);
  await page.getByLabel(/Emergency Contact Name/).fill('Fixture Contact');
  await page.getByLabel(/Emergency Contact Phone/).fill('5550100');
  await page.locator('#guest-affiliation').selectOption('fixture-team');
}

test('requests identity verification before collecting consent or assigning a seat', async ({ page, backend }) => {
  await openSignup(page, backend);
  const submit = page.getByRole('button', { name: 'Continue to Waiver' });
  await expect(page.getByRole('heading', { name: 'Liability Waiver' })).toHaveCount(0);
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Check your email to finish signing up' })).toBeVisible();
  await expect(page.getByText('A spot has not been reserved.', { exact: false })).toBeVisible();
  expect(backend.calls('POST', confirmation)).toBe(0);
  expect(backend.calls('POST', '/functions/v1/send-email')).toBe(0);
});

test('a failed confirmation keeps the role form available and sends no email', async ({ page, backend }) => {
  await signInFixture(page, backend);
  await expect(page).toHaveURL(/#\/my-signups$/);
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 0 }]);
  backend.reply('POST', confirmation, { message: 'This role is already full' }, 409);
  await page.goto(`/#/signup/${role.id}`);
  await page.getByRole('button', { name: 'Confirm Signup' }).click();
  await expect(page.getByText('This role is already full', { exact: true })).toBeVisible();
  await expect(page.getByText("You're all set!")).toHaveCount(0);
  expect(backend.calls('POST', confirmation)).toBe(1);
  expect(backend.calls('POST', '/functions/v1/send-email')).toBe(0);
});

test('a returning volunteer sees the existing signup instead of a second checkout form', async ({ page, backend }) => {
  await signInFixture(page, backend, 'volunteer', {
    signups: [{ id: 'fixture-signup', role_id: role.id, status: 'confirmed', role }],
  });
  await expect(page.getByRole('heading', { name: role.name, exact: true })).toBeVisible();
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 1 }]);
  await page.goto(`/#/signup/${role.id}`);
  await expect(page.getByText("You're signed up!")).toBeVisible();
  expect(backend.calls('POST', confirmation)).toBe(0);
});

test('volunteer cancellation removes the assignment from My Signups', async ({ page, backend }) => {
  await signInFixture(page, backend, 'volunteer', {
    signups: [{ id: 'fixture-signup', role_id: role.id, status: 'confirmed', role }],
  });
  backend.reply('PATCH', '/rest/v1/signups', {});
  backend.handle('POST', '/functions/v1/send-email', (request) => {
    expect(request.postDataJSON()).toEqual({
      notification: { kind: 'cancellation', reference: 'fixture-signup' },
    });
    return { body: { success: true } };
  });
  await expect(page.getByText(role.name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel Signup', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Cancel Signup' }).click();
  await expect(page.getByText(role.name, { exact: true })).toHaveCount(0);
  expect(backend.calls('PATCH', '/rest/v1/signups')).toBe(1);
});

test('signed-in volunteers can confirm one assignment and see it in My Signups', async ({ page, backend }) => {
  await signInFixture(page, backend);
  await expect(page).toHaveURL(/#\/my-signups$/);
  const assignments = [];
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 0 }]);
  backend.handle('GET', '/rest/v1/signups', () => ({ body: assignments }));
  backend.reply('POST', '/functions/v1/send-email', { success: true });
  backend.handle('POST', confirmation, (request) => {
    const row = request.postDataJSON();
    expect(row).toEqual({ p_role_id: role.id, p_phone: '', p_consent: null });
    const saved = { id: 'fixture-assignment', volunteer_id: user.id, role_id: role.id, status: 'confirmed', role };
    assignments.push(saved);
    return { body: { signup: saved, created: true } };
  });
  await page.goto(`/#/signup/${role.id}`);
  await page.getByRole('button', { name: 'Confirm Signup' }).click();
  await expect(page.getByText("You're all set!")).toBeVisible();
  await expect(page).toHaveURL(/#\/my-signups$/);
  await expect(page.getByRole('heading', { name: role.name, exact: true })).toBeVisible();
  expect(backend.calls('POST', confirmation)).toBe(1);
});

test('a verification callback returns the volunteer to the selected role', async ({ page, backend }) => {
  backend.reply('GET', '/rest/v1/volunteer_roles', role);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 0 }]);
  await signInFixture(page, backend, 'volunteer', { search: `?signup_role=${role.id}` });
  await expect(page).toHaveURL(new RegExp(`#/signup/${role.id}$`));
  await expect(page.getByRole('heading', { name: role.name })).toBeVisible();
  expect(backend.calls('POST', confirmation)).toBe(0);
});

test('a guest with an immediate session signs the waiver before confirming the seat', async ({ page, backend }) => {
  backend.reply('POST', ownProfile, { ...profile, phone: '5550102' });
  backend.reply('POST', '/functions/v1/send-welcome-with-magic-link', { success: true });
  backend.reply('POST', '/rest/v1/rpc/volunteer_waiver_is_current', false);
  backend.reply('GET', '/rest/v1/signups', []);
  backend.reply('POST', '/functions/v1/send-email', { success: true });
  backend.handle('POST', confirmation, (request) => {
    expect(request.postDataJSON()).toMatchObject({
      p_role_id: role.id,
      p_phone: '5550102',
      p_consent: { version: 1, signature_name: 'Test Volunteer' },
    });
    return { body: { signup: { id: 'fixture-assignment' }, created: true } };
  });
  await openSignup(page, backend, fixtureSession());
  await page.getByRole('button', { name: 'Continue to Waiver' }).click();
  const confirm = page.getByRole('button', { name: 'Confirm Signup' });
  await expect(confirm).toBeDisabled();
  expect(backend.calls('POST', confirmation)).toBe(0);
  await expect(page.getByLabel('Digital Signature (Full Name)')).toHaveValue('Test Volunteer');
  await page.getByRole('checkbox', { name: /I have read and agree/ }).check();
  await confirm.click();
  await expect(page.getByText("You're all set!")).toBeVisible();
  expect(backend.calls('POST', confirmation)).toBe(1);
});
