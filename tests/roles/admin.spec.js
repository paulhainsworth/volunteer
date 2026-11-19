import { test, expect, fixtureSession, profile, role, signInFixture } from '../helpers/browser.js';

const roles = '/rest/v1/volunteer_roles';
const domains = '/rest/v1/volunteer_leader_domains';

function mockAdminReads(backend) {
  backend.reply('GET', '/rest/v1/profiles', []);
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.reply('GET', domains, []);
  backend.reply('GET', roles, []);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', []);
}

test('admin dashboard loads role statistics and opens the new role form', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  backend.reply('GET', roles, [role]);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  await expect(page.getByText('Total Roles', { exact: true })).toBeVisible();
  const themeToggle = page.getByRole('button', { name: 'Dark mode' });
  await expect(page.locator('.stat-card').first()).toHaveCSS('background-color', 'rgb(27, 30, 36)');
  await themeToggle.click();
  await expect(page.locator('.stat-card').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByRole('link', { name: /create role/i }).click();
  await expect(page.getByRole('heading', { name: 'Create New Role' })).toBeVisible();
});

test('admin updates the event year and publishes website messages', async ({ page, backend }) => {
  const endpoint = '/rest/v1/website_messages';
  let published = {
    event_year: 2026,
    opportunities_message: 'Help fill critical shifts for {year}.',
    homepage_thanks: 'Thank you for volunteering in {year}.',
    onboarding_title: 'Welcome to the {year} Berkeley Omnium!',
    onboarding_message: 'Thank you for joining.',
    revision: 1,
  };
  backend.handle('GET', endpoint, () => ({ body: published }));
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  backend.reply('GET', '/rest/v1/email_digest_settings', [{ admin_daily_volunteer_summary_enabled: true }]);
  await page.getByRole('link', { name: 'Communications' }).click();
  await page.getByRole('link', { name: 'edit website messages' }).click();
  await expect(page.getByRole('heading', { name: 'Website Messages' })).toBeVisible();

  const year = page.getByLabel('Event year');
  const banner = page.getByLabel('Volunteer Opportunities banner');
  await expect(year).toHaveValue('2026');
  await year.fill('2027');
  await banner.fill('Join our {year} crew. <strong>Thank you!</strong>');
  await page.getByLabel('Homepage thank-you').fill('Your {year} shift helps East Bay riders.');
  await page.getByLabel('New volunteer welcome heading').fill('Welcome, {year} volunteers!');
  await page.getByLabel('New volunteer welcome message').fill('Thank you for joining in {year}.');

  const publish = page.getByRole('button', { name: 'Publish messages' });
  backend.reply('PATCH', endpoint, { message: 'Fixture temporary failure' }, 503);
  await publish.click();
  await expect(page.getByRole('alert')).toContainText('Your edits are still here');
  await expect(year).toHaveValue('2027');

  backend.handle('PATCH', endpoint, (request, url) => {
    expect(url.searchParams.get('revision')).toBe('eq.1');
    const edits = request.postDataJSON();
    expect(edits).toEqual({
      event_year: 2027,
      opportunities_message: 'Join our {year} crew. <strong>Thank you!</strong>',
      homepage_thanks: 'Your {year} shift helps East Bay riders.',
      onboarding_title: 'Welcome, {year} volunteers!',
      onboarding_message: 'Thank you for joining in {year}.',
    });
    published = { ...edits, revision: 2 };
    return { body: published };
  });
  await publish.click();
  await expect(page.getByRole('status')).toContainText('Website messages published.');
  backend.reply('PATCH', endpoint, null);
  await publish.click();
  await expect(page.getByRole('alert')).toContainText('messages have changed since you opened this page');

  backend.reply('POST', '/auth/v1/logout', {});
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/#\/auth\/login$/);
  await page.goto('/#/');
  await expect(page.getByText('Your 2027 shift helps East Bay riders.')).toBeVisible();
  await expect(page.getByText('Raised in 2026')).toBeVisible();

  backend.reply('GET', roles, [{ ...role, critical_positions_required: 1 }]);
  await page.goto('/#/volunteer');
  const spotlight = page.getByRole('region', { name: 'Critical volunteer spots still needed' });
  await expect(spotlight.getByText('Join our 2027 crew. <strong>Thank you!</strong>', { exact: true })).toBeVisible();

  published = { ...published, opportunities_message: '' };
  await page.reload();
  await expect(spotlight.getByText('Join our 2027 crew.', { exact: false })).toHaveCount(0);
  await expect(spotlight.getByRole('heading', { name: role.name })).toBeVisible();
});

