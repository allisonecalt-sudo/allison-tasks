const { EMAIL, PASSWORD } = require('./auth.config');

async function login(page) {
  await page.goto('https://allisonecalt-sudo.github.io/allison-tasks/');
  await page.locator('#authEmail').fill(EMAIL);
  // Use keyboard to type password character by character to avoid !! interpretation issues
  await page.locator('#authPass').click();
  await page.locator('#authPass').pressSequentially(PASSWORD, { delay: 20 });
  await page.locator('#authBtn').click();
  // Wait for app to load
  await page.locator('#app.visible').waitFor({ timeout: 15000 });
}

module.exports = { login };
