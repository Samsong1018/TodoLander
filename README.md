# TodoLander

A full-stack daily todo and calendar app with recurring task support, built with Node.js/Express and vanilla JavaScript.

---

## Features

- **Calendar view** — navigate months, select days, see task indicators
- **Daily todos** — add, edit, delete, reorder (drag & drop), and color-code tasks
- **Recurring tasks** — daily, weekly, or monthly tasks that appear automatically
- **Per-day recurring state** — mark recurring tasks done or dismissed independently each day
- **Color labels** — 8 color options per task for visual organization
- **Search** — full-text search across all tasks and dates
- **Import / Export** — JSON bulk import, JSON export, iCal (`.ics`) export
- **Settings** — dark/light mode, compact view, week start day, show/hide completed tasks
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
├── api/                    # Backend (Node.js/Express)
│   ├── server.js           # Main server — routes, auth, middleware
│   ├── db.js               # PostgreSQL client setup
│   ├── .env                # Environment variables (not committed)
│   ├── package.json
│   └── node_modules/
├── public/                 # Frontend (static files served by Express)
│   ├── index.html          # Auth page (Sign In / Sign Up)
│   ├── home.html           # Main app page
│   ├── home.js             # App logic (~1000 lines, vanilla JS)
│   ├── home.css            # Styles (~950 lines)
│   └── favicon.svg
├── example-tasks.json      # Sample JSON for the import feature
└── README.md
```

---

## Database Schema

The app uses two PostgreSQL tables:

```sql
CREATE TABLE users (
  id        SERIAL PRIMARY KEY,
  email     VARCHAR(255) UNIQUE NOT NULL,
  password  VARCHAR(128) NOT NULL,       -- bcrypt hash
  full_name VARCHAR(100),
  cal_data  JSONB                         -- all todo/recurring data stored here
);

CREATE TABLE sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(36) UNIQUE NOT NULL, -- UUID v4
  expires_at TIMESTAMP NOT NULL
);
```

All calendar data (`todos`, `recurring`, `recurringState`) lives in the `cal_data` JSONB column on the user row. There is no migration system — you need to create these tables manually (see setup below).

---

## API Reference

### Auth endpoints (rate-limited: 5 req / 15 min)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/signup` | `{ name, email, password }` | Create a new account |
| `POST` | `/api/login` | `{ email, password }` | Log in, sets session cookie |
| `POST` | `/api/logout` | — | Destroy session, clear cookie |

### Data endpoints (require auth cookie)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user` | Fetch current user's calendar data |
| `PUT` | `/api/user` | Save calendar data (full replace) |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status: 'ok' }` |

#### `PUT /api/user` body shape

```json
{
  "todos": {
    "2026-03-15": [
      { "id": 1, "text": "Buy groceries", "done": false, "color": "#22c55e" }
    ]
  },
  "recurring": [
    {
      "id": "uuid-here",
      "text": "Morning workout",
      "frequency": "daily",
      "startDate": "2026-03-01",
      "color": null
    }
  ],
  "recurringState": {
    "2026-03-15": {
      "uuid-here": { "done": true, "dismissed": false }
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

Connect to your PostgreSQL database and run:

```sql
CREATE TABLE users (
  id        SERIAL PRIMARY KEY,
  email     VARCHAR(255) UNIQUE NOT NULL,
  password  VARCHAR(128) NOT NULL,
  full_name VARCHAR(100),
  cal_data  JSONB
);

CREATE TABLE sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(36) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL
);
```

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

If you're using a local database without SSL, you'll also need to remove `ssl: 'require'` from `api/db.js`:

```js
// api/db.js — change this line for local dev without SSL:
const sql = postgres(process.env.DATABASE_URL);   // remove { ssl: 'require' }
```

### 4. Install dependencies

```bash
cd api
npm install
```

### 5. Start the dev server

```bash
npm run dev
```

This starts the server with `nodemon` for auto-reload on file changes.

Visit **http://localhost:3000** in your browser.

> The Express server serves the frontend static files from `../public/`, so both the API and the UI run on the same port.

### 6. (Optional) Point the frontend at localhost

The frontend HTML files (`public/index.html`) hardcode the production API URL (`https://dailytodo-api.onrender.com`). For local development, update the fetch calls in `index.html` to use a relative path or `http://localhost:3000`:

```js
// In public/index.html, change:
const res = await fetch('https://dailytodo-api.onrender.com/api/login', ...)
// To:
const res = await fetch('/api/login', ...)
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Port the server listens on (default: `3000`) |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string |

---

## Security

- **Passwords** hashed with bcrypt (10 salt rounds)
- **Sessions** stored server-side in PostgreSQL; tokens are UUIDs in httpOnly cookies
- **Session expiry** — 24 hours, sliding window (extended on each authenticated request)
- **Expired sessions** purged automatically every hour
- **Rate limiting** on `/api/login` and `/api/signup` (5 requests per 15 minutes)
- **Helmet** middleware sets secure HTTP headers
- **CORS** restricted to known frontend origins in production

---

## Import / Export

### JSON Import

Click the **Import** button in the toolbar and paste a JSON object where keys are dates (`YYYY-MM-DD`) and values are arrays of task strings or objects:

```json
{
  "2026-03-15": ["Buy milk", "Call the bank"],
  "2026-03-16": ["Team standup", "Review PR"]
}
```

See `example-tasks.json` in the repo root for a full example.

### JSON Export

Downloads your full todo dataset as a JSON file.

### iCal Export

Downloads a `.ics` calendar file compatible with Apple Calendar, Google Calendar, Outlook, and other calendar apps. Recurring tasks are exported with proper `RRULE` entries.

---

## Deployment

The app is deployed on [Render.com](https://render.com):

- **Backend + frontend**: single Express service serving static files from `public/`
- **Database**: [Neon](https://neon.tech) serverless PostgreSQL
- A keep-alive ping hits `/health` every 14 minutes to prevent the Render free-tier instance from spinning down

To deploy your own instance:

1. Create a Neon (or any PostgreSQL) database and run the schema SQL above.
2. Create a new **Web Service** on Render pointed at the `api/` directory.
3. Set the `DATABASE_URL` environment variable in Render's dashboard.
4. Update the hardcoded API URLs in `public/index.html` and `public/home.js` to match your Render service URL.
