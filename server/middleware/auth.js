const jwt = require('jsonwebtoken');

const PLACEHOLDER_SECRET = 'change_me_to_a_long_random_string';
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === PLACEHOLDER_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is missing or still the placeholder. Set a long random string in the server .env before running in production.');
  }
  console.warn('⚠️  JWT_SECRET not set - using an insecure dev fallback. Never do this in production.');
  JWT_SECRET = 'dev-only-secret-change-me';
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

module.exports = { signToken, requireAuth };
