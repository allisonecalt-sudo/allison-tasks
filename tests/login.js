const { EMAIL, PASSWORD } = require('./auth.config');

async function login(page) {
  if (!PASSWORD) throw new Error('TASK_APP_PASSWORD not set — check GitHub Secrets or .env file');

  await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/');
  await page.locator('#authEmail').fill(EMAIL);
  await page.locator('#authPass').fill(PASSWORD);
  await page.locator('#authBtn').click();

  // Wait for app to load (login successful)
  try {
    await page.locator('#app.visible').waitFor({ timeout: 20000 });
  } catch (e) {
    // If timed out, check if there's a login error
    const errorText = await page.locator('#authError').textContent();
    if (errorText) throw new Error(`Login failed: ${errorText}`);
    throw new Error('Login timed out — app never became visible');
  }
}

module.exports = { login };
