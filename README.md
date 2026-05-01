# Ascendly CRM

A full-stack, multi-tenant CRM built for sales teams. Manage contacts, track deals through a configurable pipeline, log interactions, assign tasks, run approvals, and monitor performance across 25 analytics reports — all behind JWT authentication and role-based access control.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Roles & Permissions](#roles--permissions)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [First Login](#first-login)
- [Database Migrations](#database-migrations)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Development](#development)

---

## Features

- **Multi-tenant** — each organization's data is fully isolated
- **Deal pipeline** — kanban/list view, configurable stages, stage history, clone deals
- **Contact management** — import via CSV, duplicate detection, merge, tagging, interaction timeline
- **Task management** — create, assign, and track tasks linked to deals or contacts
- **Approval workflows** — discount/deal override requests with role-based approval
- **Reporting** — 25 analytics endpoints: revenue, forecast, leaderboard, pipeline, conversion, win/loss, team and personal summaries, and more
- **Audit log** — immutable record of every create, update, delete, and stage change
- **Security** — bcrypt passwords, JWT (1 h) + rotating refresh tokens (7 d), token-version–based instant session revocation, account lockout after 5 failed attempts, per-IP and per-org rate limiting at both Nginx and Express layers, origin guard (CSRF defense-in-depth), Helmet + Nginx security headers (HSTS, CSP, X-Frame-Options), CORS, password complexity enforcement, HTTPS-only in production
- **Deal pipeline enforcement** — forward-only sequential stage movement, activity gate (requires ≥1 interaction and ≥1 task), SDR ceiling at Qualified stage, optimistic concurrency conflict detection

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router 6, Axios |
| Backend | Node 20, Express 4, jsonwebtoken, bcryptjs, express-validator, Helmet, Winston |
| Database | PostgreSQL 16 |
| Proxy | Nginx 1.27 (SSL/TLS termination, HTTP/2, rate limiting, gzip, HSTS + CSP headers) |
| Containers | Docker + Docker Compose |

---

## Architecture Overview

```
Browser
  │
  ├── :80  (HTTP) → Nginx → 301 redirect to HTTPS
  │                        /health → 200 ok (Nginx-level, no backend hit)
  │
  └── :443 (HTTPS, HTTP/2) → Nginx
                               ├── /api/*   → backend   (Express REST API)
                               └── /*       → frontend  (React + Vite, HMR)

backend → PostgreSQL (db)
```

All four services run as Docker containers on a shared bridge network (`ascendly_net`). **Only ports 80 and 443 are published to the host.** The backend, frontend, and database are not reachable from localhost — all traffic must go through Nginx, which applies rate limiting and security headers before forwarding requests.

---

## Roles & Permissions

| Role | Description |
|---|---|
| **Admin** | Full access to all data within their organization, user management, stage configuration, audit log |
| **Sales Manager** | Manage deals and contacts, approve requests, view team reports, reassign ownership |
| **Sales Rep** | Create and edit own deals and contacts, log interactions, manage own tasks |
| **SDR** | Create contacts and deals, log interactions, assign qualified deals to Sales Reps |
| **Finance** | Read-only access to revenue, forecast, and approval reports |

A special **super-admin** account (identified by `ADMIN_EMAIL` in `.env`) can switch organization context via the `X-Org-Id` header to access any tenant's data — used for platform-level support.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2.x
- A terminal with `bash` (for the SSL generator script)

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repo-url> ascendly
cd ascendly
```

### 2. Configure environment

```bash
cp .env.example .env   # if an example exists, otherwise edit .env directly
```

At minimum, set a strong `JWT_SECRET` and change the default passwords:

```bash
# Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

See [Environment Variables](#environment-variables) for the full reference.

### 3. Generate a development SSL certificate

```bash
bash generate-ssl.sh
```

This creates a self-signed certificate in `nginx/ssl/`. Your browser will show a security warning — click "Advanced → Proceed" to continue. For production, see [SSL / TLS](#ssl--tls).

### 4. Start all services

```bash
docker compose up -d --build
```

Docker will:
1. Start PostgreSQL and wait for it to be healthy
2. Apply the database schema (`postgres/init.sql`) and seed the admin user
3. Start the backend API server
4. Start the React dev server
5. Start Nginx as the reverse proxy

### 5. Open the app

```
https://localhost
```

Accept the self-signed certificate warning and log in with the credentials set in your `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

---

## Environment Variables

Create a `.env` file in the project root. All services read from this file via `docker compose`.

```bash
# ── Application ────────────────────────────────────────────────
NODE_ENV=development          # development | production
DISABLE_RATE_LIMIT=true       # set to false or remove in production

# ── PostgreSQL ─────────────────────────────────────────────────
POSTGRES_DB=ascendly
POSTGRES_USER=ascendly_user
POSTGRES_PASSWORD=change_me_in_production
DATABASE_URL=postgresql://ascendly_user:change_me_in_production@db:5432/ascendly

# ── Admin seed account ─────────────────────────────────────────
# Created automatically on first database init
ADMIN_NAME=Admin User
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Change_Me_On_First_Login!

# ── JWT ────────────────────────────────────────────────────────
JWT_SECRET=generate_a_64_byte_hex_string_here
JWT_EXPIRES_IN=8h             # access tokens are hardcoded to 1 h

# ── Security ───────────────────────────────────────────────────
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000   # 15 minutes
RATE_LIMIT_MAX=500            # requests per window (general API)
LOGIN_RATE_LIMIT_MAX=5        # max login attempts per window
ORG_RATE_LIMIT_MAX=300        # requests per minute per organization

# ── CORS ───────────────────────────────────────────────────────
CORS_ORIGIN=https://your-domain.com

# ── Domain (production SSL) ────────────────────────────────────
DOMAIN=your-domain.com
ACME_EMAIL=admin@your-domain.com

# ── Frontend ───────────────────────────────────────────────────
VITE_ADMIN_EMAIL=admin@example.com   # used by the frontend to identify super-admin
VITE_API_URL=https://your-domain.com/api
```

### Secrets that must be changed before production

| Variable | Why |
|---|---|
| `POSTGRES_PASSWORD` | Default is a known development value |
| `ADMIN_PASSWORD` | Default is a known development value; also change it after first login |
| `JWT_SECRET` | Must be a random, secret, long string — never commit to version control |
| `CORS_ORIGIN` | Must match your actual frontend domain |

---

## First Login

1. Navigate to `https://localhost` (development) or your domain (production)
2. Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env`

### Creating additional users

Go to **Admin → Users ** and assign a role. The new user will receive a temporary password and be required to change it on first login.

---

## API Reference

All endpoints are prefixed with `/api`. Authentication is required on every endpoint except `POST /api/auth/login` and `POST /api/auth/refresh`.

Include the token in every request:
```
Authorization: Bearer <access_token>
```

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Nginx-level probe — returns `200 ok` immediately, no auth (HTTP port 80) |
| GET | `/api/health` | Backend probe — queries the database and returns `{ status, db }` |

### Authentication

Login locks the account for 15 minutes after 5 consecutive failed attempts.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Email + password login, returns 1 h access token + 7 d rotating refresh token |
| POST | `/auth/refresh` | Exchange a refresh token for a new access + refresh token pair (rotation) |
| POST | `/auth/logout` | Revoke all sessions by incrementing the token version |
| GET | `/auth/me` | Get the current authenticated user |
| POST | `/auth/change-password` | Change own password (enforces complexity rules) |

### Contacts

| Method | Endpoint | Description |
|---|---|---|
| GET | `/contacts` | List contacts (search, filter, paginate) |
| POST | `/contacts` | Create a contact |
| GET | `/contacts/duplicates` | Find duplicate contacts by email or name |
| GET | `/contacts/:id` | Get a single contact with tags |
| PATCH | `/contacts/:id` | Update a contact |
| POST | `/contacts/import` | Start async CSV import — returns `202 { jobId }` immediately |
| GET | `/contacts/import/:jobId` | Poll import job status (`pending` → `done`, with error list) |
| POST | `/contacts/:id/merge` | Merge two contacts (keeps `:id`, deletes source) |
| GET | `/contacts/:id/interactions` | All interactions across every deal for this contact |
| GET | `/contacts/:id/stage-history` | All stage moves across every deal for this contact |
| GET | `/contacts/:id/tags` | List tags assigned to a contact |
| POST | `/contacts/:id/tags` | Assign a tag to a contact |

### Deals

| Method | Endpoint | Description |
|---|---|---|
| GET | `/deals` | List deals (search, filter by stage/status/owner, paginate) |
| POST | `/deals` | Create a deal |
| GET | `/deals/:id` | Get a single deal |
| PATCH | `/deals/:id` | Update a deal (stage, value, status, owner, etc.) |
| DELETE | `/deals/:id` | Soft-delete a deal (Admin only) |
| POST | `/deals/:id/clone` | Clone a deal |
| PATCH | `/deals/:id/assign` | Assign deal ownership to a Sales Rep |
| GET | `/deals/:id/interactions` | List interactions on a deal |
| POST | `/deals/:id/interactions` | Log an interaction on a deal |
| GET | `/deals/:id/stage-history` | Stage movement history |
| GET | `/deals/:id/comments` | List comments |
| POST | `/deals/:id/comments` | Post a comment |
| DELETE | `/deals/:id/comments/:cid` | Delete a comment (author or Admin) |
| GET | `/deals/:id/approval` | List all approvals for a deal |
| GET | `/deals/:id/value-history` | Deal value change history |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| GET | `/tasks` | List tasks (filter by status, assignee, deal) |
| POST | `/tasks` | Create a task |
| GET | `/tasks/:id` | Get a single task |
| PATCH | `/tasks/:id` | Update a task |

### Approvals

| Method | Endpoint | Description |
|---|---|---|
| GET | `/approvals` | List approval requests (filter by status) |
| POST | `/approvals` | Submit an approval request (Admin, Sales Manager, Sales Rep — SDRs excluded) |
| GET | `/approvals/:id` | Get a single approval |
| PATCH | `/approvals/:id` | Approve or reject a request |

### Reports

Most report endpoints require `Admin`, `Sales Manager`, or `Finance` role. Exceptions: `team-summary` requires `Admin` or `Sales Manager` (Finance excluded); `personal-summary`, `my-stats`, `my-monthly`, and `search` are accessible to any authenticated user.

| Endpoint | Description |
|---|---|
| `/reports/revenue` | Total revenue, avg/min/max deal value for won deals |
| `/reports/monthly` | Monthly won deal count and revenue (24-month history) |
| `/reports/pipeline` | Deal count and expected value by active stage |
| `/reports/leaderboard` | Rep performance (deals won, revenue, open pipeline) |
| `/reports/forecast` | Weighted forecast (expected value × probability) |
| `/reports/conversion` | Win rate, loss rate, open deal count |
| `/reports/team-summary` | KPI summary for the whole team (Admin / Sales Manager only) |
| `/reports/personal-summary` | KPI summary for the authenticated rep (any role) |
| `/reports/search?q=` | Global search across contacts, deals, and tasks (any role) |

Additional analytics endpoints: `/stage-velocity`, `/deal-cycle`, `/stage-conversion`, `/rep-pipeline`, `/interaction-types`, `/approval-stats`, `/deal-size-buckets`, `/monthly-created`, `/task-completion-by-rep`, `/my-stats`, `/my-monthly`, `/contact-growth`, `/deal-age-buckets`, `/revenue-by-month-rep`, `/win-loss-monthly`, `/lead-source-revenue`.

### Users

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List users in the org (all authenticated users; super-admin sees all orgs) |
| GET | `/users/:id` | Get a single user (Admin only) |
| POST | `/users` | Create a user (Admin only) |
| PATCH | `/users/:id` | Update a user (Admin only) |
| POST | `/users/:id/reset-password` | Set a new password and force reset on next login (Admin only) |

### Other Resources

| Resource | Base path | Description |
|---|---|---|
| Organizations | `/organizations` | Organization settings (super-admin: create/update orgs) |
| Pipeline stages | `/pipeline-stages` | Stage activation, required field configuration |
| Contact tags | `/contact-tags` | Tag CRUD |
| Deal templates | `/deal-templates` | Reusable deal templates |
| Lead sources | `/lead-sources` | Lead source configuration |
| Audit log | `/audit` | Immutable audit trail (Admin only) |

---

## Project Structure

```
ascendly/
├── backend/
│   ├── migrate.js              # Migration runner
│   ├── package.json
│   └── src/
│       ├── index.js            # Express app bootstrap, middleware, route mounting
│       ├── db/
│       │   └── pool.js         # PostgreSQL connection pool
│       ├── middleware/
│       │   ├── auth.js         # JWT authentication, RBAC, super-admin guard
│       │   ├── audit.js        # writeAudit() helper used by all routes
│       │   └── respond.js      # sendOk() helper
│       ├── routes/             # One file per resource (13 modules)
│       └── utils/
│           └── cache.js        # In-memory TTL cache for dashboard queries
│
├── frontend/
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx            # React entry, AuthProvider, Router
│       ├── App.jsx             # Route definitions, protected route guard
│       ├── api/
│       │   └── client.js       # Axios instance, JWT attach, auto-refresh interceptor
│       ├── context/
│       │   └── AuthContext.jsx # login(), logout(), token state
│       ├── components/
│       │   ├── Layout.jsx      # Sidebar, topbar, global search, org switcher
│       │   ├── Modal.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ViewToggle.jsx
│       └── pages/              # 12 page components
│
├── postgres/
│   ├── init.sql                # Full schema (21 tables) + seed data
│   └── seed.sh                 # Creates admin user from ADMIN_* env vars
│
├── nginx/
│   ├── conf/
│   │   ├── nginx.conf          # Worker, gzip, rate limit zones
│   │   └── default.conf        # Virtual hosts, SSL, proxy rules
│   └── ssl/                    # Certificate files (not committed)
│
├── generate-ssl.sh             # Self-signed cert generator (dev only)
├── docker-compose.yml
└── .env
```

---

## Development

### Rebuilding after code changes

The backend and frontend use volume mounts, so most changes are reflected immediately (Vite HMR for frontend, nodemon for backend). If you change `package.json` or `Dockerfile`, rebuild the affected service:

```bash
docker compose build backend    # or frontend
docker compose up -d backend
```

### Rebuilding everything from scratch

```bash
docker compose down -v          # removes containers AND volumes (resets the database)
docker compose up -d --build
```

### Viewing logs

```bash
docker compose logs -f                  # all services
docker compose logs -f backend          # backend only
docker compose logs -f db               # PostgreSQL
```

### Connecting to the database directly

```bash
docker compose exec db psql -U ascendly_user -d ascendly
```

### Running a migration manually

```bash
docker compose exec backend node migrate.js
```

### Resetting the admin password

```bash
docker compose exec db psql -U ascendly_user -d ascendly -c \
  "UPDATE employees SET password_hash = crypt('NewPassword123!', gen_salt('bf', 12)), \
   password_reset_required = true WHERE email = 'admin@example.com';"
```
