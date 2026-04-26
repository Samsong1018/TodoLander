const express = require('express');
const cors = require('cors');
const uuid = require('uuid');
const crypto = require('crypto');
const sql = require('./db');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const path = require('path')
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const webpush = require('web-push');

// ── Web Push (VAPID) setup ────────────────────────────
const vapidConfigured = !!(process.env.VAPID_EMAIL && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('VAPID env vars not set — push notifications disabled.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render.com's reverse proxy so req.ip reflects the real client IP.
// Without this, rate limiting would treat all clients as the same IP.
app.set('trust proxy', 1);

// CSP: allow the tiny inline theme-detection snippet in <head> via its SHA-256 hash.
// All other scripts must be loaded from 'self' (no unsafe-inline).
// The hash covers exactly:
//   (function(){try{var s=JSON.parse(localStorage.getItem('todolander_settings')||'{}');
//   document.documentElement.setAttribute('data-theme',s.theme||'dark');}catch(e){}})();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'sha256-GuTAr52SXvRJLc4/jEFuGVhMJFjNnyxU6dL+ZXDvDVU='"],
    },
  },
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// ── CORS ──────────────────────────────────────────────────
const corsOptions = {
  origin: ['https://todolander.com', 'https://www.todolander.com', 'https://dailytodo-q6k0.onrender.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use('/api/', (req, res, next) => {
  // no-cache is required alongside no-store: Express's `fresh` module only skips 304
  // responses when it sees `no-cache` in Cache-Control. `no-store` alone is ignored by
  // the freshness check, so without `no-cache` the server can return 304 for unchanged
  // API payloads even when the client sends `cache: 'no-store'` in its fetch call.
  res.set('Cache-Control', 'no-cache, no-store');
  next();
});

// ── Body parsing (fix #6: 1mb payload cap) ───────────────
app.use(express.json({ limit: '1mb' }));

// ── Rate limiting (fix #4) ────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);

// ── Auth middleware ───────────────────────────────────────
// Fix #1: expiry check moved into SQL, token refreshed on each request (fix #9)
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cookie options — SameSite=None+Secure required for cross-origin cookies in production
const isProd = process.env.NODE_ENV === 'production';
const COOKIE_BASE = { httpOnly: true, secure: isProd, sameSite: isProd ? 'None' : 'Lax' };
const COOKIE_OPTS = { ...COOKIE_BASE, maxAge: SESSION_DURATION_MS };

