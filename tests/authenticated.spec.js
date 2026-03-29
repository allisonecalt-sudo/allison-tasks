const { test, expect } = require('@playwright/test');
const { login } = require('./login');

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
    // Click recurring tab
    await page.locator('button[data-tab="recurring"]').click();
    // Should show the add form at minimum
    await expect(page.locator('.add-form-section')).toBeVisible();
    // Should have type selector (fixed/rolling)
    await expect(page.locator('#recType')).toBeVisible();
    await expect(page.locator('#recAnchor')).toBeVisible();
  });

  test('events tab loads without errors', async ({ page }) => {
    await page.locator('button[data-tab="events"]').click();
    await expect(page.locator('.add-form-section')).toBeVisible();
  });

  test('edit modal has subtask date field', async ({ page }) => {
    // Click first task card to open edit modal
    const firstTask = page.locator('.task-card').first();
    if (await firstTask.count() > 0) {
      await firstTask.click();
      // Check that subtask input area exists with date field
      await expect(page.locator('#newSubtaskInput')).toBeVisible();
      await expect(page.locator('#newSubtaskDate')).toBeVisible();
    }
  });

  test('all tabs load without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    const tabs = ['day', 'focus', 'all', 'streams', 'week', 'events', 'recurring', 'done'];
    for (const tab of tabs) {
      await page.locator(`button[data-tab="${tab}"]`).click();
      await page.waitForTimeout(500);
    }
    expect(errors.filter(e => !e.includes('favicon'))).toEqual([]);
  });
});
