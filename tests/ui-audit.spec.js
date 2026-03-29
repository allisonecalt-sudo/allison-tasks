const { test, expect } = require('@playwright/test');
const { EMAIL, PASSWORD: PASS } = require('./auth.config');

async function login(page) {
  await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const authVisible = await page.locator('#authScreen').isVisible().catch(() => false);
  if (authVisible) {
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPass').fill(PASS);
    await page.locator('#authBtn').click();
    await page.waitForTimeout(3000);
  }
  await page.waitForSelector('#mainContent', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

test.describe('UI Audit — what works, what doesnt', () => {

  test('login flow', async ({ page }) => {
    await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const title = await page.title();
    console.log('PAGE TITLE:', title);

    const authVisible = await page.locator('#authScreen').isVisible().catch(() => false);
    console.log('Auth screen visible:', authVisible);

    await login(page);

    const url = page.url();
    console.log('URL after login:', url);

    // Screenshot after login
    await page.screenshot({ path: 'test-results/01-after-login.png', fullPage: true });

    // Check what's visible
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const visibleHeadings = await page.locator('h1, h2, h3, [class*="title"], [class*="header"]').allInnerTexts().catch(() => []);
    console.log('Visible headings:', visibleHeadings.slice(0, 10));
  });

  test('main app - what tabs/views exist', async ({ page }) => {
    await login(page);

    // Find all navigation items
    const navItems = await page.locator('nav *, [class*="tab"], [class*="nav"], [role="tab"], [data-tab]').allInnerTexts().catch(() => []);
    console.log('NAV ITEMS FOUND:', navItems.filter(t => t.trim()).slice(0, 20));

    await page.screenshot({ path: 'test-results/02-main-view.png', fullPage: true });

    // Find all buttons
    const buttons = await page.locator('button').allInnerTexts().catch(() => []);
    console.log('BUTTONS VISIBLE:', buttons.filter(t => t.trim()).slice(0, 30));
  });

  test('click each tab and screenshot', async ({ page }) => {
    await login(page);

    const tabs = await page.locator('[data-tab], [class*="tab-btn"], [class*="tabBtn"], nav button').all().catch(() => []);
    console.log('Number of clickable tabs:', tabs.length);

    for (let i = 0; i < tabs.length; i++) {
      try {
        const label = await tabs[i].innerText();
        await tabs[i].click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: `test-results/tab-${i+1}-${label.trim().slice(0,20).replace(/[^a-z0-9]/gi,'_')}.png`, fullPage: true });
        console.log(`TAB ${i+1} "${label.trim()}" — clicked OK`);

        // Check for JS errors on this tab
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        if (errors.length) console.log(`  JS errors on this tab:`, errors);

      } catch(e) {
        console.log(`TAB ${i+1} — FAILED: ${e.message}`);
      }
    }
  });

  test('task list - what shows up', async ({ page }) => {
    await login(page);

    // Find task items
    const tasks = await page.locator('[class*="task"], [class*="card"], li[data-id]').all().catch(() => []);
    console.log('TASK ITEMS VISIBLE:', tasks.length);

    if (tasks.length > 0) {
      const firstTask = await tasks[0].innerText().catch(() => '');
      console.log('First task text:', firstTask.slice(0, 100));

      // Try clicking first task
      try {
        await tasks[0].click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-results/03-task-clicked.png', fullPage: true });
        console.log('Clicking first task — OK');
      } catch(e) {
        console.log('Clicking first task — FAILED:', e.message);
      }
    } else {
      console.log('NO TASKS VISIBLE — might be wrong selector or wrong view');
      const pageContent = await page.locator('body').innerText().catch(() => '');
      console.log('Page content preview:', pageContent.slice(0, 500));
    }
  });

  test('add task button - does it open something', async ({ page }) => {
    await login(page);

    // Look for add/new task button
    const addBtns = await page.locator('button:has-text("+"), button:has-text("Add"), button:has-text("New"), [class*="add"], [id*="add"]').all().catch(() => []);
    console.log('ADD BUTTONS FOUND:', addBtns.length);

    for (const btn of addBtns.slice(0, 3)) {
      try {
        const label = await btn.innerText();
        const visible = await btn.isVisible();
        console.log(`Add button "${label.trim()}" visible: ${visible}`);
        if (visible) {
          await btn.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: 'test-results/04-add-task-opened.png', fullPage: true });
          // Did a modal/form open?
          const modal = await page.locator('[class*="modal"], [class*="drawer"], [class*="form"], dialog').isVisible().catch(() => false);
          console.log('Modal/form opened after clicking add:', modal);
          break;
        }
      } catch(e) {
        console.log('Add button error:', e.message);
      }
    }
  });

  test('filter/sort controls - what exists', async ({ page }) => {
    await login(page);

    const filters = await page.locator('[class*="filter"], [class*="sort"], select, [role="combobox"]').all().catch(() => []);
    console.log('FILTER/SORT CONTROLS:', filters.length);

    for (const f of filters.slice(0, 5)) {
      const tag = await f.evaluate(el => el.tagName);
      const text = await f.innerText().catch(() => '');
      const placeholder = await f.getAttribute('placeholder').catch(() => '');
      console.log(` - ${tag}: "${text.trim().slice(0,40)}" placeholder="${placeholder}"`);
    }

    await page.screenshot({ path: 'test-results/05-filters.png', fullPage: true });
  });

  test('check for console errors throughout', async ({ page }) => {
    const errors = [];
    const warnings = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));

    await login(page);
    await page.waitForTimeout(2000);

    // Click around a bit
    const tabs = await page.locator('[data-tab], nav button').all().catch(() => []);
    for (const tab of tabs.slice(0, 4)) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    console.log('\n=== CONSOLE ERRORS ===');
    if (errors.length === 0) console.log('None! Clean.');
    errors.forEach(e => console.log('ERROR:', e));

    console.log('\n=== WARNINGS ===');
    if (warnings.length === 0) console.log('None.');
    warnings.slice(0, 10).forEach(w => console.log('WARN:', w));
  });

});
