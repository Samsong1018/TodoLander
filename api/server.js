const express = require('express');
const cors = require('cors');
const uuid = require('uuid');
const sql = require('./db');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const path = require('path')
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

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
    res.status(201).json({ message: 'success', data: { token, expires_at } });
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
      return res.status(200).json({ message: 'success', data: { token: existing[0].token, expires_at: existing[0].expires_at } });
    }

    const token = uuid.v4();
    const expires_at = new Date(Date.now() + SESSION_DURATION_MS);

    await sql`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (${user.id}, ${token}, ${expires_at})
    `;

    res.cookie('session', token, COOKIE_OPTS);
    res.status(201).json({ message: 'success', data: { token, expires_at } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

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
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => console.log(`Listening on port: ${PORT}`));