const authenticateToken = async (req, res, next) => {
  // Accept httpOnly cookie first (preferred), fall back to Authorization header for existing sessions
  const token = req.cookies?.session || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const rows = await sql`
      SELECT sessions.*, users.email, users.full_name, users.cal_data, users.google_id
      FROM sessions
      JOIN users ON sessions.user_id = users.id
      WHERE sessions.token = ${token}
        AND sessions.expires_at > NOW()
    `;

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Sliding expiry — extend session on each authenticated request (fix #9)
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    await sql`UPDATE sessions SET expires_at = ${newExpiry} WHERE token = ${token}`;

    // Re-set cookie so the browser also sees the extended expiry
    res.cookie('session', token, COOKIE_OPTS);

    req.user = rows[0];
    next();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Input validation helper (fix #5) ─────────────────────
const FIELD_MAX_LENGTHS = { email: 255, password: 128, name: 100 };

function validateFields(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      return `${name} is required.`;
    }
    const max = FIELD_MAX_LENGTHS[name];
    if (max && value.length > max) {
      return `${name} must be ${max} characters or fewer.`;
    }
  }
  return null;
}

// ── Get user data ─────────────────────────────────────────
app.get('/api/user', (req, res) => {
  authenticateToken(req, res, () => {
    // Fix #3: return empty structure if cal_data is null
    res.status(200).json(req.user.cal_data || { todos: {}, recurring: [], recurringState: {} });
  });
});

// ── Save user data ────────────────────────────────────────
app.put('/api/user', (req, res) => {
  authenticateToken(req, res, async () => {
    const { todos, recurring, recurringState } = req.body;

    if (!todos || typeof todos !== 'object' || Array.isArray(todos)) {
      return res.status(400).json({ error: 'Invalid data: todos must be an object.' });
    }
    if (!Array.isArray(recurring)) {
      return res.status(400).json({ error: 'Invalid data: recurring must be an array.' });
    }
    if (!recurringState || typeof recurringState !== 'object' || Array.isArray(recurringState)) {
      return res.status(400).json({ error: 'Invalid data: recurringState must be an object.' });
    }

    try {
      await sql`
        UPDATE users
        SET cal_data = ${sql.json({ todos, recurring, recurringState })}
        WHERE id = ${req.user.user_id}
      `;
      res.status(200).json({ message: 'success' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server Error' });
    }
  });
});

// ── Logout ────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
  authenticateToken(req, res, async () => {
    const token = req.cookies?.session || req.headers['authorization']?.split(' ')[1];
    try {
      await sql`DELETE FROM sessions WHERE token = ${token}`;
      res.clearCookie('session', COOKIE_BASE);
      res.status(200).json({ message: 'success' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server Error' });
    }
  });
});

// ── Signup ────────────────────────────────────────────────
app.post('/api/signup', async (req, res) => {
  const { email, password, name } = req.body;

  // Fix #5: validate all fields
  const validationError = validateFields({ email, password, name });
  if (validationError) return res.status(400).json({ error: validationError });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email.trim()}`;
    if (existing.length > 0) return res.status(409).json({ error: 'Email already in use.' });

    const hash = await bcrypt.hash(password, 10);

    const [user] = await sql`
      INSERT INTO users (email, password, full_name)
      VALUES (${email.trim()}, ${hash}, ${name.trim()})
      RETURNING id
    `;

    const token = uuid.v4();
    const expires_at = new Date(Date.now() + SESSION_DURATION_MS);
    await sql`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (${user.id}, ${token}, ${expires_at})
    `;

    res.cookie('session', token, COOKIE_OPTS);
    res.status(201).json({ message: 'success', data: { token, expires_at, name: name.trim(), email: email.trim() } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// ── Login ─────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  // Fix #5: validate fields
  const validationError = validateFields({ email, password });
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    // Fix #2: select only needed columns, not SELECT *
    const users = await sql`
      SELECT id, email, full_name, password FROM users WHERE email = ${email.trim()}
    `;

    if (users.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    // Return existing valid session if one exists
    const existing = await sql`
      SELECT token, expires_at FROM sessions
      WHERE user_id = ${user.id} AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1
    `;

    if (existing.length > 0) {
      res.cookie('session', existing[0].token, COOKIE_OPTS);
      return res.status(200).json({ message: 'success', data: { token: existing[0].token, expires_at: existing[0].expires_at, name: user.full_name, email: user.email } });
    }

    const token = uuid.v4();
    const expires_at = new Date(Date.now() + SESSION_DURATION_MS);

    await sql`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (${user.id}, ${token}, ${expires_at})
    `;

    res.cookie('session', token, COOKIE_OPTS);
    res.status(200).json({ message: 'success', data: { token, expires_at, name: user.full_name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// ── Push notification helpers ─────────────────────────
// Replicates the frontend doesRecurOn logic for server-side task counting
function doesRecurOn(task, dateStr) {
  // Support both camelCase (current) and snake_case (legacy) field names
  const startStr = task.startDate || task.start_date;
  if (!startStr) return false;
  const [ty, tm, td] = startStr.split('-').map(Number);
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  const startDate = new Date(ty, tm - 1, td);
  const date      = new Date(dy, dm - 1, dd);
  if (date < startDate) return false;
  if (task.frequency === 'daily')   return true;
  if (task.frequency === 'weekly')  return startDate.getDay() === date.getDay();
  if (task.frequency === 'monthly') return td === dd;
  return false;
}

// Count incomplete tasks on dates strictly before today (overdue)
function countOverdueTasks(calData, todayStr) {
  let count = 0;
  for (const [dateStr, todos] of Object.entries(calData?.todos || {})) {
    if (dateStr >= todayStr) continue;
    count += todos.filter(t => !t.done).length;
  }
  // overdue recurring: dates before today with undismissed, undone instances
  for (const task of (calData?.recurring || [])) {
    const startStr = task.startDate || task.start_date;
    if (!startStr) continue;
    const [ty, tm, td] = startStr.split('-').map(Number);
    const taskStart = new Date(ty, tm - 1, td);
    const [dy, dm, dd] = todayStr.split('-').map(Number);
    const today = new Date(dy, dm - 1, dd);
    // Only look at dates up to 30 days back to avoid excessive iteration
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (d < taskStart) break;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!doesRecurOn(task, key)) continue;
      const ds = calData?.recurringState?.[key] || {};
      if (!ds[task.id]?.dismissed && !ds[task.id]?.done) count++;
    }
  }
  return count;
}

// Count tasks for a given date from cal_data
function countTasksForDate(calData, dateStr) {
  const todos = (calData?.todos?.[dateStr] || []).filter(t => !t.done);
  const recurring = (calData?.recurring || []).filter(t => {
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = calData?.recurringState?.[dateStr] || {};
    return !ds[t.id]?.dismissed && !ds[t.id]?.done;
  });
  return todos.length + recurring.length;
}


async function sendPushToUser(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    // 410 Gone means the subscription is no longer valid — remove it
    if (err.statusCode === 410) {
      await sql`DELETE FROM push_subscriptions WHERE subscription->>'endpoint' = ${subscription.endpoint}`.catch(() => {});
    } else {
      console.error('Push send error:', err.message);
    }
  }
}

// ── Push subscription endpoints ───────────────────────
// Expose VAPID public key so the frontend can create subscriptions
app.get('/api/push/vapid-key', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', (req, res) => {
  authenticateToken(req, res, async () => {
    const { subscription, timezone } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

    // Validate timezone; fall back to UTC for invalid values
    let validTimezone = 'UTC';
    if (timezone && typeof timezone === 'string') {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        validTimezone = timezone;
      } catch { /* invalid IANA timezone — use UTC */ }
    }

    try {
      // Upsert — delete existing row for this endpoint then insert fresh
      const endpoint = subscription.endpoint;
      await sql`DELETE FROM push_subscriptions WHERE user_id = ${req.user.user_id} AND subscription->>'endpoint' = ${endpoint}`;
      await sql`
        INSERT INTO push_subscriptions (user_id, subscription, timezone)
        VALUES (${req.user.user_id}, ${sql.json(subscription)}, ${validTimezone})
      `;
      res.status(201).json({ message: 'subscribed' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

app.delete('/api/push/subscribe', (req, res) => {
  authenticateToken(req, res, async () => {
    const { endpoint } = req.body;
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'Invalid endpoint.' });
    }
    try {
      await sql`
        DELETE FROM push_subscriptions
        WHERE user_id = ${req.user.user_id}
          AND subscription->>'endpoint' = ${endpoint}
      `;
      res.status(200).json({ message: 'unsubscribed' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// Get and update notification preferences
app.get('/api/push/prefs', (req, res) => {
  authenticateToken(req, res, async () => {
    try {
      const rows = await sql`SELECT notification_prefs FROM users WHERE id = ${req.user.user_id}`;
      res.json(rows[0]?.notification_prefs || {});
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

app.put('/api/push/prefs', (req, res) => {
  authenticateToken(req, res, async () => {
    const prefs = req.body;

    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
      return res.status(400).json({ error: 'Invalid preferences format.' });
    }
    const ALLOWED_PREF_KEYS = new Set(['morning_digest', 'overdue_alert']);
    for (const key of Object.keys(prefs)) {
      if (!ALLOWED_PREF_KEYS.has(key)) {
        return res.status(400).json({ error: `Unknown preference key: ${key}` });
      }
      const pref = prefs[key];
      if (!pref || typeof pref !== 'object' || Array.isArray(pref)) {
        return res.status(400).json({ error: `Invalid format for preference: ${key}` });
      }
      if ('enabled' in pref && typeof pref.enabled !== 'boolean') {
        return res.status(400).json({ error: `'enabled' for ${key} must be a boolean.` });
      }
      if ('time' in pref && !/^\d{2}:\d{2}$/.test(pref.time)) {
        return res.status(400).json({ error: `'time' for ${key} must be HH:MM.` });
      }
    }

    try {
      await sql`UPDATE users SET notification_prefs = ${sql.json(prefs)} WHERE id = ${req.user.user_id}`;
      res.json({ message: 'saved' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// ── Notification scheduler ────────────────────────────
// Returns the current time and today's date in the given IANA timezone
function getLocalTimeAndDate(timezone) {
  const now = new Date();
  const tz = timezone || 'UTC';
  try {
    const timeStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA = YYYY-MM-DD
    const [hh, mm] = timeStr.split(':').map(Number);
    return { hh, mm, dateStr };
  } catch {
    // Invalid timezone — fall back to UTC
    const timeStr = now.toLocaleString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toISOString().slice(0, 10);
    const [hh, mm] = timeStr.split(':').map(Number);
    return { hh, mm, dateStr };
  }
}

// Notification type handlers — add new types here for future expansion
const NOTIFICATION_TYPES = {
  morning_digest: async (_userId, calData, prefs, subscription) => {
    const p = prefs.morning_digest;
    if (!p?.enabled) return;
    const { hh, mm, dateStr } = getLocalTimeAndDate(subscription.timezone);
    const [ph, pm] = (p.time || '08:00').split(':').map(Number);
    if (hh !== ph || mm < pm || mm >= pm + 15) return; // only fire in the right 15-min window
    const count = countTasksForDate(calData, dateStr);
    if (count === 0) return;
    await sendPushToUser(subscription.subscription, {
      type: 'morning_digest',
      title: 'Good morning!',
      body: `You have ${count} task${count !== 1 ? 's' : ''} today.`,
      url: '/app.html',
    });
  },

  overdue_alert: async (_userId, calData, prefs, subscription) => {
    const p = prefs.overdue_alert;
    if (!p?.enabled) return;
    const { hh, mm, dateStr } = getLocalTimeAndDate(subscription.timezone);
    const [ph, pm] = (p.time || '18:00').split(':').map(Number);
    if (hh !== ph || mm < pm || mm >= pm + 15) return;
    const count = countOverdueTasks(calData, dateStr);
    if (count === 0) return;
    await sendPushToUser(subscription.subscription, {
      type: 'overdue_alert',
      title: 'Tasks need attention',
      body: `You have ${count} overdue task${count !== 1 ? 's' : ''} from previous days.`,
      url: '/app.html',
    });
  },
};

async function runNotificationScheduler() {
  if (!vapidConfigured) return;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rows = await sql`
        SELECT ps.user_id, ps.subscription, ps.timezone, u.cal_data, u.notification_prefs
        FROM push_subscriptions ps
        JOIN users u ON ps.user_id = u.id
      `;
      for (const row of rows) {
        const prefs = row.notification_prefs || {};
        const sub = { subscription: row.subscription, timezone: row.timezone };
        for (const handler of Object.values(NOTIFICATION_TYPES)) {
          await handler(row.user_id, row.cal_data, prefs, sub);
        }
      }
      return; // success
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000 * attempt)); // 2 s, then 4 s
      } else {
        console.error('Notification scheduler error:', err.message);
      }
    }
  }
}

// Run every 15 minutes
setInterval(runNotificationScheduler, 15 * 60 * 1000);
runNotificationScheduler(); // run once on startup too

// ── Expired session cleanup (#10) ────────────────────────
async function purgeExpiredSessions() {
  try {
    const result = await sql`DELETE FROM sessions WHERE expires_at < NOW()`;
    if (result.count > 0) console.log(`Purged ${result.count} expired session(s).`);
  } catch (err) {
    console.error('Session purge failed:', err);
  }
}

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000); // every hour

// Keep the server alive

setInterval(() => {
  fetch('https://dailytodo-api.onrender.com/health')
    .catch(() => {}); // silently ignore errors
}, 14 * 60 * 1000);

// ── /api/me ───────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  authenticateToken(req, res, () => {
    res.json({ name: req.user.full_name, email: req.user.email, hasGoogle: !!req.user.google_id });
  });
});

// ── Google OAuth ──────────────────────────────────────────
const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// In-memory state store for CSRF protection; each entry: { expiry, type, userId? }
const oauthStates = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of oauthStates) if (v.expiry < now) oauthStates.delete(k);
}, 60_000);

const oauthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/google', oauthLimiter);

app.get('/auth/google', (req, res) => {
  if (!googleConfigured) return res.status(503).send('Google OAuth not configured.');
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { expiry: Date.now() + 10 * 60 * 1000, type: 'login' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://todolander.com';
  const { code, state, error } = req.query;

  if (error || !code || !state) return res.redirect(`${frontendUrl}/?error=oauth_denied`);

  const stateData = oauthStates.get(String(state));
  if (!stateData || Date.now() > stateData.expiry) return res.redirect(`${frontendUrl}/?error=oauth_invalid_state`);
  oauthStates.delete(String(state));

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect(`${frontendUrl}/?error=oauth_failed`);

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profile.sub || !profile.email) return res.redirect(`${frontendUrl}/?error=oauth_failed`);

    // ── Link flow: attach Google to an already-authenticated account ──
    if (stateData.type === 'link') {
      const conflict = await sql`SELECT id FROM users WHERE google_id = ${profile.sub} AND id != ${stateData.userId}`;
      if (conflict.length > 0) return res.redirect(`${frontendUrl}/app.html?error=google_taken`);
      await sql`UPDATE users SET google_id = ${profile.sub} WHERE id = ${stateData.userId}`;
      return res.redirect(`${frontendUrl}/app.html?linked=google`);
    }

    // ── Login flow: sign in or create account ──
    let user;
    const byGoogleId = await sql`SELECT id, full_name, email FROM users WHERE google_id = ${profile.sub}`;
    if (byGoogleId.length > 0) {
      user = byGoogleId[0];
    } else {
      const byEmail = await sql`SELECT id, full_name, email FROM users WHERE email = ${profile.email}`;
      if (byEmail.length > 0) {
        await sql`UPDATE users SET google_id = ${profile.sub} WHERE id = ${byEmail[0].id}`;
        user = byEmail[0];
      } else {
        const [newUser] = await sql`
          INSERT INTO users (email, full_name, google_id)
          VALUES (${profile.email}, ${profile.name || profile.email}, ${profile.sub})
          RETURNING id, full_name, email
        `;
        user = newUser;
      }
    }

    const token = uuid.v4();
    const expires_at = new Date(Date.now() + SESSION_DURATION_MS);
    await sql`INSERT INTO sessions (user_id, token, expires_at) VALUES (${user.id}, ${token}, ${expires_at})`;

    res.cookie('session', token, COOKIE_OPTS);
    res.redirect(`${frontendUrl}/app.html?oauth_token=${token}`);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect(`${frontendUrl}/?error=oauth_error`);
  }
});

// ── Link Google to an existing account ───────────────────
// POST so the browser sends the session cookie via a credentialed fetch(),
// avoiding cross-site cookie restrictions on top-level GET navigations.
app.post('/auth/google/link-init', (req, res) => {
  authenticateToken(req, res, () => {
    if (!googleConfigured) return res.status(503).json({ error: 'Google OAuth not configured.' });
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { expiry: Date.now() + 10 * 60 * 1000, type: 'link', userId: req.user.user_id });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });
});

// Add a lightweight health endpoint to ping
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => console.log(`Listening on port: ${PORT}`));
