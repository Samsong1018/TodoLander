# TodoLander

A full-stack daily todo and calendar app with recurring task support, built with Node.js/Express and vanilla JavaScript.

---

## Features

- **Calendar view** — navigate months, select days, see task dot indicators (with color coding and overdue highlighting)
- **Daily todos** — add, edit, delete, and color-code tasks per day
- **Recurring tasks** — daily, weekly, or monthly tasks that appear automatically
- **Per-day recurring state** — mark recurring tasks done or dismissed independently each day
- **Color labels** — 7 color options per task (red, orange, yellow, green, blue, purple, pink)
- **Color filter** — filter the calendar and task list to show only tasks of a specific color
- **Search** — full-text search across all tasks and dates, with highlighted matches and jump-to-date
- **Import / Export** — JSON bulk import, JSON export, iCal (`.ics`) export
- **Push notifications** — opt-in browser push notifications for a morning task digest and/or an overdue task alert, with configurable times; requires VAPID keys
- **Settings** — dark/light mode, compact view, week start day (Sun/Mon), show/hide completed tasks, completed tasks at bottom
- **Secure auth** — session-based authentication with httpOnly cookies and rate limiting

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express v5 |
| Database | PostgreSQL (hosted on [Neon](https://neon.tech)) |
| Auth | UUID session tokens in a `sessions` table, httpOnly cookies |
| Password hashing | bcrypt |
| Frontend | Vanilla HTML, CSS, JavaScript (no build step) |
| Deployment | [Render.com](https://render.com) (backend + static files) |

---

## Project Structure

```
DailyTodo/
├── api/                      # Backend (Node.js/Express)
│   ├── server.js             # Main server — routes, auth, middleware, push scheduler
│   ├── db.js                 # PostgreSQL client setup
│   ├── .env                  # Environment variables (not committed)
│   ├── package.json
│   └── node_modules/
├── public/                   # Frontend (static files served by Express)
│   ├── index.html            # Entry point — redirects to login or dashboard
│   ├── login.html            # Sign in / create account page
│   ├── dashboard.html        # Main app page
│   ├── sw.js                 # Service worker (push notification handling)
│   ├── favicon.svg
│   ├── icon-180.png
│   ├── js/
│   │   ├── app.js            # Main app logic (calendar, tasks, modals, notifications)
│   │   ├── state.js          # Backend API calls, settings, push subscription helpers
│   │   └── utils.js          # Date helpers, import/export, color constants
│   ├── css/
│   │   ├── neumorphism.css   # Base design system
│   │   ├── dashboard.css     # Dashboard layout and component styles
│   │   └── login.css         # Auth page styles
│   └── data/
│       └── mock-data.json    # Sample data (dev reference only)
├── example-tasks.json        # Sample JSON for the import feature
└── README.md
```

---

## Database Schema

Run the following SQL to create all required tables before starting the app:

```sql
CREATE TABLE users (
  id                 SERIAL PRIMARY KEY,
  email              VARCHAR(255) UNIQUE NOT NULL,
  password           VARCHAR(128) NOT NULL,       -- bcrypt hash
  full_name          VARCHAR(100),
  cal_data           JSONB,                        -- all todo/recurring data
  notification_prefs JSONB                         -- push notification preferences
);

CREATE TABLE sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(36) UNIQUE NOT NULL,          -- UUID v4
  expires_at TIMESTAMP NOT NULL
);

CREATE TABLE push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,                     -- Web Push subscription object
  timezone     VARCHAR(100) DEFAULT 'UTC'
);
```

All calendar data (`todos`, `recurring`, `recurringState`) lives in the `cal_data` JSONB column on the user row. Push notification preferences live in `notification_prefs`. There is no migration system — create these tables manually before first run.

---

## API Reference

### Auth endpoints (rate-limited: 5 req / 15 min)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/signup` | `{ name, email, password }` | Create a new account, sets session cookie |
| `POST` | `/api/login` | `{ email, password }` | Log in, sets session cookie |
| `POST` | `/api/logout` | — | Destroy session, clear cookie |

### Data endpoints (require auth cookie)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user` | Fetch current user's calendar data |
| `PUT` | `/api/user` | Save calendar data (full replace) |

### Push notification endpoints (require auth cookie)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/push/vapid-key` | — | Returns the VAPID public key |
| `POST` | `/api/push/subscribe` | `{ subscription, timezone }` | Register a push subscription |
| `DELETE` | `/api/push/subscribe` | `{ endpoint }` | Remove a push subscription |
| `GET` | `/api/push/prefs` | — | Fetch notification preferences |
| `PUT` | `/api/push/prefs` | `{ morning_digest, overdue_alert }` | Save notification preferences |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status: 'ok' }` |

#### `PUT /api/user` body shape

```json
{
  "todos": {
    "2026-03-15": [
      { "id": 1712345678901, "text": "Buy groceries", "done": false, "color": "#22c55e" }
    ]
  },
  "recurring": [
    {
      "id": "1712345678901",
      "text": "Morning workout",
      "frequency": "daily",
      "startDate": "2026-03-01",
      "color": null
    }
  ],
  "recurringState": {
    "2026-03-15": {
      "1712345678901": { "done": true, "dismissed": false }
    }
  }
}
```

---

## Running Locally

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A **PostgreSQL** database (local instance or free tier on [Neon](https://neon.tech))

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd DailyTodo
```

### 2. Create the database tables

Connect to your PostgreSQL database and run the schema SQL from the [Database Schema](#database-schema) section above.

### 3. Set up environment variables

Create `api/.env`:

```env
PORT=3000
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

For a **local** PostgreSQL instance without SSL:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/dailytodo
```

If you're using a local database without SSL, remove the `ssl: 'require'` option from `api/db.js`:

```js
// api/db.js — for local dev without SSL:
const sql = postgres(process.env.DATABASE_URL);
```

### 4. Install dependencies

```bash
cd api
npm install
```

### 5. Point the frontend at localhost

The frontend API base URL is defined at the top of `public/js/state.js`:

```js
const API_BASE = 'https://dailytodo-api.onrender.com';
```

For local development, change it to an empty string (uses relative paths, so the Express server serves both API and frontend on the same port):

```js
const API_BASE = '';
```

### 6. Start the dev server

```bash
npm run dev
```

This starts the server with `nodemon` for auto-reload on file changes. Visit **http://localhost:3000** in your browser.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Port the server listens on (default: `3000`) |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string |
| `VAPID_PUBLIC_KEY` | For push notifications | VAPID public key |
| `VAPID_PRIVATE_KEY` | For push notifications | VAPID private key |
| `VAPID_EMAIL` | For push notifications | Sender identity, e.g. `mailto:you@example.com` |
| `NODE_ENV` | For production | Set to `production` to enable secure/SameSite=None cookies |

To generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

---

## Security

- **Passwords** hashed with bcrypt (10 salt rounds)
- **Sessions** stored server-side in PostgreSQL; tokens are UUIDs in httpOnly cookies
- **Session expiry** — 24 hours, sliding window (extended on each authenticated request)
- **Expired sessions** purged automatically every hour
- **Rate limiting** on `/api/login` and `/api/signup` (5 requests per 15 minutes per IP)
- **Helmet** middleware sets secure HTTP headers
- **CORS** restricted to known frontend origins in production

---

## Import / Export

### JSON Import

Click the **Import** button in the toolbar and select a `.json` file. The file must be an object where keys are dates (`YYYY-MM-DD`) and values are arrays of task strings or objects:

```json
{
  "2026-03-15": ["Buy milk", "Call the bank"],
  "2026-03-16": [
    { "text": "Team standup" },
    { "text": "Review PR", "done": true, "color": "#3b82f6" }
  ]
}
```

- Plain strings and objects with a `text` field are both accepted
- Duplicate tasks (same text on the same day) are skipped automatically
- Entries with an invalid date key or non-array value are skipped

Click the **ⓘ** button in the toolbar for an in-app format reference. See `example-tasks.json` in the repo root for a full example.

### JSON Export

Downloads your full todo dataset as a `.json` file.

### iCal Export

Downloads a `.ics` calendar file compatible with Apple Calendar, Google Calendar, Outlook, and other apps. Recurring tasks are exported with proper `RRULE` entries.

#### Supported colors

| Hex | Name |
|-----|------|
| `#ef4444` | Red |
| `#f97316` | Orange |
| `#eab308` | Yellow |
| `#22c55e` | Green |
| `#3b82f6` | Blue |
| `#6c63ff` | Purple |
| `#ec4899` | Pink |

---

## Push Notifications

Push notifications are opt-in and require browser notification permission plus VAPID keys set in your environment. If the VAPID keys are not configured, the notifications section is hidden in the UI.

Two notification types are available:

| Notification | Default time | Description |
|---|---|---|
| **Morning digest** | 08:00 | Count of today's pending tasks |
| **Overdue alert** | 18:00 | Count of incomplete tasks from previous days |

Times are configurable per user and respect the user's local timezone (captured at subscription time). The server checks subscriptions every 15 minutes and fires notifications within the matching 15-minute window.

---

## Deployment

The app is deployed on [Render.com](https://render.com) as a single Express service serving both the API and static frontend files from `public/`.

To deploy your own instance:

1. Create a PostgreSQL database (e.g. [Neon](https://neon.tech)) and run the schema SQL.
2. Create a new **Web Service** on Render pointed at the `api/` directory with start command `node server.js`.
3. Set all required environment variables in Render's dashboard (`DATABASE_URL`, `NODE_ENV=production`, and optionally the VAPID keys).
4. Update `API_BASE` in `public/js/state.js` to your Render service URL.

A keep-alive ping hits `/health` every 14 minutes to prevent the Render free-tier instance from spinning down.
