# Multi-Tenancy + Auth Migration

## Context

Rides API today serves one cycling club (BCC). Two changes wanted:

1. Multi-tenancy so multiple clubs share the API
2. Replace Auth0 with better-auth (email+password) — cleaner ergonomics, fewer external deps

Both done **in-place on this repo, sequentially, multi-tenancy first**. Schema is small (11 tables, ~5 club-scoped), routes are clean (~24), no OpenAPI consumers — greenfield doubles work and forces frontend dual-stack for no gain.

## Decisions (settled)

- **User model**: junction table `user_clubs(userId, clubId, role)`. Same login acts in multiple clubs. Per-club role.
- **Tenant routing**: hybrid. Frontend sends `X-Club-Id` header on authed requests; middleware verifies `(userId, clubId)` against `user_clubs`. Public routes accept `?club=<slug>`. Cron callers loop all clubs (no per-call slug) using a single super-admin key — see Cron auth below.
- **Sequencing**: phase 0 (drop `bcc_` prefix) → phase 1 (multi-tenancy) → phase 2 (auth swap, deferred).
- **Table prefix**: drop `bcc_` from every table — historic single-club artifact. Supabase host has no naming-clash worry.
- **Super-admin**: new global role via `users.isSuperAdmin` boolean. Bypasses club membership checks. Per-club role (USER/LEADER/ADMIN) lives on `user_clubs`.
- **RiderHQ**: BCC-only sunsetting feature. Credentials stay in env vars (no DB columns). Endpoint scoped to BCC at the code level, not data-driven. `memberships` table stays per-club (clubId column) but only BCC populates it. `users.membershipId` is a free-form string for any club that wants to record one — no join, no validation rules.
- **Cron auth**: keep a single global super-admin API key for now (env `API_KEY` is that key). Cron endpoints loop over all clubs. `club_api_keys` table stays in schema for future per-club keys but unused initially.
- **Back-compat**: env-flag-driven (not auto). Compat mode default; `STRICT_TENANCY=true` flips to strict. Lets you create+test extra clubs in prod while the legacy frontend continues to work against a default club.
- **Auth phase 2**: deferred. Phase 1 keeps Auth0 untouched.

---

## Phase 0: Drop `bcc_` table prefix

Standalone, no-behaviour-change PR. Ships before phase 1 so subsequent migrations land on a clean schema.

### Schema (`src/db/schema/index.ts:6`)

```ts
const createTable = pgTableCreator((name) => name); // was: `bcc_${name}`
```

Or drop the helper entirely and use `pgTable` directly. Either works.

### Migration

Drizzle-generated diff will be destructive (DROP/CREATE). Replace its body by hand with `ALTER TABLE` renames:

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

Note: `membership` → `memberships` (singular → plural) at the same time. Table is non-consequential in production (truncated and rebuilt by RiderHQ sync), so no data risk.

