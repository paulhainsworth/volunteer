import { test, expect, ownProfile, fixtureSession, profile, role, signInFixture, user, waiver } from '../helpers/browser.js';

const signup = '/rest/v1/rpc/confirm_volunteer_signup';
const waiverStatus = '/rest/v1/rpc/volunteer_waiver_is_current';
const signWaiver = '/rest/v1/rpc/sign_volunteer_waiver';
const fixtureWaiverId = '00000000-0000-4000-8000-000000000098';
const mail = '/functions/v1/send-email';
const guardian = {
  parent_guardian_name: 'Fixture Guardian',
  parent_guardian_email: 'guardian@example.invalid',
  parent_signature_name: 'Fixture Signature',
};
const signupPath = `/#/signup/${role.id}`;
const waiverPath = '/#/volunteer/waiver?return=%2Fmy-signups';

function rolesFixture(backend) {
  backend.handle('GET', '/rest/v1/volunteer_roles', (_request, url) => ({
    body: url.searchParams.has('id') ? role : [role],
  }));
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', []);
  backend.reply('GET', '/rest/v1/waiver_settings', waiver);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Club' }]);
}

async function openForm(page, backend, path) {
  rolesFixture(backend);
  if (path === 'signed-in' || path === 'waiver') {
    await signInFixture(page, backend);
    await expect(page).toHaveURL(/my-signups$/);
    backend.reply('POST', waiverStatus, false);
    await page.goto(path === 'waiver' ? waiverPath : signupPath);
    return page.getByRole('button', { name: path === 'waiver' ? 'Sign waiver' : 'Confirm Signup', exact: true });
  }
  if (path === 'browse') {
    await page.goto('/#/volunteer');
    await page.getByRole('button', { name: /General Opportunities/ }).click();
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  } else {
    await page.goto(signupPath);
  }
  await page.getByLabel(/^First Name/).fill('Test');
  await page.getByLabel(/^Last Name/).fill('Volunteer');
  await page.getByLabel(/Email Address/).fill(user.email);
  await page.getByLabel(/Emergency Contact Name/).fill('Fixture Contact');
  await page.getByLabel(/Emergency Contact Phone/).fill('5550100');
  await page.getByLabel(/Team \/ Club Affiliation/).selectOption('fixture-team');
  return page.getByRole('button', { name: 'Continue to Waiver' });
}

function under18(page) {
  return page.getByLabel(/I (?:will be|am) under 18/);
}

async function fillGuardian(page, name = guardian.parent_guardian_name) {
  await under18(page).check();
  await page.getByLabel(/parent\/guardian full name/i).fill(name);
  await page.getByLabel(/parent\/guardian email/i).fill(guardian.parent_guardian_email);
  await page.getByLabel(/parent\/guardian digital signature/i).fill(guardian.parent_signature_name);
  await page.getByRole('checkbox', { name: /I have read/i }).check();
}

function mockSignup(backend, emails, result = { body: { signup: { id: 'fixture-seat' }, created: true } }, assent = null) {
  backend.handle('POST', signup, (request) => {
    expect(request.postDataJSON().p_consent).toMatchObject({
      version: waiver.version, is_minor: true, signature_name: assent, ...guardian,
    });
    return result;
  });
  backend.handle('POST', mail, (request) => {
    emails.push(request.postDataJSON());
    return { body: { success: true } };
  });
}

for (const path of ['signed-in', 'waiver']) {
  test(`MG-01 ${path} requires each guardian field and allows an omitted phone`, async ({ page, backend }) => {
    const submit = await openForm(page, backend, path);
    await under18(page).check();
    await page.getByRole('checkbox', { name: /I have read/i }).check();
    const name = page.getByLabel(/parent\/guardian full name/i);
    const email = page.getByLabel(/parent\/guardian email/i);
    const signature = page.getByLabel(/parent\/guardian digital signature/i);
    await name.fill('   ');
    await expect(submit).toBeDisabled();
    await name.fill(guardian.parent_guardian_name);
    await expect(submit).toBeDisabled();
    await email.fill(guardian.parent_guardian_email);
    await expect(submit).toBeDisabled();
    await signature.fill(guardian.parent_signature_name);
    await expect(submit).toBeEnabled();
    await expect(page.getByLabel(/parent\/guardian phone/i)).toHaveValue('');
    expect(backend.calls('POST', signup)).toBe(0);
    expect(backend.calls('POST', '/auth/v1/signup')).toBe(0);
    expect(backend.calls('POST', signWaiver)).toBe(0);
  });
}

