// Single source of truth for test credentials
// In CI: reads from GitHub Secrets (env vars). Locally: reads .env if dotenv is installed.
try { require('dotenv').config(); } catch(e) { /* dotenv not installed in CI — that's fine */ }

module.exports = {
  EMAIL: process.env.TASK_APP_EMAIL || 'allisonecalt@gmail.com',
  PASSWORD: process.env.TASK_APP_PASSWORD || '',
};
