import { test, expect, role } from '../helpers/browser.js';

test('loads fill counts, filters roles, and opens signup', async ({ page, backend }) => {
  let finish;
  const results = new Promise((resolve) => { finish = resolve; });
  backend.handle('GET', '/rest/v1/volunteer_roles', () => results);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 1 }]);
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  await page.goto('/#/volunteer');
  await expect(page.getByText('Loading opportunities...')).toBeVisible();
  for (const name of ['Sort by', 'Event day', 'Availability', 'Duration']) {
    await expect(page.getByRole('combobox', { name, exact: true })).toBeVisible();
  }
  finish({ body: [role, { ...role, id: 'other-role', name: 'Registration Desk' }] });
  await page.getByRole('button', { name: /General Opportunities/ }).click();
  await expect(page.getByText(role.name, { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search roles' });
  await search.fill('Marshal');
  await expect(page.getByText('Registration Desk', { exact: true })).toHaveCount(0);
  await expect(page.getByText('1 / 3 spots filled')).toBeVisible();
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Sign Up for ${role.name}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Waiver' })).toBeVisible();
});

test('phone filters keep search and availability visible and retain selections', async ({ page, backend }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', []);
  await page.goto('/#/volunteer');

  await expect(page.getByRole('searchbox', { name: 'Search roles' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Availability' })).toBeVisible();
  const filters = page.getByRole('button', { name: /^Filters/ });
  const duration = page.getByRole('combobox', { name: 'Duration', exact: true });
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await expect(duration).toBeHidden();
  await page.getByRole('button', { name: /General Opportunities/ }).click();
  await expect(page.getByText(role.name, { exact: true })).toBeInViewport();

  await filters.press('Enter');
  await expect(filters).toHaveAttribute('aria-expanded', 'true');
  await duration.selectOption('1-or-less');
  await expect(page.getByText('No volunteer opportunities found matching your filters.')).toBeVisible();
  await filters.press('Enter');
  await expect(filters).toHaveAccessibleName('Filters (1)');
  await expect(duration).toBeHidden();
  await filters.press('Enter');
  await expect(duration).toHaveValue('1-or-less');
  await duration.selectOption('all');
  await expect(page.getByRole('button', { name: /General Opportunities/ })).toBeVisible();
});

test('the signup dialog affiliation select matches the full-width form fields in both themes', async ({ page, backend }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', []);
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{ id: 'fixture-team', name: 'Fixture Cycling' }]);
  await page.goto('/#/volunteer');
  await page.getByRole('button', { name: /General Opportunities/ }).click();
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  const affiliation = page.getByRole('combobox', { name: /Team \/ Club Affiliation/ });
  const email = page.getByLabel(/Email Address/);
  await expect(affiliation).toBeVisible();
  expect(await affiliation.boundingBox()).toMatchObject({ width: (await email.boundingBox()).width });
  await expect(affiliation).toHaveCSS('min-height', '44px');
  await expect(affiliation).toHaveCSS('background-color', 'rgb(27, 30, 36)');
  await expect(affiliation).toHaveCSS('color', 'rgb(226, 232, 240)');
  await affiliation.selectOption('fixture-team');
  await expect(affiliation).toHaveValue('fixture-team');

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const menu = page.getByRole('button', { name: 'Toggle menu' });
  await menu.click();
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await menu.press('Escape');
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(affiliation).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('homepage leads to volunteer shifts and shows open spots', async ({ page, backend }) => {
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 2 }]);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Find a volunteer shift' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Course Marshal.*1 spot open/ })).toBeVisible();
  await page.getByRole('link', { name: 'Browse volunteer shifts' }).click();
  await expect(page.getByRole('heading', { name: 'Volunteer Opportunities' })).toBeVisible();
});

test('homepage explains the 2026 volunteer impact and serves a favicon', async ({ page, backend }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  backend.reply('GET', '/rest/v1/volunteer_roles', []);
  await page.goto('/#/');
  const impact = page.getByRole('region', { name: 'Your shift supports East Bay youth cycling' });
  await expect(impact).toBeVisible();
  const amount = impact.getByText('$28,610', { exact: true });
  await expect(amount).toBeVisible();
  await expect(amount).toHaveCSS('color', 'rgb(226, 232, 240)');
  await expect(impact).toContainText('Raised in 2026');
  await expect(impact).toContainText('East Bay high school teams supported');
  await expect(impact.getByText('6', { exact: true })).toBeVisible();
  await expect(impact.getByRole('link', { name: 'Berkeley Omnium', exact: true })).toHaveAttribute('href', 'https://berkeleyomnium.com/');
  await expect(impact.getByRole('link', { name: 'Where the proceeds go' })).toHaveAttribute('href', 'https://berkeleyomnium.com/impact');
  await expect(impact.getByRole('link', { name: 'Berkeley Bicycle Club' })).toHaveAttribute('href', 'https://berkeleybikeclub.org/');
  const teams = impact.getByRole('list', { name: 'NICA teams supported in 2026' });
  const teamLinks = [
    ['Albany High School', 'https://www.instagram.com/ahscougarsmtb/'],
    ['Berkeley High School', 'https://www.berkeleymtbteam.com/'],
    ['El Cerrito High School', 'https://echsmtb.com/'],
    ['Oakland Composite', 'https://oaklandcompositemtb.com/'],
    ['Oakland Technical High School', 'https://www.facebook.com/OaklandTechMTB'],
    ['Skyline High School', 'https://skylinehighbiketeam.com/'],
  ];
  await expect(teams.getByRole('link')).toHaveCount(teamLinks.length);
  for (const [name, url] of teamLinks) {
    const link = teams.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveCSS('min-height', '44px');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await expect(page).toHaveTitle('Berkeley Omnium Volunteer Hub');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  const favicon = await page.request.get('/favicon.svg');
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
});

for (const [status, response, message] of [
  [200, [], 'No volunteer opportunities found matching your filters.'],
  [503, { message: 'Fixture roles unavailable' }, 'Fixture roles unavailable'],
]) {
  test(`distinguishes a roles response with status ${status}`, async ({ page, backend }) => {
    backend.reply('GET', '/rest/v1/volunteer_roles', response, status);
    await page.goto('/#/volunteer');
    await expect(page.getByText(message)).toBeVisible();
  });
}