test('admin previews and starts the 2027 roster while keeping staff and returning volunteers', async ({ page, backend }) => {
  const seasonEndpoint = '/rest/v1/volunteer_season';
  const previewEndpoint = '/rest/v1/rpc/preview_volunteer_season';
  const oldShift = { ...role, event_date: '2026-04-19' };
  const newShift = { ...role, event_date: '2027-04-17' };
  const oldSignup = { id: 'past-assignment', status: 'confirmed', role: oldShift };
  const currentSignup = { id: 'new-assignment', status: 'confirmed', role: newShift };
  let activeYear = null;
  let archivedSignupList = [oldSignup];
  backend.handle('GET', seasonEndpoint, () => ({ body: [{ active_year: activeYear }] }));
  backend.handle('POST', previewEndpoint, (request) => {
    expect(request.postDataJSON()).toEqual({ p_active_year: 2027 });
    return { body: { archived_shifts: 1, inactive_volunteers: 1, retained_staff: 2 } };
  });
  backend.handle('PATCH', seasonEndpoint, (request, url) => {
    expect(url.searchParams.get('active_year')).toBe('is.null');
    expect(request.postDataJSON()).toEqual({ active_year: 2027 });
    activeYear = 2027;
    return { body: { active_year: activeYear } };
  });
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  backend.handle('GET', '/rest/v1/profiles', () => ({ body: [
    { ...profile, role: 'admin' },
    { ...profile, id: 'archived', first_name: 'Prior', last_name: 'Volunteer', email: 'prior@example.invalid', signups: archivedSignupList },
    { ...profile, id: 'returning', first_name: 'Returning', last_name: 'Volunteer', email: 'returning@example.invalid', signups: [oldSignup, currentSignup] },
    { ...profile, id: 'leader', role: 'volunteer_leader', first_name: 'Kept', last_name: 'Leader', email: 'leader@example.invalid', signups: [oldSignup] },
  ] }));
  backend.reply('GET', '/rest/v1/email_digest_settings', [{ admin_daily_volunteer_summary_enabled: true }]);

  await page.getByRole('link', { name: 'Users', exact: true }).click();
  const priorVolunteer = page.getByRole('link', { name: 'prior@example.invalid' });
  await expect(priorVolunteer).toBeVisible();
  await page.getByRole('link', { name: 'Season rollover' }).click();
  await page.getByLabel('New roster year').fill('2027');
  await page.getByRole('button', { name: 'Preview rollover' }).click();
  await expect(page.getByRole('region', { name: 'Preview for 2027' })).toContainText('1 regular volunteer moves');
  const start = page.getByRole('button', { name: 'Start 2027 roster' });
  await expect(start).toBeDisabled();
  expect(backend.calls('PATCH', seasonEndpoint)).toBe(0);
  await page.getByLabel('Confirm the roster rollover to 2027').check();
  await start.click();
  await expect(page.getByRole('status')).toContainText('starts in 2027');
  expect(backend.calls('PATCH', seasonEndpoint)).toBe(1);

  await page.getByRole('link', { name: 'Back to Users' }).click();
  await expect(page.getByText('Active roster starts in 2027.')).toBeVisible();
  await expect(priorVolunteer).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'returning@example.invalid' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'leader@example.invalid' })).toBeVisible();
  await page.getByLabel('View archived volunteers').check();
  await expect(priorVolunteer).toBeVisible();

  await page.getByRole('link', { name: 'Communications', exact: true }).click();
  await expect(page.getByText('All Volunteers (3)', { exact: true })).toBeVisible();
  activeYear = 2028;
  await page.getByLabel('Subject').fill('Fixture notice');
  await page.getByLabel('Message', { exact: true }).fill('Fixture body');
  await page.getByRole('button', { name: 'Send Email to 3 Recipients' }).click();
  await expect(page.getByText('The roster year changed. Reload Communications to review the current recipients.')).toBeVisible();
  expect(backend.calls('POST', '/functions/v1/send-email')).toBe(0);
  activeYear = 2027;


  archivedSignupList = [oldSignup, currentSignup];
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(priorVolunteer).toBeVisible();
});

