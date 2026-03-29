const { test } = require('@playwright/test');
const { EMAIL, PASSWORD } = require('./auth.config');

test('debug arrow rendering', async ({ page }) => {
  await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('#authEmail').fill(EMAIL);
  await page.locator('#authPass').fill(PASSWORD);
  await page.locator('#authBtn').click();
  await page.waitForTimeout(3000);

  // Go to All tab
  await page.locator('text=All').first().click();
  await page.waitForTimeout(1000);

  // Get the raw HTML of all sort buttons
  const sortHTML = await page.evaluate(() => {
    const btns = document.querySelectorAll('.filter-chip');
    return Array.from(btns).map(b => ({ text: b.textContent, html: b.innerHTML }));
  });
  sortHTML.forEach(b => console.log('BUTTON:', JSON.stringify(b)));

  // Check allFilters state
  const filters = await page.evaluate(() => window.allFilters);
  console.log('allFilters:', JSON.stringify(filters));
});
