# GradeNova

Student GPA and CGPA dashboard with **Node.js, Express, and PostgreSQL**. Includes accounts, semester history, weighted grade calculations, a target planner, JSON backup/restore, and printable reports.

## Run locally

Requirements: Node.js 24 and PostgreSQL.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local database connection string.
3. Run `npm start` and open `http://localhost:3000`.

Tables are created automatically at startup. Do not open `index.html` directly: account features require the backend.

## Deploy to Render

[Deploy this repository to Render](https://render.com/deploy?repo=https://github.com/wumaito707/GradeNova)

Use **New → Blueprint** in Render and connect this GitHub repository. `render.yaml` creates a Node web service and a PostgreSQL database and connects them with `DATABASE_URL`. Build command: `npm ci --omit=dev`. Start command: `npm start`. Health check: `/health`. Render supplies the public origin through `RENDER_EXTERNAL_URL`; for a custom domain set `APP_ORIGIN` to its exact HTTPS origin (no trailing slash).

The supplied Blueprint selects free plans for a capstone/demo. Render free web services sleep after inactivity, and free PostgreSQL databases expire after 30 days. Export records and upgrade the database if using it beyond the demonstration period. No paid resources are provisioned by the configuration. See https://render.com/docs/free.

## Accounts and data

- Passwords use salted scrypt hashes. Passwords must be 12–128 characters.
- Sessions use random tokens in HttpOnly, SameSite cookies; production cookies are Secure. Only token hashes are stored in PostgreSQL, with seven-day expiry.
- Each account owns one workspace containing its profile, grading scale, semesters, and courses. Every query is scoped to the authenticated account.
- Autosave is debounced, queued, and uses revision checks. Conflicting edits from another tab/device are rejected rather than overwritten. Export unsaved edits, reload, then restore intentionally if a conflict occurs.
- Records are not silently uploaded from the old browser-only version. Settings has an explicit local-import option. JSON backup import works for records exported from another browser or origin.
- The service enforces same-origin JSON writes, validates inputs, rate-limits sign-in and registration, and serves only approved frontend files.
- Email verification, password reset, and account deletion are not implemented. Email is currently a login identifier, not a verified identity. Rate limits are per server instance; use a shared store before scaling to multiple instances.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account with name, email, password |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Revoke current session |
| GET | `/api/auth/me` | Current account |
| GET | `/api/workspace` | Account records and revision |
| PUT | `/api/workspace` | Save `{workspace, revision}` |
| GET | `/api/summary` | Server-calculated cumulative results |
| GET | `/health` | Database connectivity check |

Writes require JSON and an Origin header matching the app. Authentication uses the session cookie. Never put database credentials in browser code or commit `.env`.

## Verification

Run `npm run check` and `npm test`. API tests use an in-memory PostgreSQL emulator (`pg-mem`), not a live PostgreSQL instance. They cover account isolation, password verification, session expiry and logout, persistence between logins, stale-write rejection, invalid input, cross-origin protection, source-file protection, and grade arithmetic.

Set `CHROME_BIN` to an installed Chrome/Chromium executable to include the headless browser test. It exercises registration, course editing, autosave, reload, target validation, mobile width, logout, and a second account. Without this variable the browser test is skipped.

## Academic assumptions

5-point: A=5, B=4, C=3, D=2, E=1, F=0. 4-point: A=4, B=3, C=2, D=1, F=0. Grade mappings and classifications are illustrative; confirm official department policy. Incomplete rows are excluded. Failed graded courses count toward GPA credits. Changing scale recalculates grades and clears unsupported E grades after confirmation. Target GPA is rounded upward to two decimal places; displayed GPA/CGPA is rounded normally. Repeat-course replacement policies are not applied.
