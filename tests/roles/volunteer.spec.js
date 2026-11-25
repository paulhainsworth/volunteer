import { test, expect, ownProfile, profile, role, signInFixture } from '../helpers/browser.js';

test('dark mode is the default and the header logo adapts to both themes', async ({ page, backend }) => {
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', []);
  await page.goto('/#/auth/login');
  const themeToggle = page.getByRole('button', { name: 'Switch to light mode' });
  const logo = page.getByRole('img', { name: 'Berkeley Bicycle Club', exact: true });
  const login = page.locator('.auth-card');
  await expect(themeToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(login).toHaveCSS('background-color', 'rgb(27, 30, 36)');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(logo).toHaveCSS('filter', 'brightness(0) invert(1)');

  await page.goto('/#/volunteer');
  await page.getByRole('button', { name: /General Opportunities/ }).click();
  await page.getByRole('button', { name: 'Info', exact: true }).click();
  await expect(page.locator('.modal-content')).toHaveCSS('background-color', 'rgb(27, 30, 36)');
  await page.getByRole('button', { name: 'Close' }).click();

  await themeToggle.click();
  const lightThemeToggle = page.getByRole('button', { name: 'Switch to dark mode' });
  await expect(lightThemeToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(logo).toHaveCSS('filter', 'none');
  await expect(page.locator('.domain-section')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.reload();
  await expect(lightThemeToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
});

test('the My Signups footer fills the viewport on short pages and follows long pages', async ({ page, backend }) => {
  await signInFixture(page, backend);
  await expect(page.getByRole('heading', { name: 'My Volunteer Signups' })).toBeVisible();
  const footer = page.getByRole('contentinfo');

  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(footer).toBeInViewport();
    const box = await footer.boundingBox();
    expect(box.y + box.height).toBeCloseTo(900, 0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
  }

  await page.setViewportSize({ width: 390, height: 240 });
  await expect(footer).not.toBeInViewport();
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('the footer shows the current calendar year', async ({ page, backend }) => {
  await page.clock.setFixedTime(new Date('2032-07-01T12:00:00Z'));
  await page.goto('/#/auth/login');
  await expect(page.getByRole('contentinfo')).toContainText('© 2032 Berkeley Bicycle Club');
});

for (const [accountRole, destinations] of [
  ['volunteer', ['Browse Roles', 'My Signups']],
  ['volunteer_leader', ['My Roles', 'Browse Roles', 'My Signups']],
  ['admin', ['Dashboard', 'Roles', 'Domains', 'Users', 'Communications']],
]) {
  test(`header fits the desktop and tablet layout for ${accountRole}`, async ({ page, backend }) => {
    const email = 'fixture.long.volunteer.account.address@example.invalid';
    await page.setViewportSize({ width: 1256, height: 720 });
    await signInFixture(page, backend, accountRole, { profileFields: { email } });
    const nav = page.getByRole('navigation', { name: 'Main', exact: true });
    const menu = nav.getByRole('button', { name: 'Toggle menu' });
    const signOut = nav.getByRole('button', { name: 'Sign Out' });
    const profileLink = nav.getByRole('link', { name: email, exact: true });

    for (const width of [1256, 1101]) {
      await page.setViewportSize({ width, height: 720 });
      await expect(menu).toBeHidden();
      await expect(profileLink).toHaveCSS('text-overflow', 'ellipsis');
      const controls = [
        nav.getByRole('link', { name: /Omnium Volunteer Hub/ }),
        ...destinations.map((name) => nav.getByRole('link', { name, exact: true })),
        nav.getByRole('button', { name: 'Switch to light mode' }),
        profileLink,
        signOut,
      ];
      let right = 0;
      const header = await nav.boundingBox();
      for (const control of controls) {
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(right - 0.5);
        expect(Math.abs(box.y + box.height / 2 - header.y - header.height / 2)).toBeLessThan(1);
        right = box.x + box.width;
      }
      expect(right).toBeLessThan(width);
      for (const label of [controls[0].locator('span'), ...controls.slice(1, -3), signOut]) {
        expect(await label.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getClientRects().length;
        })).toBe(1);
      }
    }

    if (destinations.includes('My Signups')) {
      await expect(page).toHaveURL(/#\/my-signups$/);
      await expect(nav.getByRole('link', { name: 'My Signups' })).toHaveAttribute('aria-current', 'page');
    }

    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(menu).toBeVisible();
    await expect(signOut).toBeHidden();
    await menu.click();
    for (const name of destinations) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(profileLink).toBeVisible();
    await expect(signOut).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
    await menu.press('Escape');
    await expect(menu).toBeFocused();
    await expect(signOut).toBeHidden();
  });
}

test('mobile navigation exposes its state and restores focus on Escape', async ({ page, backend }) => {
  backend.reply('GET', '/rest/v1/volunteer_roles', []);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/#/auth/login');
  const menu = page.getByRole('button', { name: 'Toggle menu' });
  const signIn = page.getByRole('link', { name: 'Sign In' });
  await expect(menu).toHaveAttribute('aria-controls', 'main-navigation');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  expect(await menu.boundingBox()).toMatchObject({ width: 44, height: 44 });
  await expect(signIn).toBeHidden();

  await menu.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(signIn).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await expect(signIn).toBeHidden();

  await menu.press('Enter');
  await page.evaluate(() => { window.location.hash = '/volunteer'; });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Volunteer shifts' })).toBeVisible();
});

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
