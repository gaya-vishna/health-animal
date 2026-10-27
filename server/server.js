require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const { apiLimiter, authLimiter, aiLimiter } = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');
const aiRoutes = require('./routes/ai');
const logsRoutes = require('./routes/logs');
const historyRoutes = require('./routes/history');
const recipesRoutes = require('./routes/recipes');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 5000;
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // behind a reverse proxy: rate limits see the real client IP

// --- Middleware ---
app.use(cors({
  origin: true, // Allow localhost and local network devices (phone on Wi-Fi)
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // large limit for base64 image payloads
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

// --- Static Client Serving (Production / Standalone Linux Server) ---
const path = require('path');
const fs = require('fs');
// Android app download: the APK is copied into server/downloads on the host (mounted read-only)
app.use('/download', express.static(path.join(__dirname, 'downloads')));

const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🐾 Health Animal Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Gemini API: ${aiRoutes.isRealKey(process.env.GEMINI_API_KEY) ? '✅ Key found' : '⚠️  No valid GEMINI_API_KEY — using offline estimates'}\n`);
});