test('admin creates, edits, duplicates, and deletes a role', async ({ page, backend }) => {
  const duplicateId = '00000000-0000-4000-8000-000000000014';
  const records = new Map();
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  backend.handle('GET', roles, (_, url) => ({
    body: url.searchParams.has('id')
      ? records.get(url.searchParams.get('id').slice(3))
      : [...records.values()],
  }));
  backend.handle('POST', roles, (request) => {
    const id = records.size ? duplicateId : role.id;
    const record = { ...role, ...request.postDataJSON(), id };
    records.set(id, record);
    return { body: record };
  });
  backend.handle('PATCH', roles, (request, url) => {
    const id = url.searchParams.get('id').slice(3);
    const record = { ...records.get(id), ...request.postDataJSON() };
    records.set(id, record);
    return { body: record };
  });
  backend.reply('GET', '/rest/v1/signups', []);
  backend.handle('DELETE', roles, (_, url) => {
    records.delete(url.searchParams.get('id').slice(3));
    return { body: {} };
  });

  await page.goto('/#/admin/roles/new');
  await page.getByLabel(/Role Name/).fill('Fixture New Shift');
  await page.getByLabel(/Number of Positions/).fill('4');
  await page.getByLabel('Event date').fill('2099-04-18');
  await page.getByLabel('Start time').fill('08:00');
  await page.getByLabel('End time').fill('09:30');
  await page.getByRole('button', { name: /create role/i }).click();
  await expect(page).toHaveURL(/#\/admin\/roles$/);
  expect(records.get(role.id)).toMatchObject({ name: 'Fixture New Shift', positions_total: 4 });

  await page.goto(`/#/admin/roles/${role.id}`);
  await expect(page.getByLabel(/Role Name/)).toHaveValue('Fixture New Shift');
  await page.getByLabel(/Role Name/).fill('Fixture Updated Shift');
  await page.getByRole('button', { name: /update role|save changes/i }).click();
  await expect(page).toHaveURL(/#\/admin\/roles$/);
  expect(records.get(role.id).name).toBe('Fixture Updated Shift');

  await page.goto(`/#/admin/roles/${role.id}`);
  await page.getByRole('button', { name: 'Duplicate role', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${duplicateId}$`));
  expect(records.get(duplicateId).name).toBe('Fixture Updated Shift');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete role', exact: true }).click();
  await expect(page).toHaveURL(/#\/admin\/roles$/);
  expect(records.has(duplicateId)).toBe(false);
});

test('admin creates, edits, and deletes a domain', async ({ page, backend }) => {
  const domainId = '00000000-0000-4000-8000-000000000015';
  const leader = { ...profile, email: 'leader@example.invalid', role: 'volunteer_leader' };
  let domain;
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  backend.reply('GET', '/rest/v1/profiles', [leader]);
  backend.handle('GET', domains, () => ({ body: domain ? [domain] : [] }));
  backend.handle('POST', domains, (request) => {
    domain = { ...request.postDataJSON(), id: domainId };
    return { body: domain };
  });
  backend.handle('PATCH', domains, (request) => {
    domain = { ...domain, ...request.postDataJSON() };
    return { body: domain };
  });
  backend.handle('DELETE', domains, (_, url) => {
    expect(url.searchParams.get('id')).toBe(`eq.${domainId}`);
    domain = undefined;
    return { body: {} };
  });

  await page.goto('/#/admin/domains');
  await page.getByRole('button', { name: /create domain/i }).click();
  await page.getByLabel(/Domain Name/).fill('Fixture Course Operations');
  await page.getByLabel('Assign Volunteer Leader').selectOption(leader.id);
  await page.getByRole('button', { name: 'Create Domain', exact: true }).click();
  await expect(page.getByText('Fixture Course Operations', { exact: true })).toBeVisible();
  expect(domain.leader_id).toBe(leader.id);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel(/Domain Name/).fill('Fixture Updated Operations');
  await page.getByRole('button', { name: 'Update Domain', exact: true }).click();
  await expect(page.getByText('Fixture Updated Operations', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No domains yet' })).toBeVisible();
});

test('admin can disable daily summaries', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  const recipient = { ...profile, email: 'recipient@example.invalid', signups: [], waivers: [] };
  backend.reply('GET', '/rest/v1/profiles', [recipient]);
  backend.reply('GET', '/rest/v1/email_digest_settings', [{ admin_daily_volunteer_summary_enabled: true }]);
  backend.handle('PATCH', '/rest/v1/email_digest_settings', (request) => {
    expect(request.postDataJSON()).toMatchObject({ admin_daily_volunteer_summary_enabled: false });
    return { body: {} };
  });
  await page.goto('/#/admin/communications');
  const summary = page.getByRole('checkbox', { name: /Daily volunteer summary email/ });
  await expect(summary).toBeChecked();
  await summary.uncheck();
  await expect.poll(() => backend.calls('PATCH', '/rest/v1/email_digest_settings')).toBe(1);
  await expect(summary).not.toBeChecked();
});

test('admin email completes after a successful session refresh', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  const recipient = { ...profile, email: 'recipient@example.invalid', signups: [], waivers: [] };
  backend.reply('GET', '/rest/v1/profiles', [recipient]);
  backend.reply('GET', '/rest/v1/email_digest_settings', [{ admin_daily_volunteer_summary_enabled: true }]);
  const token = '/auth/v1/token';
  backend.reply('POST', token, fixtureSession());
  backend.handle('POST', '/functions/v1/send-email', (request) => {
    expect(request.postDataJSON()).toMatchObject({ to: recipient.email, subject: 'Fixture organizer update' });
    expect(request.postDataJSON().html).toContain('Hi Test Volunteer');
    return { body: { success: true } };
  });
  await page.goto('/#/admin/communications');
  await page.getByLabel('Subject').fill('Fixture organizer update');
  await page.getByLabel('Message', { exact: true }).fill('Hi {volunteer_name}');
  await page.getByRole('button', { name: 'Send Email to 1 Recipient' }).click();
  await expect.poll(() => backend.calls('POST', token)).toBe(1);
  await expect(page.getByText('Email sent to 1 recipient.')).toBeVisible();
  expect(backend.calls('POST', '/functions/v1/send-email')).toBe(1);
});

test('admin previews a CSV before importing a role and can export the roster', async ({ page, backend }) => {
  let imported;
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  backend.handle('GET', roles, () => ({ body: imported ? [imported] : [] }));
  backend.handle('POST', roles, (request) => {
    const fields = request.postDataJSON();
    expect(fields).toMatchObject({ name: 'Fixture CSV Shift', event_date: '2099-04-18', positions_total: 3 });
    imported = { ...role, ...fields };
    return { body: imported };
  });
  backend.handle('PATCH', roles, (request) => {
    imported = { ...imported, ...request.postDataJSON() };
    return { body: imported };
  });
  backend.reply('GET', '/rest/v1/signups', []);
  await page.goto('/#/admin/roles');
  await page.getByRole('button', { name: /bulk upload/i }).click();
  const template = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV Template' }).click();
  expect((await template).suggestedFilename()).toMatch(/\.csv$/i);
  const csv = 'name,event_date,positions_total,start_time,end_time\nFixture CSV Shift,2099-04-18,3,08:00,10:00\n';
  await page.locator('input[type=file]').setInputFiles({
    name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.getByText('Fixture CSV Shift', { exact: true })).toBeVisible();
  expect(backend.calls('POST', roles)).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import 1 Role' }).click();
  await expect(page.getByRole('heading', { name: 'Volunteer Roles' })).toBeVisible();
  await expect.poll(() => backend.calls('POST', roles)).toBe(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/i);
  const importedRow = page.getByRole('row').filter({ hasText: 'Fixture CSV Shift' });
  await importedRow.getByTitle('Show on homepage').click();
  await expect(page.getByTitle('Remove from homepage')).toBeVisible();
  const critical = page.getByTitle('Number of must-fill spots in this role');
  await critical.fill('2');
  await critical.blur();
  await expect(page.getByText('2 open critical')).toBeVisible();
  expect(imported).toMatchObject({ featured: true, critical_positions_required: 2 });
});

test('admin targets confirmed volunteers who have yet to sign the current waiver', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  backend.reply('GET', '/rest/v1/profiles', [
    { ...profile, signups: [{ status: 'confirmed', role }], waivers: [] },
    { ...profile, id: '00000000-0000-4000-8000-000000000022', email: 'signed@example.invalid',
      signups: [{ status: 'confirmed', role }], waivers: [{ waiver_version: 1 }] },
  ]);
  backend.reply('GET', '/rest/v1/email_digest_settings', [{ admin_daily_volunteer_summary_enabled: true }]);
  await page.goto('/#/admin/communications');
  await expect(page.getByRole('button', { name: 'Send Email to 2 Recipients' })).toBeEnabled();
  await page.getByRole('radio', { name: /haven't signed the current waiver/ }).check();
  await expect(page.getByRole('button', { name: 'Send Email to 1 Recipient' })).toBeEnabled();
  await page.getByRole('button', { name: 'Use waiver reminder template' }).click();
  await expect(page.getByLabel('Subject')).toHaveValue(/waiver/i);
});

test('admin grants the volunteer leader role to a selected account', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  const member = { ...profile, email: 'member@example.invalid', role: 'volunteer', signups: [], waivers: [] };
  backend.handle('GET', '/rest/v1/profiles', () => ({ body: [member] }));
  const endpoint = '/rest/v1/rpc/set_volunteer_profile_role';
  backend.handle('POST', endpoint, (request) => {
    expect(request.postDataJSON()).toEqual({ p_profile_id: member.id, p_role: 'volunteer_leader' });
    member.role = 'volunteer_leader';
    return { body: null };
  });
  await page.goto('/#/admin/volunteers');
  const row = page.getByRole('row').filter({ hasText: member.email });
  await expect(row).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await row.getByTitle('Make Leader').click();
  await expect.poll(() => backend.calls('POST', endpoint)).toBe(1);
  await expect(row.getByText('Leader', { exact: false }).first()).toBeVisible();
});

test('admin assigns an existing volunteer to a role and cancels that assignment', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  const member = { ...profile, email: 'member@example.invalid', signups: [], waivers: [] };
  const signups = '/rest/v1/signups';
  let active = null;
  backend.reply('GET', '/rest/v1/profiles', [member]);
  backend.reply('GET', roles, [role]);
  backend.handle('GET', signups, () => ({ body: active ? [active] : [] }));
  backend.handle('POST', signups, (request) => {
    expect(request.postDataJSON()).toMatchObject({ role_id: role.id, volunteer_id: member.id, status: 'confirmed' });
    active = { id: 'fixture-signup', role_id: role.id, role, status: 'confirmed' };
    return { body: [active] };
  });
  backend.handle('PATCH', signups, (request, url) => {
    expect(url.searchParams.get('id')).toBe('eq.fixture-signup');
    expect(request.postDataJSON()).toEqual({ status: 'cancelled' });
    active = null;
    return { body: {} };
  });
  await page.goto('/#/admin/volunteers');
  const row = page.getByRole('row').filter({ hasText: member.email });
  await row.getByRole('cell', { name: member.first_name }).click();
  await page.getByLabel('Select a role to assign').selectOption(role.id);
  await page.getByRole('button', { name: 'Add to Role' }).click();
  await expect(page.getByRole('heading', { name: 'Current Signups (1)' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTitle('Remove signup').click();
  await expect(page.getByText('No current signups')).toBeVisible();
});

test('admin copies the NICA summary and manages team coaches and their digest', async ({ page, backend, context }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  mockAdminReads(backend);
  backend.reply('GET', '/rest/v1/profiles', [{ ...profile, signups: [], waivers: [] }]);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Albany' }]);
  const coaches = '/rest/v1/nica_coaches';
  const settings = '/rest/v1/email_digest_settings';
  let coach;
  backend.handle('GET', coaches, () => ({ body: coach ? [coach] : [] }));
  backend.handle('POST', coaches, (request) => {
    coach = { ...request.postDataJSON(), id: 'fixture-coach' };
    return { body: {} };
  });
  backend.handle('PATCH', coaches, (request) => {
    coach = { ...coach, ...request.postDataJSON() };
    return { body: {} };
  });
  backend.handle('DELETE', coaches, () => {
    coach = undefined;
    return { body: {} };
  });
  backend.reply('GET', settings, { nica_coach_daily_digest_enabled: true });
  backend.handle('PATCH', settings, (request) => {
    expect(request.postDataJSON()).toMatchObject({ nica_coach_daily_digest_enabled: false });
    return { body: {} };
  });
  await page.goto('/#/admin/volunteers');
  await page.getByRole('button', { name: 'Show NICA', exact: true }).click();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Albany');
  await page.getByRole('button', { name: 'NICA Coaches', exact: true }).click();
  const digest = page.getByRole('checkbox', { name: /Daily signup summary emails to team coaches/ });
  await digest.uncheck();
  await expect.poll(() => backend.calls('PATCH', settings)).toBe(1);
  await expect(digest).not.toBeChecked();

  await page.getByLabel('First name', { exact: true }).fill('Fixture');
  await page.getByLabel('Last name', { exact: true }).fill('Coach');
  await page.getByLabel('Email', { exact: true }).fill('coach@example.invalid');
  await page.getByLabel('Team / Club', { exact: true }).selectOption('fixture-team');
  await page.getByLabel('Email end date', { exact: true }).fill('2099-04-18');
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'coach@example.invalid' });
  await row.getByText('Fixture Coach', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'NICA coach' });
  await dialog.getByLabel(/Daily emails end/).fill('2099-04-19');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row.getByText('2099-04-19')).toBeVisible();
  await row.getByText('Fixture Coach', { exact: true }).click();
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(/No NICA coaches yet/)).toBeVisible();
});

test('admin role and schedule filters count each confirmed volunteer once', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  await expect(page).toHaveURL(/#\/my-signups$/);
  mockAdminReads(backend);
  const secondRole = { ...role, id: 'fixture-second-shift', name: 'Aid station' };
  const monthlyRole = { ...role, id: 'fixture-monthly-shift', name: 'Planning', event_date: null, completion_month: '2099-05-01' };
  const nestedMonthlyRole = { ...monthlyRole, completion_month: undefined };
  backend.reply('GET', '/rest/v1/profiles', [
    { ...profile, signups: [{ status: 'confirmed', role }, { status: 'confirmed', role: secondRole }], waivers: [] },
    { ...profile, id: 'fixture-second-recipient', email: 'second@example.invalid',
      signups: [{ status: 'confirmed', role: secondRole }, { status: 'confirmed', role: nestedMonthlyRole }], waivers: [] },
    { ...profile, id: 'fixture-cancelled-recipient', email: 'cancelled@example.invalid',
      signups: [{ status: 'cancelled', role }], waivers: [] },
  ]);
  backend.reply('GET', roles, [role, secondRole, monthlyRole].map((shift) => ({ ...shift, signups: [{ count: 1 }] })));
  backend.reply('GET', '/rest/v1/email_digest_settings', [{ admin_daily_volunteer_summary_enabled: true }]);
  await page.goto('/#/admin/communications');
  await expect(page.getByRole('button', { name: 'Send Email to 3 Recipients' })).toBeEnabled();
  await page.getByRole('radio', { name: 'Volunteers for specific role' }).check();
  await page.locator('select.select-input').selectOption(role.id);
  await expect(page.getByRole('button', { name: 'Send Email to 1 Recipient' })).toBeEnabled();
  await page.getByRole('radio', { name: /Volunteers for schedule/ }).check();
  await page.locator('select.select-input').selectOption(`d:${role.event_date}`);
  await expect(page.getByRole('button', { name: 'Send Email to 2 Recipients' })).toBeEnabled();
  await page.locator('select.select-input').selectOption(`m:${monthlyRole.completion_month}`);
  await expect(page.getByRole('button', { name: 'Send Email to 1 Recipient' })).toBeEnabled();
});
