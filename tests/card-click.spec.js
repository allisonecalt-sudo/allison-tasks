const { test, expect } = require('@playwright/test');

test('card click behavior', async ({ page }) => {
  await page.goto('/allison-tasks/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const authVisible = await page.locator('#authScreen').isVisible().catch(() => false);
  if (authVisible) {
    await page.locator('#authEmail').fill('allisonecalt@gmail.com');
    await page.locator('#authPass').fill('Coppoc12!!');
    await page.locator('#authBtn').click();
    await page.waitForTimeout(3000);
  }
  await page.waitForSelector('#mainContent', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Switch to All tab to see tasks
  await page.locator('.tab-btn[data-tab="all"]').click();
  await page.waitForTimeout(1000);

  const cards = await page.locator('.task-card').all();
  console.log('Task cards found:', cards.length);
  if (cards.length === 0) { console.log('NO CARDS — cannot test click'); return; }

  // Screenshot before click
  await page.screenshot({ path: 'test-results/card-before-click.png', fullPage: false });

  // SINGLE CLICK — should expand card (show notes/metadata), NOT open modal
  await cards[0].click();
  await page.waitForTimeout(500);
  const hasExpanded = await cards[0].evaluate(el => el.classList.contains('expanded'));
  console.log('After single click — expanded class:', hasExpanded);

  const modalVisible = await page.locator('#editModal.visible').isVisible().catch(() => false);
  console.log('After single click — modal visible:', modalVisible);

  await page.screenshot({ path: 'test-results/card-after-single-click.png', fullPage: false });

  // SINGLE CLICK AGAIN — should collapse
  await cards[0].click();
  await page.waitForTimeout(500);
  const stillExpanded = await cards[0].evaluate(el => el.classList.contains('expanded'));
  console.log('After second click — expanded class:', stillExpanded);

  // DOUBLE CLICK — should open edit modal
  await cards[0].dblclick();
  await page.waitForTimeout(500);
  const modalAfterDbl = await page.locator('#editModal.visible').isVisible().catch(() => false);
  console.log('After double click — modal visible:', modalAfterDbl);

  await page.screenshot({ path: 'test-results/card-after-dblclick.png', fullPage: false });

  // Check subtask section exists in modal
  const subtaskSection = await page.locator('#editSubtasks').isVisible().catch(() => false);
  console.log('Subtask section in modal:', subtaskSection);

  const subtaskInput = await page.locator('#newSubtaskInput').isVisible().catch(() => false);
  console.log('Subtask input visible:', subtaskInput);

  console.log('\n=== SUMMARY ===');
  console.log('Single click expands:', hasExpanded);
  console.log('Single click does NOT open modal:', !modalVisible);
  console.log('Double click opens modal:', modalAfterDbl);
  console.log('Subtask UI present:', subtaskSection && subtaskInput);
});
