import { readFile } from 'node:fs/promises';
import { test, expect, profile, role, signInFixture } from '../helpers/browser.js';

test('admin can download the selected team roster as a PDF', async ({ page, backend }) => {
  await signInFixture(page, backend, 'admin');
  backend.handle('GET', '/rest/v1/profiles', (_request, url) => ({
    body: url.searchParams.has('id') ? [{ ...profile, role: 'admin' }] : [{
      ...profile,
      team_club_affiliation_id: 'fixture-team',
      signups: [{ id: 'fixture-signup', status: 'confirmed', role }],
    }],
  }));
  backend.reply('GET', '/rest/v1/team_club_affiliations', [{
    id: 'fixture-team', name: 'Albany High School Mountain Bike Team',
  }]);
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await page.getByLabel('NICA team for PDF export').selectOption('Albany');
  await expect(page.getByRole('button', { name: 'Add team or club' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage NICA beneficiaries' })).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'NICA Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/albany.*\.pdf$/i);
  const contents = await readFile(await download.path());
  expect(contents.subarray(0, 5).toString()).toBe('%PDF-');
  expect(contents.toString('latin1')).toContain('Course Marshal');
});
