// Single source of truth for test credentials
// Reads from .env file (never committed) or GitHub Secrets in CI
require('dotenv').config();

module.exports = {
  EMAIL: process.env.TASK_APP_EMAIL || 'allisonecalt@gmail.com',
  PASSWORD: process.env.TASK_APP_PASSWORD || '',
};
