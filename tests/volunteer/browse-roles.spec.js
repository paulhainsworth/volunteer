import { test, expect, role } from '../helpers/browser.js';

test('loads fill counts, filters roles, and opens signup', async ({ page, backend }) => {
  let finish;
  const results = new Promise((resolve) => { finish = resolve; });
  backend.handle('GET', '/rest/v1/volunteer_roles', () => results);
  backend.reply('POST', '/rest/v1/rpc/get_confirmed_signup_counts', [{ role_id: role.id, cnt: 1 }]);
  backend.reply('GET', '/rest/v1/waiver_settings', { version: 1, waiver_text: 'Fixture waiver' });
  backend.reply('GET', '/rest/v1/team_club_affiliations', []);
  await page.goto('/#/volunteer');
  await expect(page.getByText('Loading opportunities...')).toBeVisible();
  finish({ body: [role, { ...role, id: 'other-role', name: 'Registration Desk' }] });
  await page.getByRole('button', { name: /General Opportunities/ }).click();
  await expect(page.getByText(role.name, { exact: true })).toBeVisible();
  const search = page.getByPlaceholder('Search roles...');
  await search.fill('Marshal');
  await expect(page.getByText('Registration Desk', { exact: true })).toHaveCount(0);
  await expect(page.getByText('1 / 3 spots filled')).toBeVisible();
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByText('Fixture waiver')).toBeVisible();
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
