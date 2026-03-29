const { test, expect } = require('@playwright/test');
const { EMAIL, PASSWORD } = require('./auth.config');

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const MIN_TOUCH = 44;

async function login(page) {
  await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const authVisible = await page.locator('#authEmail').isVisible().catch(() => false);
  if (authVisible) {
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPass', PASSWORD);
    await page.click('#authBtn');
  }
  // Wait for the app to be ready
  await page.waitForSelector('.tab-bar', { timeout: 15000 });
  await page.waitForTimeout(1500);
}

test.describe('Mobile Audit — iPhone 14 Pro (390×844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('no horizontal scrolling', async ({ page }) => {
    await login(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('touch targets meet 44×44px minimum', async ({ page }) => {
    await login(page);

    const results = await page.evaluate((MIN) => {
      const interactives = document.querySelectorAll(
        'button, input, [onclick], .task-check, .tab-btn, .nav-arrow, .tag-pill, .filter-chip, .energy-dot, a'
      );
      const failures = [];
      for (const el of interactives) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue; // hidden
        if (rect.width < MIN || rect.height < MIN) {
          failures.push({
            tag: el.tagName,
            class: el.className?.substring?.(0, 40) || '',
            text: (el.textContent || '').substring(0, 30).trim(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
      return { total: interactives.length, visible: interactives.length - failures.length, failures };
    }, MIN_TOUCH);

    console.log(`\n=== TOUCH TARGET AUDIT ===`);
    console.log(`Total interactive elements: ${results.total}`);
    console.log(`Pass (≥${MIN_TOUCH}px): ${results.visible - results.failures.length}`);
    console.log(`FAIL (<${MIN_TOUCH}px): ${results.failures.length}`);
    if (results.failures.length > 0) {
      console.log('\nFailing elements:');
      for (const f of results.failures) {
        console.log(`  ${f.tag}.${f.class} "${f.text}" → ${f.width}×${f.height}px`);
      }
    }

    // Report but don't fail — this is an audit
  });

  test('filter area does not dominate viewport', async ({ page }) => {
    await login(page);

    // Navigate to All view
    const allTab = page.locator('.tab-btn', { hasText: 'All' });
    if (await allTab.isVisible()) await allTab.click();
    await page.waitForTimeout(500);

    const result = await page.evaluate((vh) => {
      const filterRow = document.querySelector('.filter-row');
      if (!filterRow) return { filterPct: 0, firstCardY: 0 };
      const filterRect = filterRow.getBoundingClientRect();
      const firstCard = document.querySelector('.task-card');
      const firstCardY = firstCard ? firstCard.getBoundingClientRect().top : null;
      return {
        filterHeight: Math.round(filterRect.height),
        filterPct: Math.round((filterRect.bottom / vh) * 100),
        firstCardY: firstCardY ? Math.round(firstCardY) : null,
        firstCardPct: firstCardY ? Math.round((firstCardY / vh) * 100) : null,
      };
    }, MOBILE_VIEWPORT.height);

    console.log(`\n=== FILTER AREA AUDIT ===`);
    console.log(`Filter row height: ${result.filterHeight}px`);
    console.log(`Filter bottom at: ${result.filterPct}% of viewport`);
    console.log(`First task card at: ${result.firstCardY}px (${result.firstCardPct}% of viewport)`);

    if (result.firstCardPct > 50) {
      console.log(`⚠️  First task card below 50% of viewport — filters dominate the screen`);
    }
  });

  test('tab bar scroll affordance', async ({ page }) => {
    await login(page);

    const result = await page.evaluate(() => {
      const tabBar = document.querySelector('.tab-bar');
      if (!tabBar) return { found: false };
      const tabs = tabBar.querySelectorAll('.tab-btn');
      const tabBarRect = tabBar.getBoundingClientRect();
      let visible = 0, hidden = 0;
      const tabNames = { visible: [], hidden: [] };
      for (const tab of tabs) {
        const rect = tab.getBoundingClientRect();
        if (rect.right <= tabBarRect.right + 5) {
          visible++;
          tabNames.visible.push(tab.textContent.trim());
        } else {
          hidden++;
          tabNames.hidden.push(tab.textContent.trim());
        }
      }
      // Check for scroll indicators
      const hasGradient = getComputedStyle(tabBar).maskImage !== 'none' ||
                          getComputedStyle(tabBar).webkitMaskImage !== 'none';
      const hasAfter = getComputedStyle(tabBar, '::after').content !== 'none';
      const isOverflowing = tabBar.scrollWidth > tabBar.clientWidth;

      return { visible, hidden, tabNames, isOverflowing, hasGradient, hasAfter };
    });

    console.log(`\n=== TAB BAR AUDIT ===`);
    console.log(`Visible tabs: ${result.visible} (${result.tabNames.visible.join(', ')})`);
    console.log(`Hidden tabs: ${result.hidden} (${result.tabNames.hidden.join(', ')})`);
    console.log(`Overflowing: ${result.isOverflowing}`);
    console.log(`Has scroll indicator: ${result.hasGradient || result.hasAfter}`);

    if (result.hidden > 0 && !result.hasGradient && !result.hasAfter) {
      console.log(`⚠️  ${result.hidden} tabs hidden with no scroll affordance`);
    }
  });

  test('font sizes meet mobile minimums', async ({ page }) => {
    await login(page);

    const result = await page.evaluate(() => {
      const checks = [
        { selector: '.tag-pill', name: 'Tag chips', minSize: 12 },
        { selector: '.search-input, input[type="text"]', name: 'Search input', minSize: 16 },
        { selector: '.task-title', name: 'Task titles', minSize: 14 },
        { selector: '.task-notes-preview', name: 'Task notes', minSize: 12 },
        { selector: '.task-created', name: 'Created date', minSize: 11 },
      ];
      const results = [];
      for (const check of checks) {
        const el = document.querySelector(check.selector);
        if (!el) { results.push({ ...check, actual: null }); continue; }
        const size = parseFloat(getComputedStyle(el).fontSize);
        results.push({ ...check, actual: Math.round(size * 100) / 100, pass: size >= check.minSize });
      }
      return results;
    });

    console.log(`\n=== FONT SIZE AUDIT ===`);
    for (const r of result) {
      const status = r.actual === null ? '⬜ not found' : r.pass ? '✅' : '❌';
      console.log(`${status} ${r.name}: ${r.actual ?? 'N/A'}px (min: ${r.minSize}px)`);
    }
  });

  test('viewport meta allows user scaling', async ({ page }) => {
    await login(page);
    const content = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.getAttribute('content') : null;
    });

    console.log(`\n=== VIEWPORT META ===`);
    console.log(`Content: ${content}`);

    const blocksZoom = content && (
      content.includes('user-scalable=no') ||
      content.includes('maximum-scale=1')
    );
    console.log(`Blocks zoom: ${blocksZoom ? '❌ YES' : '✅ NO'}`);
  });

  test('CSS mobile rules count', async ({ page }) => {
    await login(page);

    const result = await page.evaluate(() => {
      let mediaRuleCount = 0;
      let mobileRuleCount = 0;
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule) {
              const cond = rule.conditionText || rule.media?.mediaText || '';
              if (cond.includes('max-width') && parseInt(cond.match(/\d+/)?.[0]) <= 768) {
                mediaRuleCount++;
                mobileRuleCount += rule.cssRules.length;
              }
            }
          }
        } catch(e) {}
      }
      return { mediaRuleCount, mobileRuleCount };
    });

    console.log(`\n=== MOBILE CSS AUDIT ===`);
    console.log(`@media queries targeting mobile: ${result.mediaRuleCount}`);
    console.log(`Total CSS rules inside mobile queries: ${result.mobileRuleCount}`);
    if (result.mobileRuleCount < 10) {
      console.log(`⚠️  Very few mobile-specific styles — app relies on accidental responsiveness`);
    }
  });

  test('child tasks do not appear as standalone cards', async ({ page }) => {
    await login(page);

    const result = await page.evaluate(() => {
      // Check if any visible task card belongs to a child task
      // We can detect this by looking for tasks rendered both as cards AND as .task-child elements
      const childTitles = [...document.querySelectorAll('.task-child-title')].map(el => el.textContent.trim());
      const cardTitles = [...document.querySelectorAll('.task-card .task-title')].map(el => el.textContent.trim());
      const duplicates = childTitles.filter(t => cardTitles.includes(t));
      return { childTitles, duplicates };
    });

    console.log(`\n=== CHILD TASK DEDUP AUDIT ===`);
    console.log(`Child tasks (nested): ${result.childTitles.length}`);
    console.log(`Duplicated as standalone cards: ${result.duplicates.length}`);
    if (result.duplicates.length > 0) {
      console.log(`❌ These appear both nested AND as cards:`);
      result.duplicates.forEach(d => console.log(`  - ${d}`));
    } else {
      console.log(`✅ No child tasks showing as standalone cards`);
    }

    expect(result.duplicates.length).toBe(0);
  });
});
