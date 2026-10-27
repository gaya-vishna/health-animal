const rateLimit = require('express-rate-limit');

const make = (windowMin, max, message) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });

// Everything under /api: generous, just a safety net against runaway loops.
const apiLimiter = make(1, 300, 'Too many requests, slow down a little.');
// Login / register: blocks password guessing.
const authLimiter = make(15, 20, 'Too many sign-in attempts, try again in 15 minutes.');
// Gemini calls cost quota.
const aiLimiter = make(1, 15, 'Too many AI requests, wait a minute.');

module.exports = { apiLimiter, authLimiter, aiLimiter };
