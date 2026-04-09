const { test, expect } = require('@playwright/test');
const { login } = require('./login');

// Helper: switch to a tab, opening "More" menu if needed
async function switchTab(page, tabId) {
  // Main tabs: day, focus, all, streams, week. Others are in "More" dropdown.
  const mainTabs = ['day', 'focus', 'all'];
  if (mainTabs.includes(tabId)) {
    await page.locator(`#tabBar > button[data-tab="${tabId}"]`).click();
  } else {
    // Open more menu and force it to stay open, then click the tab
    await page.locator('.tab-more-btn').click({ force: true });
    await page.locator('#tabMoreMenu').evaluate(el => el.classList.add('open'));
    await page.locator(`#tabMoreMenu button[data-tab="${tabId}"]`).click({ force: true });
  }
  await page.waitForTimeout(500);
}

test.describe('Authenticated tests', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

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
    await expect(page.locator('#evTitle')).toBeVisible();
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

    const tabs = ['day', 'focus', 'all', 'streams', 'week', 'events', 'recurring', 'sparks', 'done'];
    for (const tab of tabs) {
      await switchTab(page, tab);
    }
    expect(errors.filter(e => !e.includes('favicon'))).toEqual([]);
  });

  test('more menu (···) opens and shows tabs', async ({ page }) => {
    const moreBtn = page.locator('.tab-more-btn');
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();
    const menu = page.locator('#tabMoreMenu');
    await expect(menu).toHaveClass(/open/);
    // Should contain Sparks tab
    await expect(menu.locator('button[data-tab="sparks"]')).toBeVisible();
  });

  test('sparks tab loads with empty state or spark tasks', async ({ page }) => {
    await switchTab(page, 'sparks');
    // Should show either empty state or task cards — no errors
    const content = page.locator('#mainContent');
    await expect(content).toBeVisible();
    const hasCards = await content.locator('.task-card').count();
    const hasEmpty = await content.locator('.empty-state').count();
    expect(hasCards + hasEmpty).toBeGreaterThan(0);
  });

  test('counter labels render without question marks', async ({ page }) => {
    const countersBar = page.locator('#countersBar');
    await expect(countersBar).toBeVisible();
    const chips = countersBar.locator('.counter-label');
    const chipCount = await chips.count();
    for (let i = 0; i < chipCount; i++) {
      const text = await chips.nth(i).textContent();
      expect(text).not.toMatch(/\?{3,}/);
    }
  });
});
