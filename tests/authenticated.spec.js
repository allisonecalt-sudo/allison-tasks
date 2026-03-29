const { test, expect } = require('@playwright/test');
const { login } = require('./login');

// Helper: switch to a tab, opening "More" menu if needed
async function switchTab(page, tabId) {
  // Main tabs: day, focus, all, streams, week. Others are in "More" dropdown.
  const mainTabs = ['day', 'focus', 'all', 'streams', 'week'];
  if (mainTabs.includes(tabId)) {
    await page.locator(`#tabBar > button[data-tab="${tabId}"]`).click();
  } else {
    await page.locator('.tab-more-btn').click();
    await page.waitForTimeout(200);
    await page.locator(`#tabMoreMenu button[data-tab="${tabId}"]`).click();
  }
  await page.waitForTimeout(500);
}

test.describe('Authenticated tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('app loads after login — ribbon and tabs visible', async ({ page }) => {
    await expect(page.locator('#ribbonGrid')).toBeVisible();
    await expect(page.locator('#tabBar')).toBeVisible();
    await expect(page.locator('#mainContent')).toBeVisible();
  });

  test('counters bar renders', async ({ page }) => {
    await expect(page.locator('#countersBar')).toBeVisible();
  });

  test('recurring tab loads without errors', async ({ page }) => {
    await switchTab(page, 'recurring');
    await expect(page.locator('.add-form-section')).toBeVisible();
    await expect(page.locator('#recType')).toBeVisible();
    await expect(page.locator('#recAnchor')).toBeVisible();
  });

  test('events tab loads without errors', async ({ page }) => {
    await switchTab(page, 'events');
    await expect(page.locator('.add-form-section')).toBeVisible();
  });

  test('edit modal has subtask date field', async ({ page }) => {
    const firstTask = page.locator('.task-card').first();
    if (await firstTask.count() > 0) {
      await firstTask.click();
      await expect(page.locator('#newSubtaskInput')).toBeVisible();
      await expect(page.locator('#newSubtaskDate')).toBeVisible();
    }
  });

  test('all tabs load without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    const tabs = ['day', 'focus', 'all', 'streams', 'week', 'events', 'recurring', 'done'];
    for (const tab of tabs) {
      await switchTab(page, tab);
    }
    expect(errors.filter(e => !e.includes('favicon'))).toEqual([]);
  });
});
