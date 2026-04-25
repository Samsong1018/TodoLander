# TodoLander — CLAUDE.md

## What This Is
TodoLander is a full-stack calendar/todo PWA. Users sign in, land on a calendar dashboard, and manage one-off and recurring tasks per day. Live at **todolander.com**.

---

## Project Structure

```
DailyTodo/
├── api/                    # Node.js/Express backend
│   ├── server.js           # All routes, auth middleware, push scheduler
│   ├── db.js               # Postgres connection (postgres npm, via DATABASE_URL)
│   └── package.json        # CommonJS, Node
│
├── public/                 # Static frontend — served by Express
│   ├── index.html          # Auth page shell + inline styles
│   ├── app.html            # Dashboard shell (PWA entry point)
│   │
│   ├── index.app.js        # Auth page — sign-in / sign-up logic
│   ├── app.main.js         # Dashboard — calendar, tasks, data sync, settings
│   ├── app.modals.js       # Modal + drawer components
│   ├── app.utils.js        # Shared utilities: iconSVG, logoHTML, tagVar, getGreeting
│   │
│   ├── styles.css          # Shared CSS tokens + typography (light & dark themes)
│   ├── app.css             # Dashboard-specific component styles
│   │
│   ├── assets/             # Static SVG assets
│   │   ├── icons.svg       # SVG sprite sheet (all UI icons as <symbol> elements)
│   │   ├── logo.svg        # Static logo (hardcoded colors, for manifest/external use)
│   │   └── favicon.svg     # Favicon + PWA icon
│   │
│   ├── sw.js               # Service worker — offline shell cache + push notifications
│   ├── manifest.json       # PWA manifest
│   └── theme-init.js       # Inline script: reads localStorage and sets data-theme early
│
└── deploy-public.sh        # Deployment helper script
```

---

## No Build Step

The frontend is **plain vanilla JS** — no React, no JSX, no Babel, no bundler. Files are loaded as standard `<script src="...">` tags and run in the global browser scope. Do not add `import`/`export` to any JS file.

---

## Frontend Conventions

### File roles
| File | What it owns |
|------|-------------|
| `index.app.js` | Sign-in and sign-up forms, mini-calendar preview |
| `app.main.js` | Everything on the dashboard: calendar grid, task panel, data sync, settings, keyboard shortcuts |
| `app.modals.js` | Modal and drawer UI components consumed by `app.main.js` |
| `app.utils.js` | Shared utilities: `iconSVG()`, `logoHTML()`, `tagVar()`, `getGreeting()`, `TAG_COLORS` |

### Script load order (app.html)
```
app.utils.js → app.modals.js → app.main.js
```
Each file depends on the previous ones being in scope as globals.

### Icons
Icons live in `assets/icons.svg` as `<symbol>` elements. Reference them via:
```js
iconSVG('name', size)  // defined in app.utils.js
// renders: <svg><use href="assets/icons.svg#name"></use></svg>
```

### Logo
- `app.utils.js` `logoHTML(size, showWordmark, wordmarkSize)` — generates an inline SVG string using CSS variables for theming. Used inside the app where CSS vars are available.
- `assets/logo.svg` — static SVG with hardcoded colors. Used by manifest/external tools only.

### CSS architecture
- **`styles.css`** — CSS custom properties (design tokens), fonts, base reset. Loaded on both pages.
- **`app.css`** — Component styles for the dashboard. Loaded on `app.html` only.
- **`index.html`** has its own `<style>` block for the auth page layout.
- Themes: `data-theme="light"` / `data-theme="dark"` on `<html>`. `theme-init.js` sets this from `localStorage` before paint to prevent FOUC.

### Design tokens (styles.css)
```css
--paper, --paper-2, --paper-3   /* backgrounds */
--ink, --ink-2, --ink-3         /* text hierarchy */
--rule, --rule-2                /* borders/dividers */
--accent, --accent-ink          /* brand accent (warm orange) */
--tag-red/orange/yellow/green/blue/purple/pink  /* task color tags */
--serif   /* Instrument Serif */
--sans    /* Inter */
--mono    /* JetBrains Mono */
```
Colors use `oklch()`. Avoid hardcoding color values — always use tokens.

---

## Backend Conventions

### Stack
- Express 5, Node.js, CommonJS (`require`)
- `postgres` npm package (template-literal SQL: `` sql`SELECT ...` ``)
- Neon PostgreSQL via `DATABASE_URL` env var
- `bcrypt` for password hashing, `uuid` for session tokens
- `helmet` for security headers, `express-rate-limit` on auth routes
- `web-push` (VAPID) for push notifications
- `cookie-parser` — sessions stored as httpOnly cookies

### Auth flow
1. Login/signup → creates a session row in `sessions` table → sets `session` cookie
2. `authenticateToken` middleware reads cookie (falls back to `Authorization: Bearer` header)
3. Session expiry is sliding: extended 24h on every authenticated request
4. Expired sessions purged hourly

### Data model (cal_data column on users table)
The frontend has a different shape — `backendToFrontend` / `frontendToBackend` conversion functions live in `app.main.js`.

### API endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/user` | yes | Fetch cal_data |
| PUT | `/api/user` | yes | Save cal_data |
| POST | `/api/login` | no | Login (rate limited) |
| POST | `/api/signup` | no | Sign up (rate limited) |
| POST | `/api/logout` | yes | Delete session |
| GET | `/api/push/vapid-key` | no | VAPID public key |
| POST | `/api/push/subscribe` | yes | Register push subscription |
| DELETE | `/api/push/subscribe` | yes | Remove push subscription |
| GET | `/api/push/prefs` | yes | Get notification prefs |
| PUT | `/api/push/prefs` | yes | Save notification prefs |
| GET | `/health` | no | Keep-alive health check |

### Push notifications
- Scheduler runs every 15 minutes via `setInterval`
- Types: `morning_digest` (tasks today), `overdue_alert` (past incomplete tasks)
- Each subscription stores an IANA `timezone` so notifications fire at the user's local time
- Invalid push subscriptions (410) are auto-deleted

---

## Environment Variables (api/.env)
```
DATABASE_URL=         # Neon PostgreSQL connection string
NODE_ENV=             # production | development
PORT=                 # defaults to 3000
VAPID_EMAIL=          # mailto: for VAPID
VAPID_PUBLIC_KEY=     # VAPID public key
VAPID_PRIVATE_KEY=    # VAPID private key
```

---

## Key Constraints
- **No frontend build tool** — never use ES module `import`/`export` in JS files; everything runs as browser globals.
- **No React, no JSX, no Babel** — plain vanilla JS only. Template literals build all HTML strings.
- **CORS** allows only `todolander.com`, `www.todolander.com`, and the Render.com origin.
- **CSP** is configured via `helmet` with a SHA-256 hash for the inline theme script — if `theme-init.js` changes, the hash in `server.js` must be updated.
- **Cookies** use `SameSite=None; Secure` in production for cross-origin support (frontend on Render CDN, API on separate Render service).
- **Neon free tier** — connection pool capped at 5, idle timeout 20s, connect timeout 10s.
