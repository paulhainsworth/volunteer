import { test, expect } from '../helpers/browser.js';

const endpoint = '/functions/v1/send-magic-link';

test('validates email and prevents a second submission while sending', async ({ page, backend }) => {
  let finish;
  const response = new Promise((resolve) => { finish = resolve; });
  backend.handle('POST', endpoint, () => response);

  await page.goto('/#/auth/login');
  const email = page.getByRole('textbox', { name: 'Email' });
  const button = page.getByRole('button', { name: 'Send sign-in link' });
  await email.fill('invalid-email');
  await button.click();
  await expect(email).toBeFocused();
  expect(backend.calls('POST', endpoint)).toBe(0);

  await email.fill('volunteer@example.invalid');
  await button.click();
  await expect(page.getByRole('button', { name: 'Sending link...' })).toBeDisabled();
  finish({ body: { success: true } });
  await expect(page.getByText('Check your email')).toBeVisible();
  expect(backend.calls('POST', endpoint)).toBe(1);
});

test('shows a delivery failure and lets the volunteer retry', async ({ page, backend }) => {
  backend.reply('POST', endpoint, { error: 'Fixture mail unavailable' }, 503);
  await page.goto('/#/auth/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('volunteer@example.invalid');
  const send = page.getByRole('button', { name: 'Send sign-in link' });
  await send.click();
  await expect(page.getByText('Fixture mail unavailable')).toBeVisible();

  backend.reply('POST', endpoint, { success: true });
  await send.click();
  await expect(page.getByText('Check your email')).toBeVisible();
  expect(backend.calls('POST', endpoint)).toBe(2);
});
