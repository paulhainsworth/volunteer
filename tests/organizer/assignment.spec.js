import { test, expect, emergencyContacts, profile, role, signInFixture } from '../helpers/browser.js';

async function fillAdminAssignment(page, email) {
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Volunteer' }).click();
  await page.getByLabel(/First Name/).fill('New');
  await page.getByLabel(/Last Name/).fill('Volunteer');
  await page.getByLabel(/Email Address/).fill(email);
  await page.getByLabel(/Team \/ Club Affiliation/).selectOption('fixture-team');
  await page.getByLabel('Select a role').selectOption(role.id);
}

test('an organizer creates one volunteer assignment and requests a welcome email', async ({ page, backend }) => {
  const assignment = '/functions/v1/create-volunteer-and-signup';
  const welcome = '/functions/v1/send-welcome-with-magic-link';
  await signInFixture(page, backend, 'admin');
  const newVolunteer = {
    id: '00000000-0000-4000-8000-000000000009', email: 'new@example.invalid',
    first_name: 'New', last_name: 'Volunteer', role: 'volunteer',
  };
  let saved = false;
  backend.handle('GET', '/rest/v1/profiles', (_request, url) => ({
    body: url.searchParams.has('id') ? [{ ...profile, role: 'admin' }] : saved ? [newVolunteer] : [],
  }));
  backend.handle('POST', emergencyContacts, (request) => {
    expect(request.postDataJSON()).toEqual({ p_profile_ids: [newVolunteer.id] });
    return { body: [{ profile_id: newVolunteer.id, emergency_contact_name: 'Fixture Admin Roster Contact' }] };
  });
  backend.reply('GET', '/rest/v1/volunteer_contacts', []);
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Club' }]);
  backend.reply('POST', welcome, { ok: true });
  backend.handle('POST', assignment, (request) => {
    expect(request.postDataJSON()).toMatchObject({ email: newVolunteer.email, role_id: role.id });
    saved = true;
    return { body: { volunteerId: newVolunteer.id } };
  });

  await fillAdminAssignment(page, newVolunteer.email);
  const confirmation = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Create Volunteer' }).click({ noWaitAfter: true });
  const dialog = await confirmation;
  expect(dialog.message()).toContain('Volunteer created successfully');
  await dialog.accept();
  await expect(page.getByText(newVolunteer.email, { exact: true })).toBeVisible();
  await expect(page.getByTitle('Has emergency contact')).toBeVisible();
  expect(backend.calls('POST', assignment)).toBe(1);
  await expect.poll(() => backend.calls('POST', welcome)).toBe(1);
});

test('the leader dashboard displays roles assigned to the leader', async ({ page, backend }) => {
  await signInFixture(page, backend, 'volunteer_leader');
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.reply('GET', '/rest/v1/volunteer_leader_domains', []);
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  await page.getByRole('link', { name: 'My Roles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Volunteer Leader Dashboard' })).toBeVisible();
  await expect(page.getByText(role.name, { exact: true })).toBeVisible();
});


