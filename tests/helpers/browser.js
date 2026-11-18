import { test as base, expect } from '@playwright/test';

export const role = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Course Marshal',
  description: 'Help riders find the course.',
  event_date: '2099-04-18',
  start_time: '08:00:00',
  end_time: '10:00:00',
  positions_total: 3,
  signups: [],
};

export const user = {
  id: '00000000-0000-4000-8000-000000000002',
  aud: 'authenticated',
  email: 'volunteer@example.invalid',
};

export const profile = {
  ...user,
  role: 'volunteer',
  first_name: 'Test',
  last_name: 'Volunteer',
  emergency_contact_name: 'Test Contact',
  emergency_contact_phone: '5550100',
};

export const waiver = { id: 'fixture-waiver', version: 1, waiver_text: 'Synthetic waiver terms' };

export const test = base.extend({
  backend: async ({ context, baseURL }, use) => {
    const handlers = new Map();
    const requests = [];
    const unexpected = [];
    const browserOrigin = new URL(baseURL).origin;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === browserOrigin) return route.continue();
      const key = `${request.method()} ${url.pathname}`;
      if (url.hostname === 'volunteer-test.invalid' && handlers.has(key)) {
        requests.push(key);
        const handler = handlers.get(key);
        const result = await handler(request, url);
        return route.fulfill({ status: result.status ?? 200, json: result.body });
      }
      unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
      await route.abort();
    });
    await use({
      reply(method, path, body, status = 200) {
        handlers.set(`${method} ${path}`, () => ({ body, status }));
      },
      handle(method, path, handler) {
        handlers.set(`${method} ${path}`, handler);
      },
      calls(method, path) {
        return requests.filter((key) => key === `${method} ${path}`).length;
      },
    });
    expect(unexpected, 'Every outbound browser request needs an explicit fixture').toEqual([]);
  },
});

export { expect };

export function fixtureSession() {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const claims = Buffer.from(JSON.stringify({ sub: user.id, exp: expiry })).toString('base64url');
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.c3ludGhldGlj`,
    refresh_token: 'fixture-refresh-token',
    expires_at: expiry,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
}

export async function signInFixture(page, backend, role = 'volunteer', { signups = [], profileFields = {} } = {}) {
  backend.reply('GET', '/auth/v1/user', user);
  backend.reply('GET', '/rest/v1/waiver_settings', waiver);
  backend.reply('GET', '/rest/v1/waivers', { waiver_version: 1 });
  backend.reply('GET', '/rest/v1/profiles', [{ ...profile, ...profileFields, role }]);
  backend.reply('GET', '/rest/v1/signups', signups);
  const session = fixtureSession();
  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: '3600',
    token_type: 'bearer',
    type: 'magiclink',
  });
  await page.goto(`/#${params}`);
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
}
