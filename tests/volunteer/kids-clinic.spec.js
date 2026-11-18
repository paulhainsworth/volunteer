import { test, expect } from '../helpers/browser.js';

const endpoint = '/functions/v1/submit-kids-clinic-signup';

async function fillRegistration(page) {
  await page.goto('/#/kids');
  await page.getByLabel('Parent first name').fill('Test');
  await page.getByLabel('Parent last name').fill('Parent');
  await page.getByLabel('Parent email').fill('parent@example.invalid');
  await page.getByLabel('Child’s full name').fill('Test Child');
  await page.getByLabel('Gender').selectOption('prefer_not_to_say');
  await page.getByLabel('Age', { exact: true }).fill('10');
}

for (const emailSent of [true, false]) {
  test(`requires consent and displays the saved registration when emailSent is ${emailSent}`, async ({ page, backend }) => {
    backend.handle('POST', endpoint, (request) => {
      expect(request.postDataJSON()).toMatchObject({ child_age: 10, waiver_consent: true });
      return { body: { ok: true, emailSent } };
    });
    await fillRegistration(page);

    const submit = page.getByRole('button', { name: 'Submit registration' });
    await submit.click();
    await expect(page.getByRole('alert')).toContainText('consent to the waiver');
    expect(backend.calls('POST', endpoint)).toBe(0);

    await page.getByRole('checkbox', { name: /I am the parent/ }).check();
    await submit.click();
    const message = emailSent ? 'your signup is submitted' : 'We could not send the confirmation email';
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    expect(backend.calls('POST', endpoint)).toBe(1);
  });
}

test('keeps registration available for retry after a rejected submission', async ({ page, backend }) => {
  backend.reply('POST', endpoint, { error: 'Fixture registration unavailable' }, 503);
  await fillRegistration(page);
  await page.getByRole('checkbox', { name: /I am the parent/ }).check();
  const submit = page.getByRole('button', { name: 'Submit registration' });
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Fixture registration unavailable');
  await expect(submit).toBeEnabled();
});