test('a volunteer leader can request emergency details for a roster entry', async ({ page, backend }) => {
  const volunteer = { id: '00000000-0000-4000-8000-000000000010', first_name: 'Roster', last_name: 'Volunteer' };
  await signInFixture(page, backend, 'volunteer_leader');
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.reply('GET', '/rest/v1/volunteer_leader_domains', []);
  backend.reply('GET', '/rest/v1/volunteer_roles', [{
    ...role, signups: [{ id: 'fixture-roster-signup', status: 'confirmed', volunteer }],
  }]);
  backend.handle('POST', emergencyContacts, (request) => {
    expect(request.postDataJSON()).toEqual({ p_profile_ids: [volunteer.id] });
    return { body: [{ profile_id: volunteer.id, emergency_contact_name: 'Fixture Roster Contact' }] };
  });

  await page.getByRole('link', { name: 'My Roles', exact: true }).click();
  await expect(page.getByText('Roster Volunteer', { exact: true })).toBeVisible();
  expect(backend.calls('POST', emergencyContacts)).toBe(0);
  await page.getByRole('button', { name: 'Open volunteer actions' }).click();
  await page.getByRole('button', { name: 'View emergency contact' }).click();
  await expect(page.getByText('Fixture Roster Contact', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Hide emergency contact' }).click();
  await expect(page.getByText('Fixture Roster Contact', { exact: false })).toHaveCount(0);
});

test('a rejected organizer assignment shows an error and sends no welcome email', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  backend.handle('GET', '/rest/v1/profiles', (_request, url) => ({
    body: url.searchParams.has('id') ? [{ ...profile, role: 'admin' }] : [],
  }));
  backend.reply('GET', '/rest/v1/volunteer_contacts', []);
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Club' }]);
  const assignment = '/functions/v1/create-volunteer-and-signup';
  backend.reply('POST', assignment, { error: 'Fixture role is full' });
  await fillAdminAssignment(page, 'new@example.invalid');
  await page.getByRole('button', { name: 'Create Volunteer' }).click();
  await expect(page.getByText('Failed to create volunteer: Fixture role is full').last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Volunteer' })).toBeEnabled();
  expect(backend.calls('POST', assignment)).toBe(1);
  expect(backend.calls('POST', '/functions/v1/send-welcome-with-magic-link')).toBe(0);
});

for (const outcome of ['sent', 'delivery failed', 'assignment rejected', 'reactivated']) {
  test(`leader assignment handles ${outcome} and avoids repeat submission`, async ({ page, backend }) => {
    const assignment = '/functions/v1/create-volunteer-and-signup';
    const email = '/functions/v1/send-email';
    const signups = '/rest/v1/signups';
    const emailAddress = 'leader-fixture@example.invalid';
    const existing = outcome === 'reactivated'
      ? [{ ...profile, email: emailAddress, team_club_affiliation_id: 'fixture-team' }]
      : [];
    await signInFixture(page, backend, 'volunteer_leader');
    backend.handle('GET', '/rest/v1/profiles', (_, url) => ({
      body: url.searchParams.has('id') ? [{ ...profile, role: 'volunteer_leader' }] : existing,
    }));
    backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Club' }]);
    backend.reply('GET', '/rest/v1/volunteer_leader_domains', []);
    backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
    backend.reply('GET', signups, [{ id: 'fixture-signup', status: 'cancelled' }]);
    backend.handle('PATCH', signups, (request) => {
      expect(request.postDataJSON()).toMatchObject({ status: 'confirmed', waiver_signed: false });
      return { body: {} };
    });
    backend.reply('POST', email, outcome === 'delivery failed' ? { error: 'Fixture failure' } : { success: true },
      outcome === 'delivery failed' ? 502 : 200);
    let finishAssignment;
    const pendingAssignment = new Promise((resolve) => { finishAssignment = resolve; });
    backend.handle('POST', assignment, async (request) => {
      expect(request.postDataJSON()).toMatchObject({ email: emailAddress, role_id: role.id });
      await pendingAssignment;
      return outcome === 'assignment rejected'
        ? { body: { error: 'Fixture role is full' } }
        : { body: { volunteerId: profile.id } };
    });

    await page.getByRole('link', { name: 'My Roles', exact: true }).click();
    await page.getByLabel(`First name for ${role.name}`).fill('Test');
    await page.getByLabel(`Last name for ${role.name}`).fill('Volunteer');
    await page.getByLabel(`Email for ${role.name}`).fill(emailAddress);
    await page.getByLabel(`Team/club for ${role.name}`).selectOption('fixture-team');
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    if (outcome !== 'reactivated') {
      try {
        await expect(page.getByRole('button', { name: 'Adding…' })).toBeDisabled();
        await expect.poll(() => backend.calls('POST', assignment)).toBe(1);
        await page.getByLabel(`First name for ${role.name}`).press('Enter');
        expect(backend.calls('POST', assignment)).toBe(1);
      } finally {
        finishAssignment();
      }
    }

    if (outcome === 'assignment rejected') {
      await expect(page.getByText('Fixture role is full')).toBeVisible();
      expect(backend.calls('POST', email)).toBe(0);
    } else {
      const message = outcome === 'delivery failed'
        ? /Please notify them manually/
        : /sent a welcome email/;
      await expect(page.getByText(message)).toBeVisible();
      expect(backend.calls('POST', email)).toBe(1);
    }
    if (outcome === 'reactivated') {
      expect(backend.calls('PATCH', signups)).toBe(1);
      expect(backend.calls('POST', assignment)).toBe(0);
    } else {
      expect(backend.calls('POST', assignment)).toBe(1);
    }
  });
}
