# Hearth — Family Expense Tracker

Hearth is a full-stack Progressive Web App for couples and small households to
manage shared money together: capture receipts, request and clear
reimbursements, track advances and their returns, and plan ahead with a
projected-expense calendar — all while keeping personal purchases private.

![Hearth logo](public/logo.svg)

## Features

- **Receipts & expenses** — record shared or personal expenses with merchant,
  date, category, notes, and an optional photo receipt (compressed in-browser
  before upload). Expenses flow through a clear lifecycle:
  `draft → posted → disputed → resolved → voided`.
- **Reimbursement clearing loop** — when one partner covers a shared expense,
  the other can open a reimbursement request; it is settled only when *both*
  sides confirm, so the books always agree.
- **Advances** — request cash in advance (e.g. for groceries), link the
  resulting receipts to the advance, and return any remainder. Aging advances
  surface a warning after a configurable number of days.
- **Returns & refunds** — mark a purchase as returned, record partial or full
  refunds, and keep them linked to the original expense.
- **Projected-expense calendar** — plan one-off and recurring (RRULE-based)
  upcoming expenses and see them on a calendar alongside real activity.
- **Dashboard** — shared balance, per-category breakdowns, and charts of
  recent activity.
- **Personal privacy** — every record is scoped `shared` or `personal`.
  Personal rows are visible only to their owner; your partner never sees them.
- **Notifications & audit log** — requests, confirmations, and disputes
  generate notifications, and every state change is recorded in an audit trail.
- **Installable PWA** — add to home screen, offline shell, auto-updating
  service worker.

### Screens & assets

Onboarding and empty-state artwork lives in `public/`:

| Asset | Used for |
| --- | --- |
| `public/hero-onboarding.png` | Welcome / onboarding hero |
| `public/onboarding-receipt-loop.png` | Receipt & reimbursement loop explainer |
| `public/onboarding-advance.png` | Advances explainer |
| `public/empty-receipts.svg`, `empty-requests.svg`, `empty-calendar.svg`, `empty-personal.svg` | Empty states |
| `public/pwa-icon-512.png` | PWA / app icon |

## User workflows

- **Log a receipt:** Home → New record → add merchant, amount, category,
  snap/attach a receipt photo → post. Keep it as `draft` while details are
  uncertain.
- **Clear a reimbursement:** open a shared expense you didn't pay → request
  reimbursement → the payer confirms → both sides confirm settlement →
  the request closes.
- **Take an advance:** Requests → New advance → amount & purpose → partner
  approves and disburses → link receipts as you spend → return the remainder.
- **Handle a return:** open the original expense → mark return initiated →
  add refund(s) as money comes back → status becomes partially/fully refunded.
- **Plan the month:** Calendar → add a projected expense (one-off or
  recurring) → it appears on the calendar and in projections.
- **Stay private:** create any record with scope *Personal* — it appears only
  in your Personal tab.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for a day-to-day walkthrough.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS 3, shadcn/ui (Radix), React Router 7, TanStack Query, Recharts, Framer Motion |
| API | Hono (Node) with tRPC v11, Zod validation, SuperJSON |
| Auth | Kimi OAuth (JWT session cookie via `jose`) |
| Database | MySQL 8 via Drizzle ORM (`mysql2`) |
| Storage | S3-compatible object storage for receipt images (presigned URLs) |
| PWA | `vite-plugin-pwa` / Workbox, auto-update service worker |
| Testing | Vitest |
| Money | All amounts stored as integer **cents** — no floats, ever |

## Project structure

```
api/               Hono server + tRPC routers (one file per domain area)
  kimi/            OAuth / session integration
  lib/             env, cookies, money helpers (tested)
  queries/         Drizzle query helpers per domain
contracts/         Shared types, constants and error codes (client + server)
db/                Drizzle schema, relations, migrations, seed script
src/               React app
  pages/           Route pages (Home, Records, Requests, Calendar, Personal…)
  components/      Layout + shadcn/ui component library
  hooks/           useAuth, use-mobile
public/            PWA icon, onboarding art, empty-state illustrations
docs/              User guide and developer documentation
```

## Prerequisites

- Node.js 20+
- A MySQL 8 database (local, Docker, or hosted)
- Kimi OAuth application credentials (app ID / secret)
- (Optional) S3-compatible bucket for receipt uploads

