const { test, expect } = require('@playwright/test');
const { login } = require('./login');

const PREFIX = 'PW_SUB_';

function uid(label) {
  return `${PREFIX}${label}_${Date.now()}`;
}

const SB_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co/rest/v1';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';
const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

/** Clean up test tasks via Supabase REST API — no fragile UI clicks */
async function cleanup() {
  // Find all test tasks (PW_SUB_* and NOSOLO_*)
  const res = await fetch(
    `${SB_URL}/tasks?or=(title.like.${PREFIX}*,title.like.NOSOLO_*)&select=id`,
    { headers: sbHeaders },
  );
  const tasks = await res.json();
  if (!tasks || tasks.length === 0) return;

  const parentIds = tasks.map((t) => t.id);

  // Get IDs of children too (Sub A, Sub B, Checkable sub, Inline child, etc.)
  const childRes = await fetch(
    `${SB_URL}/tasks?parent_id=in.(${parentIds.join(',')})&select=id`,
    { headers: sbHeaders },
  );
  const children = await childRes.json();
  const childIds = (children || []).map((c) => c.id);

  const allIds = [...parentIds, ...childIds];

  // Delete task_history first (foreign key constraint)
  if (allIds.length > 0) {
    await fetch(`${SB_URL}/task_history?task_id=in.(${allIds.join(',')})`, {
      method: 'DELETE',
      headers: sbHeaders,
    });
  }

  // Delete children
  if (childIds.length > 0) {
    await fetch(`${SB_URL}/tasks?id=in.(${childIds.join(',')})`, {
      method: 'DELETE',
      headers: sbHeaders,
    });
  }

  // Delete parents
  await fetch(`${SB_URL}/tasks?id=in.(${parentIds.join(',')})`, {
    method: 'DELETE',
    headers: sbHeaders,
  });
}

/** Global cleanup — runs before + after the whole suite */
test.beforeAll(async () => {
  await cleanup();
});
test.afterAll(async () => {
  await cleanup();
});

test.describe('Parent / Child (Subtask) functionality', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Switch to "All" tab so quick-added tasks (no date) are visible
    await page.locator('#tabBar button[data-tab="all"]').click();
    await page.waitForTimeout(500);
  });

  test.afterEach(async () => {
    await cleanup();
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

    // Toggle the subtask done — click and wait for API + re-render
    await page.locator('#editSubtasks .task-child-check').first().click();
    // Wait long enough for async API call + setTimeout re-render
    await page.waitForTimeout(2000);

    // Close modal without save (toggle already saved via API)
    await page.click('.modal-cancel');
    await page.waitForTimeout(500);

    // Card should show 1/1 progress
    const card = page.locator('.task-card', { hasText: title }).first();
    await expect(card.locator('.child-progress').first()).toContainText('1/1', { timeout: 5000 });
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

    // Close modal — cancel is fine, subtask was already saved to DB via addSubtask
    await page.click('.modal-cancel');
    await page.waitForTimeout(500);

    // Refresh to ensure local state has the subtask
    await page.locator('#tabBar button[data-tab="all"]').click();
    await page.waitForTimeout(500);

    // Single-click to expand the card
    const card = page.locator('.task-card', { hasText: title }).first();
    await card.locator('.task-body').click();
    await page.waitForTimeout(400);

    // Expanded card should show child tasks section
    await expect(card.locator('.task-children')).toContainText('Inline child');
  });
});
