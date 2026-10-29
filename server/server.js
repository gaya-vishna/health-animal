require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const { apiLimiter, authLimiter, aiLimiter } = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const authMw = require('./middleware/auth');
const { requireAuth } = authMw;
const aiRoutes = require('./routes/ai');
const logsRoutes = require('./routes/logs');
const historyRoutes = require('./routes/history');
const recipesRoutes = require('./routes/recipes');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 5000;
// Listen on loopback unless told otherwise. Docker Compose sets HOST=0.0.0.0 inside the container
// (the published port is still bound to 127.0.0.1 on the host by default).
const HOST = process.env.HOST || '127.0.0.1';
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // behind a reverse proxy: rate limits see the real client IP

// --- Middleware ---
// CORS: the web client is served from this same origin, so by default no CORS headers are sent at all.
// CORS_ORIGINS="http://192.168.1.5:5173,https://my.host" allows exactly those origins (no cookies/credentials).
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
if (CORS_ORIGINS.length) {
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || CORS_ORIGINS.includes(origin)),
    credentials: false,
  }));
}
// Image routes take a base64 photo (up to ~2.5M characters); everything else is small JSON.
// This parser has to come before the global one, which would reject the big body first.
app.use(['/api/ai/estimate-dish', '/api/log/ai-analyze'], express.json({ limit: '3mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// --- Routes ---
app.use((req, res, next) => {
  req.lang = req.headers['x-lang'] === 'he' ? 'he' : 'en';
  next();
});
// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), server: 'health-animal' });
});

// Rate limits: general safety net, brute-force guard on auth, quota guard on Gemini
app.use('/api', apiLimiter);
app.use(['/api/auth/login', '/api/auth/register'], authLimiter);
app.use(['/api/ai', '/api/log/ai-analyze', '/api/rescue'], aiLimiter);

app.use('/api', authRoutes);
// The Android app keeps its data on the phone and only asks the server for AI estimates; it identifies
// itself with a shared app key (APP_KEY in .env) instead of an account. Everything else needs sign-in.
let APP_KEY = process.env.APP_KEY;
if (APP_KEY && APP_KEY.length < 24) {
  console.warn('⚠️  APP_KEY is shorter than 24 characters - the app-key path is disabled.');
  APP_KEY = '';
}
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest();
const appKeyMatches = (given) => !!APP_KEY && !!given && crypto.timingSafeEqual(sha256(given), sha256(APP_KEY));
const APP_AI_PATHS = new Set(['/api/ai/estimate-dish', '/api/rescue/surprise']);
app.use('/api', (req, res, next) =>
  appKeyMatches(req.headers['x-app-key']) && APP_AI_PATHS.has(req.originalUrl.split('?')[0])
    ? next()
    : requireAuth(req, res, next)
);
app.use('/api', aiRoutes);
app.use('/api', logsRoutes);
app.use('/api', historyRoutes);
app.use('/api', recipesRoutes);
app.use('/api', settingsRoutes);

// Unknown /api paths get JSON, not the web page or a hung request
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// --- Static Client Serving (Production / Standalone Linux Server) ---
const path = require('path');
const fs = require('fs');
// Android app download: the APK is copied into server/downloads on the host (mounted read-only)
app.use('/download', express.static(path.join(__dirname, 'downloads')));

const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// --- Global Error Handler ---
// Never echo err.message: it can carry paths, SQL or library details. Body-parser problems get a plain 4xx.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err && (err.type === 'entity.parse.failed' || err.name === 'ValidationError')) {
    return res.status(400).json({ error: err.name === 'ValidationError' ? err.message : 'Invalid request' });
  }
  console.error('❌ Server Error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`
🐾 Health Animal Server running on http://${HOST}:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Gemini API: ${aiRoutes.isRealKey(process.env.GEMINI_API_KEY) ? '✅ Key found' : '⚠️  No valid GEMINI_API_KEY — using offline estimates'}
`);
  if (process.env.ALLOW_REGISTER !== 'false') console.warn('⚠️  Open registration: anyone who can reach this server can create an account. Set ALLOW_REGISTER=false once your accounts exist.');
  if (process.env.REQUIRE_PASSWORD !== 'true') console.warn('⚠️  REQUIRE_PASSWORD is not "true": accounts can be created and opened with just a name. Set REQUIRE_PASSWORD=true if this server is reachable beyond people you trust.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(HOST)) console.warn(`⚠️  Listening on ${HOST}, not just this machine. Only expose it on a trusted LAN/VPN, never the public internet.`);
  if (authMw.generatedSecret) console.warn('⚠️  JWT_SECRET is not set: using a random one, so logins end whenever the server restarts.');
});
server.on('error', (err) => {
  console.error(`❌ Could not start the server on ${HOST}:${PORT}: ${err.code || 'error'}`);
  process.exit(1);
});

module.exports = app;