## Quick start

```bash
npm install
cp .env.example .env      # fill in values (see below)
npm run db:push           # create/upgrade the schema
npx tsx db/seed.ts        # optional: demo data ("The Ember Household")
npm run dev               # http://localhost:5173 (API proxied through Vite)
```

## Environment variables

All variables are documented in [`.env.example`](.env.example). Summary:

| Variable | Purpose |
| --- | --- |
| `APP_ID` | Application ID (must match the OAuth app) |
| `APP_SECRET` | Secret used to sign session JWTs |
| `DATABASE_URL` | MySQL connection string |
| `KIMI_AUTH_URL` / `VITE_KIMI_AUTH_URL` | OAuth server URL (backend / browser) |
| `KIMI_OPEN_URL` | Kimi Open Platform URL |
| `VITE_APP_ID` | OAuth app ID exposed to the browser |
| `OWNER_UNION_ID` | Union ID of the creator — first login gets the `admin` role |

Never commit `.env`. Only `VITE_*` variables reach the browser.

## Database

```bash
npm run db:generate   # generate SQL migrations from db/schema.ts
npm run db:push       # push schema directly (dev)
npm run db:migrate    # apply generated migrations (prod-style)
npx tsx db/seed.ts    # idempotent demo seed (skips if already seeded)
```

The data model covers: `users`, `families`, `family_memberships`,
`categories`, `expenses`, `refunds`, `reimbursement_requests` (+ items),
`advance_requests` (+ returns), `projected_expenses`, `notifications`, and
`audit_events`. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for details.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with the Hono API mounted at `/api` |
| `npm run build` | Build the client and bundle the server to `dist/` |
| `npm start` | Run the production server (`dist/boot.js`) |
| `npm run check` | Type-check all TypeScript projects |
| `npm test` | Run Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## PWA notes

- The app registers an auto-updating service worker (`vite-plugin-pwa` /
  Workbox) with a standalone display manifest; install it via the browser's
  "Add to Home Screen".
- During development the service worker is disabled by default — use
  `npm run build && npm run preview` to test PWA behaviour.
- The API (`/api/*`) is always network-first; only the app shell and static
  assets are cached.

## Authentication notes

- Sign-in uses Kimi OAuth. On callback the server verifies the identity,
  upserts the user, and issues a signed JWT stored in an `HttpOnly` cookie.
- The user whose union ID matches `OWNER_UNION_ID` receives the `admin` role
  on first login.
- All tRPC procedures except `ping` require an authenticated session, and
  domain procedures additionally verify family membership server-side.

## Deployment notes

1. Provide production environment variables (see above).
2. Run `npm run db:migrate` (or `db:push`) against the production database.
3. `npm run build && npm start` — a single Node process serves both the API
   and the static client from `dist/`.
4. Serve over HTTPS (required for the service worker and secure cookies).

## Security & privacy

- Hard privacy isolation: every domain row carries `familyId` + `scope`
  (`shared`/`personal`) + `ownerId`, and all queries are filtered server-side —
  personal data is never serialized to another user.
- Money is stored as integer cents; the client only formats for display.
- Session tokens are signed JWTs in `HttpOnly`, `SameSite` cookies; secrets
  live only in server-side environment variables.
- Receipt uploads use short-lived presigned URLs; objects are not public.

## Troubleshooting

- **`db:push` fails to connect** — verify `DATABASE_URL`, that MySQL 8 is
  running, and that the database exists (`CREATE DATABASE …`).
- **Login redirects back to the login page** — `APP_ID`/`VITE_APP_ID` must
  match the OAuth app, and `APP_SECRET` must be set.
- **Blank screen / stale UI after deploy** — the service worker may be serving
  an old shell; hard-refresh or clear site data. It self-heals via
  `autoUpdate` on the next load.
- **Receipt upload fails** — check the S3 credentials/endpoint configuration.
- **Port already in use** — set a different Vite port (`npm run dev -- --port 5174`).

## Contributing

1. Fork and create a feature branch.
2. Keep changes focused; follow the existing conventions (Prettier + ESLint,
   integer cents for money, server-side scope filtering).
3. Run `npm run check`, `npm run lint`, and `npm test` before opening a PR.
4. Update documentation when behaviour changes.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture and common
development tasks.
