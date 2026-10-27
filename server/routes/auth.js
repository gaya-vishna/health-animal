const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const createUser = require('../lib/createUser');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const publicUser = (u) => ({ id: u.id, username: u.email, email: u.email, name: u.name });
// The login name is stored in the `email` column (kept so existing accounts still work).
// Any short name is fine: letters (Hebrew too), digits and . _ - @
const USERNAME_RE = /^[\p{L}\p{N}._@-]{2,40}$/u;
const normalize = (v) => String(v || '').trim().toLowerCase();

// POST /api/auth/register
router.post('/auth/register', async (req, res) => {
  try {
    if (process.env.ALLOW_REGISTER === 'false') return res.status(403).json({ error: 'Sign-ups are closed on this server' });
    const email = normalize(req.body.username ?? req.body.email);
    if (!USERNAME_RE.test(email)) return res.status(400).json({ error: 'Enter a valid username (2-40 letters, numbers, . _ - @)' });
    // Small-circle app meant for a trusted network or VPN: the name is the login, no password.
    const password = crypto.randomBytes(24).toString('hex');
    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(409).json({ error: 'An account with this username already exists' });
    }
    const user = await createUser(prisma, { email, password, name: req.body.name, lang: req.lang });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('❌ Register error:', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const email = normalize(req.body.username ?? req.body.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'No account with this name. Tap "New here?" to create one.' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
