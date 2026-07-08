# Booking Control Center (BCC)

An internal Property Management System for managing rental rooms listed across
Airbnb, Booking.com, OYO, MakeMyTrip, Direct/Walk-in, and other channels — not a
customer-facing booking site.

## Stack

- **Backend**: FastAPI + SQLAlchemy + JWT auth (SQLite locally, swappable to Postgres/Supabase)
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS v4 + TanStack Query
- **Calendar**: FullCalendar
- **Charts**: Recharts

## What's implemented (Phase 1 + parts of Phase 2)

- **Admin-issued credentials, not self-registration.** There's no public sign-up
  form. Accounts are created either from Admin → Users in the app, or from the
  shell with `python -m app.create_user` — both generate a random temporary
  password you share with the person directly. They're forced to set their own
  password (`must_change_password`) on first login.
- **Clusters (properties/buildings).** Every room belongs to a cluster — e.g.
  "Sunrise Villa - MG Road" vs "Garden Heights - Whitefield" if you own rooms
  in more than one location. Admins see every cluster; managers/staff only see
  the clusters an admin has explicitly granted them from Admin → Users, and
  every room/booking/dashboard/report/CSV-export endpoint enforces that
  server-side (not just hidden in the UI). A cluster switcher in the sidebar
  (or the mobile "More" sheet) lets you flip between "All Clusters" and a
  single one.
- Auth with roles (admin / manager / staff), JWT-based
- Room management (CRUD, types, pricing tiers, status, cluster assignment)
- Booking management (CRUD, search/filter) with **automatic double-booking
  conflict detection** per room/date-range
- Calendar view (month/week/day) color-coded by booking status
- Dashboard: check-ins/outs, occupancy, revenue today/month, pending payments,
  upcoming arrivals/departures, monthly revenue chart, booking source chart —
  all scoped to the selected cluster
- Reports: revenue by room/source, average stay, team performance, expenses
  summary with net profit, CSV export for bookings and expenses
- Expense tracking by category
- Guest history lookup by phone + guest notes
- **Mobile/tablet-first UI**: bottom tab bar navigation on phones (Dashboard,
  Bookings, Calendar, Rooms, More), a slide-up sheet for secondary pages,
  44px+ touch targets, 16px inputs (no iOS auto-zoom), safe-area padding for
  notched devices. Sidebar nav returns automatically at tablet/desktop widths.
- **Live-ish updates**: dashboard, bookings, and calendar poll every 30–60s
  via TanStack Query, so a booking made on one device shows up elsewhere
  without a manual refresh.
- **iCal sync from Airbnb/Booking.com/OYO/MakeMyTrip** (Admin → Automation):
  paste in each listing's calendar export URL and it mirrors busy dates into
  bookings, deduped by the feed's event UID so re-syncing never creates
  duplicates. This is the realistic integration path — the official Airbnb/
  Booking.com APIs require becoming an approved channel-manager partner,
  which isn't available to individual/small hosts.
- **Telegram + email reminders** (Admin → Automation): arrivals/checkouts
  tomorrow, pending payments, cleaning-required flags, and a daily summary.
  Every notification call is a safe no-op (logs and returns `false`) if you
  haven't configured credentials yet — the app runs fine without them.
  Triggered by `python -m app.send_reminders` or a scheduler hitting
  `/automation/run-daily-reminders`.

Not implemented (needs real provider credentials/accounts you'd have to set
up yourself): automatic email-parsing sync (parsing confirmation emails is
fragile and unnecessary now that iCal sync exists), WhatsApp notifications,
Supabase/Vercel/Render deployment (the app is cloud-ready but needs your own
accounts to deploy to).

## Running locally

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # defaults to SQLite, edit DATABASE_URL for Postgres/Supabase
python -m app.seed     # creates demo rooms/bookings/users
uvicorn app.main:app --reload --port 8010
```

API docs: http://localhost:8010/docs

Demo logins (from seed) — two clusters, Rahul scoped to only one:
- `admin@bcc-demo.com` / `admin123` (admin, sees both clusters)
- `rahul@bcc-demo.com` / `staff123` (manager, sees only "Sunrise Villa")

### Creating real user accounts

Don't use the seed accounts in production — create real ones and issue
credentials yourself:

```bash
# From the app: log in as admin -> Admin -> Users -> Add User
# Or from the shell:
cd backend && source venv/bin/activate
python -m app.create_user --name "Priya" --email priya@example.com --role staff
# -> prints a one-time temporary password to hand to Priya directly
python -m app.create_user --email priya@example.com --reset-password   # to reissue one later
```

After creating a user, grant them cluster access from Admin → Users (admins
implicitly see every cluster; managers/staff see nothing until you assign at
least one).

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # or verify NEXT_PUBLIC_API_URL matches the backend port
npm run dev
```

