# Rides API Development Plan

External Hono API for BCC Rides app, replacing Vercel serverless functions.

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Hono
- **Database**: Drizzle ORM + Supabase Postgres
- **Auth**: Auth0 JWT verification (JWKS)
- **Hosting**: Oracle Cloud Always Free VM
- **Process Manager**: PM2
- **Reverse Proxy**: Caddy (auto HTTPS)

## Infrastructure

| Component      | Value                         |
| -------------- | ----------------------------- |
| VM IP          | 143.47.251.53                 |
| Domain         | api.fairhursts.net            |
| Port           | 3001 (internal), 443 (public) |
| Auth0 Audience | https://api.bcc-rides.com     |

---

## Endpoints

### Rides

| Method | Path                | Auth     | Status | Description                       |
| ------ | ------------------- | -------- | ------ | --------------------------------- |
| GET    | `/rides`            | Optional | ✅     | List rides with date range filter |
| GET    | `/rides/:id`        | Optional | ✅     | Get ride details with users       |
| POST   | `/rides/:id/join`   | Required | ✅     | Join a ride (self or LEADER+)     |
| POST   | `/rides/:id/leave`  | Required | ✅     | Leave a ride (self or LEADER+)    |
| PATCH  | `/rides/:id/notes`  | Required | ✅     | Update user's notes for a ride    |
| POST   | `/rides`            | LEADER+  | ⬜     | Create a new ride                 |
| PUT    | `/rides/:id`        | LEADER+  | ⬜     | Update ride details               |
| DELETE | `/rides/:id`        | ADMIN    | ⬜     | Soft delete a ride                |
| POST   | `/rides/:id/cancel` | LEADER+  | ⬜     | Cancel a ride                     |

### Users

| Method | Path                | Auth       | Status | Description              |
| ------ | ------------------- | ---------- | ------ | ------------------------ |
| GET    | `/users/me`         | Required   | ✅     | Get current user profile |
| GET    | `/users`            | LEADER+    | ⬜     | List all users           |
| GET    | `/users/:id`        | Required   | ⬜     | Get user by ID           |
| PUT    | `/users/:id`        | Self/ADMIN | ⬜     | Update user profile      |
| PUT    | `/users/:id/avatar` | Self/ADMIN | ⬜     | Update user avatar       |

### Repeating Rides (Admin)

| Method | Path                        | Auth    | Status | Description                   |
| ------ | --------------------------- | ------- | ------ | ----------------------------- |
| GET    | `/repeating-rides`          | LEADER+ | ⬜     | List repeating ride templates |
| GET    | `/repeating-rides/:id`      | LEADER+ | ⬜     | Get template details          |
| POST   | `/repeating-rides`          | LEADER+ | ⬜     | Create template               |
| PUT    | `/repeating-rides/:id`      | LEADER+ | ⬜     | Update template               |
| DELETE | `/repeating-rides/:id`      | ADMIN   | ⬜     | Delete template               |
| POST   | `/repeating-rides/generate` | ADMIN   | ⬜     | Generate rides from templates |

### Health

| Method | Path      | Auth | Status | Description  |
| ------ | --------- | ---- | ------ | ------------ |
| GET    | `/health` | None | ✅     | Health check |

---

## Auth Middleware

Three levels of auth:

1. **optionalAuth** - Sets user if token present, continues if not
2. **authMiddleware** - Requires valid token, returns 401 if missing/invalid
3. **requireRole(...roles)** - Chain after authMiddleware, checks role

User lookup flow:

```
JWT sub (auth0|xxx) → accounts.providerAccountId → users table
```

---

## Deployment

### Update VM

```bash
ssh -i ~/.ssh/oracle-rides-key ubuntu@143.47.251.53 'cd ~/rides-api && git pull && npm ci && npm run build && pm2 restart rides-api'
```

### View logs

```bash
ssh -i ~/.ssh/oracle-rides-key ubuntu@143.47.251.53 'pm2 logs rides-api --lines 50'
```

### Restart

```bash
ssh -i ~/.ssh/oracle-rides-key ubuntu@143.47.251.53 'pm2 restart rides-api'
```

---

## Project Structure

```
rides-api/
├── src/
│   ├── index.ts              # Hono app entry
│   ├── db/
│   │   ├── index.ts          # Drizzle connection
│   │   └── schema/
│   │       └── index.ts      # Consolidated schema
│   ├── routes/
│   │   ├── rides.ts          # /rides endpoints
│   │   └── users.ts          # /users endpoints
│   ├── middleware/
│   │   └── auth.ts           # JWT verification + role checks
│   └── lib/
│       └── auth0.ts          # Auth0 JWKS validation
├── .env                      # Local env vars
├── eslint.config.js
├── tsconfig.json
└── package.json
```

---

## Environment Variables

```bash
DATABASE_URL=postgres://...
AUTH0_DOMAIN=dev-xxx.auth0.com
AUTH0_AUDIENCE=https://api.bcc-rides.com
PORT=3001
NODE_ENV=production
```
