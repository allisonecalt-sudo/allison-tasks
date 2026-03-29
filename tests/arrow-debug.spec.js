const { test } = require('@playwright/test');
const { login } = require('./login');

test('debug arrow rendering', async ({ page }) => {
  await login(page);

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
