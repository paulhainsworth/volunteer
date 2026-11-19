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

test('homepage leads to volunteer shifts and shows open spots', async ({ page, backend }) => {
  backend.reply('GET', '/rest/v1/volunteer_roles', [role]);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 2 }]);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Find a volunteer shift' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Course Marshal.*1 spot open/ })).toBeVisible();
  await page.getByRole('link', { name: 'Browse volunteer shifts' }).click();
  await expect(page.getByRole('heading', { name: 'Volunteer Opportunities' })).toBeVisible();
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