App: http://localhost:3000

> **Note:** `dev`/`build` scripts pin `--webpack`. Next.js 16.2's Turbopack has
> a bug in this environment (`Could not find the module ".../global-error.js#default"
> in the React Client Manifest`) that breaks every route. Webpack mode is a
> reliable workaround; retry Turbopack after upgrading Next.js if you hit this.

## Setting up notifications & channel sync

All optional, all configured in `backend/.env`, all safe to leave blank (the
app just skips sending). After setting any of these, restart the backend and
use **Admin → Automation → Send Test Notification** to confirm it works.

**Telegram** — message `@BotFather` on Telegram, run `/newbot`, copy the
token into `TELEGRAM_BOT_TOKEN`. For `TELEGRAM_CHAT_ID`, message
`@userinfobot` to get your own numeric ID (or add the bot to a group and use
the group's ID).

**Email** — sign up for [Resend](https://resend.com) (free tier), verify a
sending domain, create an API key, put it in `RESEND_API_KEY`. Prefer your
own mailbox instead? Leave `RESEND_API_KEY` blank and fill in `SMTP_HOST` /
`SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM_EMAIL` instead —
the app falls back to plain SMTP automatically.

**iCal sync (Airbnb/Booking.com/OYO/MakeMyTrip)** — from Admin → Automation,
add a feed per room:
- Airbnb: host dashboard → Calendar → Availability → **Export Calendar**, copy the URL
- Booking.com: Extranet → Calendar → **Sync calendars** → copy the iCal export URL
- OYO/MakeMyTrip: check whether your partner dashboard exposes an iCal export; if not, this integration isn't available for that channel yet

Hit **Sync Now** to pull immediately, or wire up the GitHub Actions workflow
below to run it automatically.

**Scheduling the daily jobs** — three options, pick whichever fits how you
host this:
1. **GitHub Actions** (works once you deploy): the workflow at
   `.github/workflows/daily-automation.yml` is already wired up. In your
   GitHub repo settings, add secrets `BACKEND_URL` (your deployed backend URL)
   and `AUTOMATION_SECRET` (any long random string — must match
   `AUTOMATION_SECRET` in `backend/.env`). It runs daily at 03:00 UTC and can
   also be triggered manually from the Actions tab.
2. **Your own cron**, if you're running the backend on a machine you control:
   `python -m app.send_reminders` and hitting the sync endpoint on a schedule.
3. **Manual**: `python -m app.send_reminders` from the shell, or the
   "Sync Now" / "Send Test Notification" buttons in Admin → Automation.

## Switching to Postgres/Supabase

Set `DATABASE_URL` in `backend/.env` to your Supabase connection string, e.g.:

```
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres
```

Then re-run `python -m app.seed` (or apply your own migrations — Alembic is
included in requirements but no migrations are pre-generated; `Base.metadata.create_all`
handles table creation for now).

## Deployment (free tier, as specified)

- **Frontend → Vercel**: point the project root at `frontend/`, set
  `NEXT_PUBLIC_API_URL` to your Render backend URL.
- **Backend → Render**: point at `backend/`, start command
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, set `DATABASE_URL`,
  `SECRET_KEY`, `FRONTEND_ORIGIN` env vars.
- **Database → Supabase**: create a project, copy the Postgres connection
  string into `DATABASE_URL`.
- **Automation → GitHub Actions**: `.github/workflows/daily-automation.yml`
  is ready — set the `BACKEND_URL` and `AUTOMATION_SECRET` repo secrets and
  it runs iCal sync + daily reminders automatically. See "Setting up
  notifications & channel sync" above.

## A note on "Django admin"

This app isn't built on Django (it's FastAPI + Next.js), so there's no
`/admin/` auto-generated Django admin site. The equivalent here is the
in-app **Admin → Users** / **Admin → Clusters** pages (visible only to
admin-role accounts) plus the `app.create_user` shell script for anyone who
prefers the command line.

## Project layout

```
booking/
  backend/    FastAPI app (app/models.py, routers/, seed.py)
  frontend/   Next.js app (src/app, src/components/ui, src/lib)
```
