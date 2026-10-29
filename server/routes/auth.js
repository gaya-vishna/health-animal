const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createUser = require('../lib/createUser');
const { str, sendError, ValidationError } = require('../lib/validate');
const { hasPassword, hashPassword, checkPassword, fakeCheck } = require('../lib/password');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const publicUser = (u) => ({ id: u.id, username: u.email, email: u.email, name: u.name, hasPassword: hasPassword(u) });
// The login name is stored in the `email` column (kept so existing accounts still work).
// Any short name is fine: letters (Hebrew too), digits and . _ - @
const USERNAME_RE = /^[\p{L}\p{N}._@-]{2,40}$/u;
const normalize = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const requirePassword = () => process.env.REQUIRE_PASSWORD === 'true';
const WRONG = 'Wrong username or password';

// Passwords are not trimmed (spaces are allowed): 8-128 characters as typed.
const checkNewPassword = (v) => {
  if (typeof v !== 'string' || v.length < 8 || v.length > 128) throw new ValidationError('Password must be 8-128 characters.');
  return v;
};

// POST /api/auth/register
router.post('/auth/register', async (req, res) => {
  try {
    if (process.env.ALLOW_REGISTER === 'false') return res.status(403).json({ error: 'Sign-ups are closed on this server' });
    const body = req.body || {};
    const raw = body.username ?? body.email;
    if (typeof raw !== 'string') return res.status(400).json({ error: 'Enter a valid username (2-40 letters, numbers, . _ - @)' });
    const email = normalize(raw);
    if (!USERNAME_RE.test(email)) return res.status(400).json({ error: 'Enter a valid username (2-40 letters, numbers, . _ - @)' });
    const name = str(body.name, { max: 100, label: 'Name' });
    let password;
    if (body.password !== undefined && body.password !== null && body.password !== '') password = checkNewPassword(body.password);
    else if (requirePassword()) return res.status(400).json({ error: 'A password is required on this server (8-128 characters).' });
    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(409).json({ error: 'An account with this username already exists' });
    }
    let user;
    try {
      user = await createUser(prisma, { email, password, name, lang: req.lang });
    } catch (err) {
      if (err && err.code === 'P2002') return res.status(409).json({ error: 'An account with this username already exists' });
      throw err;
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    sendError(res, err, 'Register error');
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const body = req.body || {};
    const raw = body.username ?? body.email;
    const password = body.password;
    const email = normalize(raw);
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user) {
      await fakeCheck(typeof password === 'string' ? password : '');
      return res.status(401).json({ error: WRONG });
    }
    if (hasPassword(user)) {
      const ok = typeof password === 'string' && password.length <= 1024 && (await checkPassword(password, user));
      if (!ok) return res.status(401).json({ error: WRONG });
    } else if (requirePassword()) {
      // REQUIRE_PASSWORD with a passwordless account: same generic error; set one with scripts/reset-password.js.
      await fakeCheck(typeof password === 'string' ? password : '');
      return res.status(401).json({ error: WRONG });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    sendError(res, err, 'Login error');
  }
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: 'Account not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    sendError(res, err, 'Me error');
  }
});

// POST /api/auth/password  { currentPassword?, newPassword }
router.post('/auth/password', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: 'Account not found' });
    const newPassword = checkNewPassword(body.newPassword);
    if (hasPassword(user)) {
      const cur = body.currentPassword;
      if (typeof cur !== 'string' || cur.length > 1024 || !(await checkPassword(cur, user))) {
        return res.status(401).json({ error: 'Wrong current password' });
      }
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    res.json({ success: true, user: publicUser(updated) });
  } catch (err) {
    sendError(res, err, 'Password error');
  }
});

module.exports = router;
