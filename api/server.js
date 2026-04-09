const express = require('express');
const cors = require('cors');
const uuid = require('uuid');
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

app.use(helmet());
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
      SELECT sessions.*, users.email, users.full_name, users.cal_data
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
    res.status(201).json({ message: 'success', data: { token, expires_at, name: user.full_name, email: user.email } });
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
    try {
      // Upsert — delete existing row for this endpoint then insert fresh
      const endpoint = subscription.endpoint;
      await sql`DELETE FROM push_subscriptions WHERE user_id = ${req.user.user_id} AND subscription->>'endpoint' = ${endpoint}`;
      await sql`
        INSERT INTO push_subscriptions (user_id, subscription, timezone)
        VALUES (${req.user.user_id}, ${sql.json(subscription)}, ${timezone || 'UTC'})
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
      url: '/dashboard.html',
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
      url: '/dashboard.html',
    });
  },
};

async function runNotificationScheduler() {
  if (!vapidConfigured) return;
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
  } catch (err) {
    console.error('Notification scheduler error:', err.message);
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

// Keept the server alive

setInterval(() => {
  fetch('https://dailytodo-api.onrender.com/health')
    .catch(() => {}); // silently ignore errors
}, 14 * 60 * 1000);

// Add a lightweight health endpoint to ping
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => console.log(`Listening on port: ${PORT}`));