test('MG-01 clearing the minor toggle removes guardian data from adult consent', async ({ page, backend }) => {
  const submit = await openForm(page, backend, 'signed-in');
  await fillGuardian(page);
  await under18(page).uncheck();
  await page.getByLabel(/Digital Signature/).fill(' ');
  await expect(submit).toBeDisabled();
  await page.getByLabel(/Digital Signature/).fill('Test Volunteer');
  backend.handle('POST', signup, (request) => {
    expect(request.postDataJSON().p_consent).toMatchObject({
      is_minor: false, parent_guardian_name: null, parent_guardian_email: null, parent_signature_name: null,
    });
    return { body: { signup: { id: 'fixture-seat' }, created: false } };
  });
  await submit.click();
  await expect(page.getByText("You're all set!")).toBeVisible();
});

for (const outcome of ['created', 'retry', 'rejected']) {
  test(`MG-02 signed-in consent handles ${outcome} without duplicate mail`, async ({ page, backend }) => {
    const submit = await openForm(page, backend, 'signed-in');
    const emails = [];
    mockSignup(backend, emails, outcome === 'rejected'
      ? { body: { message: 'Fixture role is full' }, status: 409 }
      : { body: { signup: { id: 'fixture-seat' }, created: outcome === 'created' } });
    await fillGuardian(page);
    await submit.click();
    await expect(page.getByText(outcome === 'rejected' ? 'Fixture role is full' : "You're all set!")).toBeVisible();
    if (outcome === 'created') {
      await expect.poll(() => emails.length).toBe(2);
      expect(emails.map(({ notification }) => notification.kind).sort()).toEqual(['confirmation', 'guardian_signup']);
      for (const email of emails) expect(email.notification.reference).toBe(role.id);
    } else {
      expect(emails).toHaveLength(0);
    }
  });
}

for (const assent of ['', '  Test Volunteer  ']) {
  test(`MG-03 guardian consent works with ${assent ? 'explicit' : 'blank'} volunteer assent`, async ({ page, backend }) => {
    const submit = await openForm(page, backend, 'signed-in');
    await fillGuardian(page);
    const field = page.getByLabel(/volunteer assent/i);
    await expect(field).toHaveValue('');
    await field.fill(assent);
    mockSignup(backend, [], { body: { signup: { id: 'fixture-seat' }, created: false } }, assent.trim() || null);
    await submit.click();
    await expect(page.getByText("You're all set!")).toBeVisible();
  });
}

for (const path of ['guest', 'browse']) {
  for (const verifyEmail of [true, false]) {
    test(`MG-${verifyEmail ? '05' : '04'} ${path} collects guardian consent once after authentication (verifyEmail=${verifyEmail})`, async ({ page, backend }) => {
      await page.setViewportSize(path === 'browse' ? { width: 390, height: 844 } : { width: 1366, height: 768 });
      const submit = await openForm(page, backend, path);
      const session = fixtureSession();
      backend.handle('POST', '/auth/v1/signup', (request, url) => {
        expect(Object.keys(request.postDataJSON().data).sort()).toEqual([
          'emergency_contact_name', 'emergency_contact_phone', 'first_name', 'last_name',
          'phone', 'role', 'team_club_affiliation_id',
        ]);
        const redirect = new URL(url.searchParams.get('redirect_to'));
        expect([...redirect.searchParams]).toEqual([['signup_role', role.id]]);
        return { body: verifyEmail ? user : session };
      });
      backend.reply('GET', '/auth/v1/user', user);
      backend.reply('POST', ownProfile, profile);
      backend.reply('POST', waiverStatus, false);
      backend.reply('GET', '/rest/v1/signups', []);
      const welcome = '/functions/v1/send-welcome-with-magic-link';
      backend.reply('POST', welcome, { success: true });
      const emails = [];
      mockSignup(backend, emails);

      await expect(under18(page)).toHaveCount(0);
      await expect(page.getByLabel(/parent\/guardian digital signature/i)).toHaveCount(0);
      await submit.click();
      if (verifyEmail) {
        await expect(page.getByText('A spot has not been reserved.', { exact: false })).toBeVisible();
        expect(backend.calls('POST', signup)).toBe(0);
        expect(backend.calls('POST', signWaiver)).toBe(0);
        expect(emails).toHaveLength(0);
        await page.goto(`/?signup_role=${role.id}#${new URLSearchParams({
          access_token: session.access_token, refresh_token: session.refresh_token,
          expires_in: '3600', token_type: 'bearer', type: 'signup',
        })}`);
      }
      await expect(page).toHaveURL(new RegExp(`#/signup/${role.id}$`));
      await under18(page).check();
      await page.getByRole('checkbox', { name: /I have read/i }).check();
      const confirm = page.getByRole('button', { name: 'Confirm Signup' });
      await expect(confirm).toBeDisabled();
      expect(backend.calls('POST', signup)).toBe(0);
      await fillGuardian(page);
      await confirm.click();
      await expect(page.getByText("You're all set!")).toBeVisible();
      await expect.poll(() => emails.map(({ notification }) => notification.kind).sort()).toEqual(['confirmation', 'guardian_signup']);
      expect(backend.calls('POST', signup)).toBe(1);
      await expect.poll(() => backend.calls('POST', welcome)).toBe(verifyEmail ? 0 : 1);
    });
  }
}

