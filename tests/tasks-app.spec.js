const { test, expect } = require('@playwright/test');

// Basic smoke tests for the tasks app

test('page loads and shows login screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Tasks — Allison');
  await expect(page.locator('#authScreen')).toBeVisible();
  await expect(page.locator('#authEmail')).toBeVisible();
  await expect(page.locator('#authPass')).toBeVisible();
  await expect(page.locator('#authBtn')).toBeVisible();
});

test('login button exists and says Sign In', async ({ page }) => {
  await page.goto('/');
  const btn = page.locator('#authBtn');
  await expect(btn).toHaveText('Sign In');
});

test('empty login shows error', async ({ page }) => {
  await page.goto('/');
  await page.locator('#authBtn').click();
  // Should show some error when trying to login with empty fields
  await expect(page.locator('.auth-error')).toBeVisible();
});
