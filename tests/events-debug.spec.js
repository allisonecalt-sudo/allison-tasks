const { test, expect } = require('@playwright/test');
const { login } = require('./login');

async function switchTab(page, tabId) {
  const mainTabs = ['day', 'focus', 'all'];
  if (mainTabs.includes(tabId)) {
    await page.locator(`#tabBar > button[data-tab="${tabId}"]`).click();
  } else {
    await page.locator('.tab-more-btn').click({ force: true });
    await page.locator('#tabMoreMenu').evaluate(el => el.classList.add('open'));
    await page.locator(`#tabMoreMenu button[data-tab="${tabId}"]`).click({ force: true });
  }
  await page.waitForTimeout(1000);
}

test('screenshot events tab and day view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  // Screenshot day view first (default)
  await switchTab(page, 'day');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'debug-day-view.png', fullPage: true });

  // Screenshot focus/todo view
  await switchTab(page, 'focus');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'debug-focus-view.png', fullPage: true });

  // Screenshot all tasks view
  await switchTab(page, 'all');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'debug-all-view.png', fullPage: true });

  // Screenshot events tab
  await switchTab(page, 'events');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'debug-events-tab.png', fullPage: true });

  // Log any event cards found in each view
  console.log('Screenshots saved!');
});