for (const accepted of [true, false]) {
  test(`MG-06 standalone waiver handles accepted=${accepted} with guardian consent`, async ({ page, backend }) => {
    const submit = await openForm(page, backend, 'waiver');
    backend.handle('POST', signWaiver, (request) => {
      const payload = request.postDataJSON().p_consent;
      expect(payload).toMatchObject({
        ...guardian, is_minor: true, signature_name: null, version: waiver.version,
      });
      expect(payload.parent_guardian_phone).toBe(accepted ? '5550101' : null);
      if (!accepted) return { body: { message: 'Fixture waiver save failed' }, status: 400 };
      backend.reply('POST', waiverStatus, true);
      return { body: fixtureWaiverId };
    });
    backend.reply('POST', mail, { success: true });
    await fillGuardian(page);
    await page.getByLabel(/volunteer assent/i).fill('');
    if (accepted) await page.getByLabel(/parent\/guardian phone/i).fill(' 5550101 ');
    await submit.click();
    if (accepted) {
      await expect(page).toHaveURL(/#\/my-signups$/);
      await expect.poll(() => backend.calls('POST', mail)).toBe(1);
    } else {
      await expect(page.getByText('Fixture waiver save failed')).toBeVisible();
      expect(backend.calls('POST', mail)).toBe(0);
      await expect(page).toHaveURL(/#\/volunteer\/waiver/);
    }
  });
}

test('MG-08 standalone adult without a current age declaration must re-sign', async ({ page, backend }) => {
  const submit = await openForm(page, backend, 'waiver');
  await expect(page.getByText('How old are you today?')).toBeVisible();
  await page.getByRole('checkbox', { name: /I have read/i }).check();
  await expect(submit).toBeDisabled();
  await page.getByLabel('I am 18 or older today').check();
  await page.getByLabel('Digital signature (full name)').fill('Test Volunteer');
  backend.handle('POST', signWaiver, (request) => {
    expect(request.postDataJSON().p_consent).toEqual({
      is_minor: false, signature_name: 'Test Volunteer', version: waiver.version,
    });
    backend.reply('POST', waiverStatus, true);
    return { body: fixtureWaiverId };
  });
  await submit.click();
  await expect(page).toHaveURL(/#\/my-signups$/);
  expect(backend.calls('POST', mail)).toBe(0);
});

test('MG-09 failed guardian mail leaves signup confirmed and logs no contact data', async ({ page, backend }) => {
  const submit = await openForm(page, backend, 'signed-in');
  const emails = [];
  mockSignup(backend, emails);
  backend.handle('POST', mail, (request) => {
    const email = request.postDataJSON();
    emails.push(email);
    if (email.notification.kind === 'guardian_signup') {
      return { body: { error: 'Fixture private provider error' }, status: 500 };
    }
    return { body: { success: true } };
  });
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  await fillGuardian(page);
  await submit.click();
  await expect(page.getByText("You're all set!")).toBeVisible();
  await expect.poll(() => emails.length).toBe(2);
  expect(logs.join('\n')).not.toMatch(/guardian@example\.invalid|volunteer@example\.invalid|Fixture private provider error/);
});

test('MG-09 standalone guardian notification sends only the stored waiver reference', async ({ page, backend }) => {
  const submit = await openForm(page, backend, 'waiver');
  backend.handle('POST', signWaiver, () => {
    backend.reply('POST', waiverStatus, true);
    return { body: fixtureWaiverId };
  });
  const requests = [];
  backend.handle('POST', mail, (request) => {
    requests.push(request.postDataJSON());
    return { body: { success: true } };
  });
  await fillGuardian(page, 'Fixture & Guardian');
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({
    notification: { kind: 'guardian_waiver', reference: fixtureWaiverId },
  });
});
