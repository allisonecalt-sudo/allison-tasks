const { test } = require('@playwright/test');

test('debug - what url does playwright actually hit', async ({ page }) => {
  await page.goto('/');
  const url = page.url();
  const title = await page.title();
  const html = await page.content();
  console.log('FINAL URL:', url);
  console.log('TITLE:', title);
  console.log('HTML snippet:', html.slice(0, 300));
  await page.screenshot({ path: 'test-results/debug-landing.png', fullPage: true });
});
