// Shared test helpers.

/** A stable, valid device key for a test user (43 base64url characters). */
const keyFor = (code) => `${code}${'k'.repeat(43)}`.slice(0, 43);

module.exports = { keyFor };
