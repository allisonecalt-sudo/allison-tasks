const { test, expect } = require('@playwright/test');
const { EMAIL, PASSWORD } = require('./auth.config');

const APP_URL = 'https://allisonecalt-sudo.github.io/allison-tasks/';

async function login(page) {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const authVisible = await page.locator('#authEmail').isVisible().catch(() => false);
  if (authVisible) {
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPass').fill(PASSWORD);
    await page.locator('#authBtn').click();
  }
  await page.waitForTimeout(3000);
}

async function goToAllTab(page) {
  await login(page);
  // Click All tab
  const allTab = page.locator('text=All').first();
  await allTab.click();
  await page.waitForTimeout(1000);
}

test.describe('Sort & Filter', () => {

  test('sort buttons exist with arrows', async ({ page }) => {
    await goToAllTab(page);
    const dueBtn = page.locator('button.filter-chip:has-text("Due date")');
    await expect(dueBtn).toBeVisible();
    const dueBtnText = await dueBtn.innerText();
    console.log('Due date button text:', dueBtnText);
    // Click to activate arrow, then verify
    await dueBtn.click();
    await page.waitForTimeout(300);
    const afterClick = await dueBtn.innerText();
    console.log('After click:', afterClick);
    expect(afterClick).toMatch(/[↑↓]/);

    const addedBtn = page.locator('button.filter-chip:has-text("Date added")');
    await expect(addedBtn).toBeVisible();
    const editedBtn = page.locator('button.filter-chip:has-text("Last edited")');
    await expect(editedBtn).toBeVisible();
  });

  test('clicking same sort button reverses direction', async ({ page }) => {
    await goToAllTab(page);
    const dueBtn = page.locator('button.filter-chip:has-text("Due date")');

    // Get initial arrow
    const text1 = await dueBtn.innerText();
    console.log('Before click:', text1);
    const arrow1 = text1.includes('↑') ? 'up' : 'down';

    // Click same button
    await dueBtn.click();
    await page.waitForTimeout(500);

    const text2 = await dueBtn.innerText();
    console.log('After click:', text2);
    const arrow2 = text2.includes('↑') ? 'up' : 'down';

    // Arrow should have flipped
    expect(arrow2).not.toBe(arrow1);
    console.log(`Direction changed: ${arrow1} → ${arrow2} ✓`);
  });

  test('time range filters exist', async ({ page }) => {
    await goToAllTab(page);
    const todayBtn = page.locator('button.filter-chip:has-text("Today")');
    const weekBtn = page.locator('button.filter-chip:has-text("This week")');
    const monthBtn = page.locator('button.filter-chip:has-text("This month")');

    await expect(todayBtn).toBeVisible();
    await expect(weekBtn).toBeVisible();
    await expect(monthBtn).toBeVisible();
    console.log('All time range buttons visible ✓');
  });

  test('time range filter reduces task count', async ({ page }) => {
    await goToAllTab(page);

    // Count all tasks
    const allCards = await page.locator('.task-card').count();
    console.log('Total tasks (unfiltered):', allCards);

    // Click "This week"
    const weekBtn = page.locator('button.filter-chip:has-text("This week")');
    await weekBtn.click();
    await page.waitForTimeout(500);

    const weekCards = await page.locator('.task-card').count();
    console.log('Tasks this week:', weekCards);

    // Should be fewer (or equal if all are this week)
    expect(weekCards).toBeLessThanOrEqual(allCards);

    // Click again to deactivate
    await weekBtn.click();
    await page.waitForTimeout(500);
    const resetCards = await page.locator('.task-card').count();
    console.log('After deactivate:', resetCards);
    expect(resetCards).toBe(allCards);
    console.log('Toggle on/off works ✓');
  });

  test('switching sort type resets to ascending', async ({ page }) => {
    await goToAllTab(page);

    // Click Due date twice to make it descending
    const dueBtn = page.locator('button.filter-chip:has-text("Due date")');
    await dueBtn.click();
    await page.waitForTimeout(300);

    // Now click Date added — should reset to ascending
    const addedBtn = page.locator('button.filter-chip:has-text("Date added")');
    await addedBtn.click();
    await page.waitForTimeout(300);

    const text = await addedBtn.innerText();
    console.log('Date added after switch:', text);
    expect(text).toContain('↑');
    console.log('Reset to ascending on sort switch ✓');
  });

});