FK constraints and indexes carry `bcc_` in their names (drizzle's snapshot 0007 tracks them, e.g. `bcc_accounts_user_id_bcc_users_id_fk`). Rename them all in the same migration — one PR, one deploy, clean snapshot.

### Raw SQL touch points (must update in lockstep with migration)

- `src/db/schema/index.ts:6` — prefix factory
- `src/routes/archive.ts:71,76` — raw `DELETE FROM "bcc_users_on_rides" / "bcc_rides"`
- `src/db/pump.ts:45,56,64,82,91,102,113,124` — data pump utility (multiple `from "bcc_*"`)
- `src/middleware/__tests__/provisioning.test.ts:5` — comment only

### Why ALTER RENAME, not side-by-side copy

Supabase supports both. Side-by-side (create new, copy, swap, drop old) is for when you need a long validation window — overkill here. `ALTER TABLE … RENAME` is atomic per-table, fast, no data movement. Whole rename runs in one transaction.

### Deploy ordering

Code and migration must ship together — code references new names, migration creates them. Standard release.

### Tests

- Existing test suite re-run on renamed schema confirms no string assumes `bcc_`.
- `bun run check-types && bun test` — full suite.

---

## Back-compat (default-club fallback)

Phase 1 breaks the frontend without mitigation. Mitigation: env-flag-driven compat mode that resolves missing club identifiers to a hardcoded default. Multi-club coexistence in prod stays safe — extra clubs are reachable via header only, the legacy frontend hits the default.

Active when env `STRICT_TENANCY !== "true"` (default). Flipping `STRICT_TENANCY=true` enables strict mode (400 on missing identifier). Number of clubs is irrelevant — explicitly env-controlled so you can test multi-club in prod before cutting over.

Env: `DEFAULT_CLUB_SLUG=bcc` names the fallback target.

Behaviours under compat:

- Missing `X-Club-Id` header / `?club=` query → resolve to `DEFAULT_CLUB_SLUG` (not "the only club")
- `/users/me` payload includes legacy `role` field (= the user's role on the default club, if any) alongside new per-club role array
- CORS allowlist reads `clubs.allowedOrigins` if set, else falls back to current env-hardcoded origins (`src/index.ts:25`)
- Legacy `API_KEY` env var still works for cron — cron loops all clubs regardless

Implement in `src/middleware/club.ts` — single function `resolveClub(c)` that tries header → query → default fallback. Wrap fallback in a feature-flag check so the whole branch is deletable once strict mode is on.

Frontend gets a compat window to add header injection, switch to the new payload, etc., without lockstep deploy.

---

## Phase 1: Multi-tenancy

### Schema (`src/db/schema/index.ts`)

New tables:

- `clubs`: id, slug (unique), name, settings (jsonb), allowedOrigins (jsonb), createdAt, updatedAt
- `user_clubs`: userId fk, clubId fk, role (USER/LEADER/ADMIN), joinedAt — composite PK
- `club_api_keys`: id, clubId (nullable for super-admin keys), hashedKey, label, lastUsedAt — kept in schema; not used in phase 1 cron flow

Add `clubId` (FK, NOT NULL after backfill) to:

- `rides`
- `repeating_rides`
- `archived_rides`
- `memberships` (BCC-only populated; column kept for schema consistency)

`users_on_rides` and `archived_users_on_rides` derive clubId via ride join — no column.

### Roles

- Per-club role (USER/LEADER/ADMIN) lives on `user_clubs.role`. Drop `users.role` column.
- Global super-admin: `users.isSuperAdmin: boolean`. Bypasses club membership check; only role with cross-club authority.

Why drop `users.role`?

In a multi-club model, "what role is this user?" has no global answer — the same person can be ADMIN in club A and USER in club B. Role belongs on the membership, not the principal. There is no global permissions table by design: super-admin is the *only* global authority, and it's a single boolean. Keeping `users.role` would force dual-write logic that drifts from the junction table.

Composite indexes:

- `(clubId, deleted, rideDate)` on rides
- `(clubId, lower(email))` on memberships
- `(clubId, slug)` lookup helpers

### Middleware

`src/middleware/club.ts` (new), runs **after** `authMiddleware`/`optionalAuth`:

- Read `X-Club-Id` header (or `?club=` for public/cron)
- Resolve to `clubs` row
- Authed: verify `user_clubs` row exists for `(userId, clubId)` — **bypassed if `users.isSuperAdmin`**
- 404 club / 403 not-a-member / 400 missing (suppressed in compat mode — see above)
- Compat mode: missing identifier → `DEFAULT_CLUB_SLUG` club; membership check still applies (super-admin still bypasses)
- `c.set("club", { id, slug, role })` — `role` is the per-club role; for super-admin without a `user_clubs` row, role resolves to `"ADMIN"` for that request

`requireRole()` reads `c.get("club").role`. Super-admin always satisfies any role gate.

### Routes — every WHERE gains clubId predicate

Touch list (~24 routes; cache keys also change):

- `src/routes/rides.ts` — predicates lines 81, 122, 127, 191, 232, 275, 325, 393, 428, 462, 498
- `src/routes/repeating-rides.ts`
- `src/routes/users.ts` — list scoped to club; `/users/me` returns per-club roles
- `src/routes/archive.ts` — auth via super-admin key; loop all clubs, archive each; per-club cache invalidation
- `src/routes/riderhq.ts` — auth via super-admin key; BCC-scoped at code level (resolves the BCC club id once, scopes truncate-and-rebuild to it). Sunsetting; no design effort beyond keeping it working.
- `src/routes/generate.ts` — auth via super-admin key OR super-admin JWT; loop all clubs, generate each
- `src/routes/clubs.ts` — NEW

Public GET `/rides`: require `?club=<slug>` in strict mode, 400 if missing. In compat mode, defaults to `DEFAULT_CLUB_SLUG`.

### Cache (`src/lib/cache.ts`)

All keys gain clubId:

- `rides:${clubId}:list:${start}:${end}:${limit}:${offset}`
- `rides:${clubId}:detail:${rideId}`
- Pattern invalidation always `rides:${clubId}:*`, never global

### Club-management endpoints (UI out of scope; API in scope)

- `POST /clubs` — super-admin only
- `GET /clubs` — user's clubs (or all if super-admin)
- `GET /clubs/:slug`
- `PATCH /clubs/:slug` — per-club ADMIN
- `POST /clubs/:slug/members` — invite/add user
- `DELETE /clubs/:slug/members/:userId`
- `PATCH /clubs/:slug/members/:userId` — change per-club role
- `POST /clubs/:slug/api-keys` — mint cron keys (deferred; endpoint stub fine in phase 1)
- `DELETE /clubs/:slug/api-keys/:id` (deferred)

### API keys (cron auth)

For phase 1, keep the existing `API_KEY` env var as the single super-admin key for cron callers.

- `/archive` and `/generate`: auth → loop all clubs → process each.
- `/riderhq`: auth → BCC-only operation against env-configured RiderHQ credentials. Doesn't loop clubs.

`club_api_keys` table is provisioned in the schema but unused in phase 1. Designed for later: per-club hashed keys, format `Bearer cap_<clubSlug>_<random>`, parsed and looked up by slug. Defer issuance + middleware until a club requests scoped cron access.

### Backfill plan (three migrations)

1. Add nullable `clubId` everywhere + create new tables (`clubs`, `user_clubs`, `club_api_keys`) + add `users.isSuperAdmin`
2. Backfill: insert `clubs` BCC row, set clubId on all existing rides/repeating/archived/memberships, build `user_clubs` rows from current `users.role`, mark you as super-admin
3. Set `clubId` NOT NULL, drop `users.role` (same migration). Rollback via Supabase backup.

Generated via `bun run db:generate`. Apply via `bun run db:migrate`. Never `db:push`.

### Tests

- `src/test/fixtures.ts` — fixtures own a default club and seed `user_clubs`
- `src/test/auth.ts` — test users mint with per-club roles
- `src/routes/__tests__/authorization.test.ts` — add a "wrong-club-right-role" case per route (cross-tenant isolation)
- New `src/middleware/__tests__/club.test.ts` — header validation, membership enforcement, public-route fallback

### Docs (after phase 1 ships)

- `README.md` — multi-tenant overview, `X-Club-Id` header contract, `STRICT_TENANCY` / `DEFAULT_CLUB_SLUG` env vars, super-admin model, club management endpoints
- `AGENTS.md` — authorization matrix updated for per-club roles + super-admin; tenant routing notes; cron loop semantics; new conventions (every ride/repeating-ride/etc query must scope by clubId)
- `CLAUDE.md` — drop the `bcc_` prefix paragraph (no longer accurate after phase 0); add a "tenant scoping" gotcha alongside the existing soft-delete one
- `CHANGELOG.md` + changeset for both phases (major bump — breaking API contract)

---

## Phase 2: Auth swap (Auth0 → better-auth) — DEFERRED

Out of scope for this planning round. Phase 1 leaves Auth0 untouched.

When picked up later, this phase will cover: replacing `src/lib/auth0.ts` with better-auth server setup, swapping JWT verify in `src/middleware/auth.ts`, deciding bearer-vs-cookie transport, and choosing a user-migration strategy (lazy over N weeks vs single forced password reset). All decisions deferred.

---

## Other things to think about

- **Slug rules**: lowercase, dash-separated, 3-30 chars, must start with a letter. Reserved words (recommended starting set):
  - System/HTTP: `api`, `admin`, `www`, `health`, `clubs`, `static`, `assets`, `public`, `cdn`, `media`, `upload`, `download`
  - Auth: `auth`, `login`, `logout`, `signup`, `signin`, `register`, `oauth`, `callback`, `account`, `me`
  - App routes: `users`, `rides`, `repeating-rides`, `members`, `settings`, `profile`, `dashboard`
  - Operational: `status`, `metrics`, `ping`, `internal`, `debug`, `monitoring`
  - Marketing/docs: `about`, `contact`, `blog`, `home`, `help`, `support`, `docs`, `pricing`, `legal`, `terms`, `privacy`
  - Future-subdomain candidates: `mail`, `staging`, `dev`, `test`, `prod`
- **CORS allowlist**: today hardcoded 3 origins (`src/index.ts:25`). Multi-tenant → store per-club in `clubs.allowedOrigins`, build dynamically.
- **Per-club settings (jsonb on clubs)**: ride-limit defaults, winter time on/off, leader-can-self-assign, etc.
- **Rate limits**: shared API → per-club + per-user quotas.
- **GDPR/exports**: per-club data export endpoint, ADMIN-gated.
- **Backups**: shared DB, per-club restore is non-trivial. Document procedure or use logical exports.
- **Logging/observability**: tag every log with clubId. Hono logger middleware needs this.
- **New club onboarding flow**: super-admin creates club row + invites first ADMIN by email; user accepts invite, gains ADMIN row in `user_clubs`. (Phase 2 swap will tweak the signup leg of this.)
- **Club soft-delete**: blocked while users (or rides/repeating rides) remain. Detailed semantics — what counts as "remaining", who can override, cascade vs reassign — deferred until the situation actually arises.

---

## Verification

- `bun run check-types && bun run lint && bun test` (husky enforces)
- New integration test: two clubs coexist, club A list excludes club B's rides
- Cross-tenant isolation: authed user in club A spoofing `X-Club-Id: B` → 403
- Cache leak: invalidating club A doesn't drop club B's cached entries
- RiderHQ sync: only touches BCC's memberships; clubs without `riderhqGroupId` skipped silently
- Cron loop: `/archive` and `/generate` process all clubs on a single trigger
- Compat mode: with `STRICT_TENANCY` unset, missing header resolves to `DEFAULT_CLUB_SLUG` even when 2+ clubs exist
- Strict mode: with `STRICT_TENANCY=true`, missing header → 400
- Super-admin: `users.isSuperAdmin = true` reaches every club's resources without a `user_clubs` row
- Local exercise: `bun run dev` with two seed clubs, hit endpoints with both

---

## Files to touch

Phase 0:

- `src/db/schema/index.ts:6` — drop `bcc_` prefix factory
- `drizzle/00XX_drop_bcc_prefix.sql` — hand-edited rename migration
- `src/routes/archive.ts:71,76` — update raw SQL table names
- `src/db/pump.ts:45,56,64,82,91,102,113,124` — update raw SQL table names
- `src/middleware/__tests__/provisioning.test.ts:5` — comment touch-up

Phase 1:

- `src/db/schema/index.ts`
- `drizzle/00XX_*.sql` ×3 (add nullable, backfill, finalise)
- `src/middleware/auth.ts`
- `src/middleware/club.ts` — NEW
- `src/middleware/__tests__/club.test.ts` — NEW
- `src/routes/rides.ts`
- `src/routes/repeating-rides.ts`
- `src/routes/users.ts`
- `src/routes/archive.ts`
- `src/routes/riderhq.ts`
- `src/routes/generate.ts`
- `src/routes/clubs.ts` — NEW
- `src/lib/cache.ts`
- `src/index.ts` — wire club middleware, dynamic CORS
- `src/test/fixtures.ts`, `src/test/auth.ts`
- `src/routes/__tests__/authorization.test.ts`

Phase 2: deferred — file list pending.

---

## Unresolved questions

(none blocking phase 0/1 — proceed.)
