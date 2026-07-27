const rateLimit = require('express-rate-limit');

// Skipped entirely in test env — same convention this repo already uses
// for morgan logging (see app.js), to avoid the test suite's shared-IP
// rapid logins tripping this.
const skipInTest = () => process.env.NODE_ENV === 'test';

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many login attempts. Please try again later.' },
});

const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many requests.' },
});

module.exports = { authRateLimiter, webhookRateLimiter };
