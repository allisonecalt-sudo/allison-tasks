const { EMAIL, PASSWORD } = require('./auth.config');

async function login(page) {
  if (!PASSWORD) throw new Error('TASK_APP_PASSWORD not set — check GitHub Secrets or .env file');

  await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/');
  await page.locator('#authEmail').fill(EMAIL);
  await page.locator('#authPass').fill(PASSWORD);
  await page.locator('#authBtn').click();

  // Wait for either success or error
  const result = await Promise.race([
    page.locator('#app.visible').waitFor({ timeout: 20000 }).then(() => 'success'),
    page.locator('.auth-error').waitFor({ timeout: 20000 }).then(() => 'error'),
  ]);

  if (result === 'error') {
    const errorText = await page.locator('.auth-error').textContent();
    throw new Error(`Login failed: ${errorText}`);
  }
}

module.exports = { login };
