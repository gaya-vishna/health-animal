const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const PLACEHOLDER_SECRET = 'change_me_to_a_long_random_string';
let JWT_SECRET = process.env.JWT_SECRET;
let generatedSecret = false;
if (!JWT_SECRET || JWT_SECRET === PLACEHOLDER_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is missing or still the placeholder. Set a long random string in the server .env before running in production.');
  }
  // No fixed fallback: a known secret would let anyone forge a login. A random one per boot is safe,
  // but everyone has to sign in again after each restart.
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  generatedSecret = true;
  console.warn('⚠️  JWT_SECRET not set - using a random secret for this run. Logins stop working whenever the server restarts. Set JWT_SECRET in .env.');
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }).sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

module.exports = { signToken, requireAuth, generatedSecret };
