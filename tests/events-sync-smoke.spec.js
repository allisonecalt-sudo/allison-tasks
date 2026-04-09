const { test, expect } = require('@playwright/test');
const { login } = require('./login');

test('events sync — dietitian event loads from Supabase', async ({ page }) => {
  await login(page);

  // Open More menu → Events tab
  await page.locator('.tab-more-btn').click({ force: true });
  await page.locator('#tabMoreMenu').evaluate((el) => el.classList.add('open'));
  await page.locator('#tabMoreMenu button[data-tab="events"]').click({ force: true });
  await page.waitForTimeout(1500);

  // The Dietitian event (inserted directly to Supabase) should appear
  const body = await page.locator('body').innerText();
  console.log('Events tab body snippet:', body.slice(0, 1500));

  expect(body).toContain('Dietitian');
  await page.screenshot({ path: 'events-smoke.png', fullPage: true });
});
