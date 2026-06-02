# Multi-Tenancy Migration

## Context

Rides API previously served one cycling club (BCC). This plan covers the work to make it multi-tenant. Auth swap is a separate concern — see `auth-migration.md`.

Both phases are complete and live in v2.0.0.

## Decisions (settled)

- **User model**: junction table `user_clubs(userId, clubId, role)`. Same login acts in multiple clubs. Per-club role.
- **Tenant routing**: hybrid. Frontend sends `X-Club-Id` header on authed requests; middleware verifies `(userId, clubId)` against `user_clubs`. Public routes accept `?club=<slug>`. Cron callers loop all clubs (no per-call slug) using a single super-admin key.
- **Table prefix**: dropped `bcc_` from every table — historic single-club artifact. ✓
- **Super-admin**: global role via `users.isSuperAdmin` boolean. Bypasses club membership checks. Per-club role (USER/LEADER/ADMIN) lives on `user_clubs`.
- **RiderHQ**: BCC-only sunsetting feature. Credentials stay in env vars (no DB columns). Endpoint scoped to BCC at the code level. `memberships` table stays per-club (clubId column) but only BCC populates it. `users.membershipId` is a free-form string for any club that wants to record one — no join, no validation rules.
- **Cron auth**: single global super-admin API key (`API_KEY` env var). Cron endpoints loop over all clubs. `club_api_keys` table in schema for future per-club keys but unused.
- **Back-compat**: env-flag-driven. Compat mode default; `STRICT_TENANCY=true` flips to strict. Lets extra clubs be tested in prod while the legacy frontend continues to work against a default club.

---

## Phase 0: Drop `bcc_` table prefix — ✅ DONE (v2.0.0)

Standalone, no-behaviour-change PR. Shipped before phase 1 so subsequent migrations landed on a clean schema.

### Schema (`src/db/schema/index.ts:6`)

```ts
const createTable = pgTableCreator((name) => name); // was: `bcc_${name}`
```

### Migration

Drizzle-generated diff would be destructive (DROP/CREATE). Replaced by hand with `ALTER TABLE` renames:

```sql
ALTER TABLE "bcc_users" RENAME TO "users";
ALTER TABLE "bcc_accounts" RENAME TO "accounts";
ALTER TABLE "bcc_sessions" RENAME TO "sessions";
ALTER TABLE "bcc_verification_tokens" RENAME TO "verification_tokens";
ALTER TABLE "bcc_rides" RENAME TO "rides";
ALTER TABLE "bcc_users_on_rides" RENAME TO "users_on_rides";
ALTER TABLE "bcc_repeating_rides" RENAME TO "repeating_rides";
ALTER TABLE "bcc_archived_rides" RENAME TO "archived_rides";
ALTER TABLE "bcc_archived_users_on_rides" RENAME TO "archived_users_on_rides";
ALTER TABLE "bcc_membership" RENAME TO "memberships";
```

`membership` → `memberships` (singular → plural) at the same time. FK constraints and indexes renamed in the same migration.

### Raw SQL touch points updated in lockstep

- `src/db/schema/index.ts:6` — prefix factory
- `src/routes/archive.ts` — raw `DELETE FROM` statements
- `src/db/pump.ts` — data pump utility

---

## Back-compat (default-club fallback) — ✅ DONE (v2.0.0)

Active when `STRICT_TENANCY !== "true"` (default). `DEFAULT_CLUB_SLUG=bcc` names the fallback target.

Behaviours under compat:
- Missing `X-Club-Id` header / `?club=` query → resolve to `DEFAULT_CLUB_SLUG`
- CORS allowlist reads `clubs.allowedOrigins` if set, else falls back to env-hardcoded origins
- Legacy `API_KEY` env var still works for cron

Implemented in `src/middleware/club.ts` — `resolveClub(c)` tries header → query → default fallback.

---

## Phase 1: Multi-tenancy — ✅ DONE (v2.0.0)

### Schema

New tables:
- `clubs`: id, slug (unique), name, settings (jsonb), allowedOrigins (jsonb), createdAt, updatedAt
- `user_clubs`: userId fk, clubId fk, role (USER/LEADER/ADMIN), joinedAt — composite PK
- `club_api_keys`: id, clubId (nullable for super-admin keys), hashedKey, label, lastUsedAt — in schema; unused

`clubId` (FK, NOT NULL) added to: `rides`, `repeating_rides`, `archived_rides`, `memberships`.
`users_on_rides` and `archived_users_on_rides` derive clubId via ride join — no column.

`users.role` dropped. Per-club role lives on `user_clubs.role`. `users.isSuperAdmin` added.

Composite indexes: `(clubId, deleted, rideDate)` on rides; `(clubId, lower(email))` on memberships.

### Middleware

`src/middleware/club.ts` runs after `authMiddleware`/`optionalAuth`:
- Read `X-Club-Id` header (or `?club=` for public/cron)
- Resolve to `clubs` row
- Authed: verify `user_clubs` row for `(userId, clubId)` — bypassed if `users.isSuperAdmin`
- 404 club / 403 not-a-member / 400 missing (suppressed in compat mode)
- `c.set("club", { id, slug, role })` — super-admin without a membership row gets role `"ADMIN"`

### Routes

All ride/repeating-ride/archived-ride/membership queries gained `clubId` predicate. Cache keys gained clubId prefix: `rides:${clubId}:list:*`, `rides:${clubId}:detail:*`.

### Club-management endpoints

- `POST /clubs` — super-admin only
- `GET /clubs` — user's clubs (or all if super-admin)
- `GET /clubs/:slug`
- `PATCH /clubs/:slug` — per-club ADMIN
- `POST /clubs/:slug/members` — invite/add user
- `DELETE /clubs/:slug/members/:userId`
- `PATCH /clubs/:slug/members/:userId` — change per-club role
- `POST /clubs/:slug/api-keys` — stub (deferred)
- `DELETE /clubs/:slug/api-keys/:id` — stub (deferred)

### Backfill (three migrations, applied)

1. Add nullable `clubId` + new tables + `users.isSuperAdmin`
2. Backfill BCC row, set clubId on all existing data, build `user_clubs` from `users.role`
3. Set `clubId` NOT NULL, drop `users.role`

---

## Other things to think about

- **Slug rules**: lowercase, dash-separated, 3-30 chars, must start with a letter. Reserved: `api`, `admin`, `auth`, `users`, `rides`, `clubs`, `health`, `status`, `www`, `static`, `assets`, and other obvious system/HTTP/app words.
- **CORS allowlist**: stored per-club in `clubs.allowedOrigins`; built dynamically in `src/index.ts`.
- **Per-club settings (jsonb on clubs)**: ride-limit defaults, winter time on/off, leader-can-self-assign, etc.
- **Rate limits**: shared API → per-club + per-user quotas. Deferred.
- **GDPR/exports**: per-club data export endpoint, ADMIN-gated. Deferred.
- **Logging/observability**: tag every log with clubId. Hono logger middleware needs this.
- **Club soft-delete**: blocked while users or rides remain. Semantics deferred.

---

## Verification (phase 1 — for reference)

- Two clubs coexist; club A list excludes club B's rides
- Authed user in club A spoofing `X-Club-Id: B` → 403
- Cache invalidation for club A doesn't drop club B entries
- RiderHQ sync only touches BCC's memberships
- Cron loop: `/archive` and `/generate` process all clubs on a single trigger
- Compat mode: missing header resolves to `DEFAULT_CLUB_SLUG` even with 2+ clubs
- Strict mode: missing header → 400
- Super-admin reaches every club's resources without a `user_clubs` row
