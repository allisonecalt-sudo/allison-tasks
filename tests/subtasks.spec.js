const { test, expect } = require('@playwright/test');
const { login } = require('./login');

const PREFIX = 'PW_SUB_';

function uid(label) {
  return `${PREFIX}${label}_${Date.now()}`;
}

/** Clean up test tasks by searching for PREFIX in card text */
async function cleanup(page) {
  // Close any open modal first
  const modal = page.locator('#editModal.visible');
  if ((await modal.count()) > 0) {
    await page.click('.modal-cancel');
    await page.waitForTimeout(300);
  }

  let cards = page.locator('.task-card', { hasText: PREFIX });
  let count = await cards.count();
  while (count > 0) {
    await cards.first().dblclick();
    await expect(page.locator('#editModal.visible')).toBeVisible({ timeout: 5000 });
    await page.click('.modal-delete');
    await page.click('.confirm-yes');
    await page.waitForTimeout(600);
    cards = page.locator('.task-card', { hasText: PREFIX });
    count = await cards.count();
  }
}

test.describe('Parent / Child (Subtask) functionality', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page);
  });

  test('add subtasks to a parent task and see progress badge', async ({ page }) => {
    const title = uid('parent');

    // Quick-add parent task
    await page.fill('#qaInput', title);
    await page.click('#qaBtn');
    await page.waitForTimeout(800);

    // Open edit modal via double-click
    const card = page.locator('.task-card', { hasText: title }).first();
    await card.dblclick();
    await expect(page.locator('#editModal.visible')).toBeVisible();

    // Should show "No subtasks yet"
    await expect(page.locator('#editSubtasks')).toContainText('No subtasks yet');

    // Add two subtasks
    await page.fill('#newSubtaskInput', 'Sub A');
    await page.locator('#editSubtasks + div button').last().click();
    await page.waitForTimeout(600);

    await page.fill('#newSubtaskInput', 'Sub B');
    await page.locator('#editSubtasks + div button').last().click();
    await page.waitForTimeout(600);

    // Both appear in modal
    await expect(page.locator('#editSubtasks')).toContainText('Sub A');
    await expect(page.locator('#editSubtasks')).toContainText('Sub B');

    // Save and close
    await page.click('.modal-save');
    await page.waitForTimeout(600);

    // Card shows 0/2 progress
    const updatedCard = page.locator('.task-card', { hasText: title }).first();
    await expect(updatedCard.locator('.child-progress').first()).toContainText('0/2');
  });

  test('complete a subtask updates progress count', async ({ page }) => {
    const title = uid('check');

    await page.fill('#qaInput', title);
    await page.click('#qaBtn');
    await page.waitForTimeout(800);

    // Open edit, add subtask
    await page.locator('.task-card', { hasText: title }).first().dblclick();
    await expect(page.locator('#editModal.visible')).toBeVisible();

    await page.fill('#newSubtaskInput', 'Checkable sub');
    await page.locator('#editSubtasks + div button').last().click();
    await page.waitForTimeout(600);

    // Toggle the subtask done
    await page.locator('#editSubtasks .task-child-check').first().click();
    await page.waitForTimeout(600);

    // Should show checked
    await expect(page.locator('#editSubtasks .task-child-check.checked')).toHaveCount(1);

    await page.click('.modal-save');
    await page.waitForTimeout(600);

    // Card should show 1/1
    const card = page.locator('.task-card', { hasText: title }).first();
    await expect(card.locator('.child-progress').first()).toContainText('1/1');
  });

  test('delete a subtask removes it', async ({ page }) => {
    const title = uid('del');

    await page.fill('#qaInput', title);
    await page.click('#qaBtn');
    await page.waitForTimeout(800);

    await page.locator('.task-card', { hasText: title }).first().dblclick();
    await expect(page.locator('#editModal.visible')).toBeVisible();

    await page.fill('#newSubtaskInput', 'Will delete');
    await page.locator('#editSubtasks + div button').last().click();
    await page.waitForTimeout(600);

    await expect(page.locator('#editSubtasks')).toContainText('Will delete');

    // Click remove button
    await page.locator('#editSubtasks button[title="Remove"]').first().click();
    await page.waitForTimeout(600);

    // Back to empty
    await expect(page.locator('#editSubtasks')).toContainText('No subtasks yet');
  });

  test('subtask with due date persists the date', async ({ page }) => {
    const title = uid('date');

    await page.fill('#qaInput', title);
    await page.click('#qaBtn');
    await page.waitForTimeout(800);

    await page.locator('.task-card', { hasText: title }).first().dblclick();
    await expect(page.locator('#editModal.visible')).toBeVisible();

    await page.fill('#newSubtaskInput', 'Dated sub');
    await page.fill('#newSubtaskDate', '2026-04-15');
    await page.locator('#editSubtasks + div button').last().click();
    await page.waitForTimeout(600);

    // The date input in subtask row should have the date
    const dateInput = page.locator('#editSubtasks input[type="date"]').first();
    await expect(dateInput).toHaveValue('2026-04-15');
  });

  test('subtasks do not appear as standalone cards', async ({ page }) => {
    const title = uid('hidden');
    const subName = `NOSOLO_${Date.now()}`;

    await page.fill('#qaInput', title);
    await page.click('#qaBtn');
    await page.waitForTimeout(800);

    await page.locator('.task-card', { hasText: title }).first().dblclick();
    await expect(page.locator('#editModal.visible')).toBeVisible();

    await page.fill('#newSubtaskInput', subName);
    await page.locator('#editSubtasks + div button').last().click();
    await page.waitForTimeout(600);

    await page.click('.modal-save');
    await page.waitForTimeout(600);

    // The subtask name should NOT appear as its own top-level task card title
    const soloCards = page.locator('.task-title', { hasText: subName });
    await expect(soloCards).toHaveCount(0);
  });

  test('expanded card shows subtasks inline', async ({ page }) => {
    const title = uid('expand');

    await page.fill('#qaInput', title);
    await page.click('#qaBtn');
    await page.waitForTimeout(800);

    await page.locator('.task-card', { hasText: title }).first().dblclick();
    await expect(page.locator('#editModal.visible')).toBeVisible();

    await page.fill('#newSubtaskInput', 'Inline child');
    await page.locator('#editSubtasks + div button').last().click();
    await page.waitForTimeout(600);

    await page.click('.modal-save');
    await page.waitForTimeout(600);

    // Single-click to expand the card
    const card = page.locator('.task-card', { hasText: title }).first();
    await card.locator('.task-body').click();
    await page.waitForTimeout(400);

    // Expanded card should show child tasks section
    await expect(card.locator('.task-children')).toContainText('Inline child');
  });
});
