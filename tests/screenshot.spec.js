const { test } = require('@playwright/test');

test('screenshot mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'mobile-before-login.png', fullPage: true });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  // Log all visible elements
  const html = await page.evaluate(() => document.documentElement.outerHTML.substring(0, 2000));
  console.log('HTML:', html);
});
