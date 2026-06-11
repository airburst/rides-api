# Change Log

## 2.3.6

### Patch Changes

- Add user_clubs entry for Auth0 signups

## 2.3.5

### Patch Changes

- Refactor CORS and Better Auth trusted origins to use a shared origin policy helper.

  Add wildcard support for subdomains under `*.clubrides.app` while keeping existing Vercel preview and localhost opt-in behavior intact.

## 2.3.4

### Patch Changes

- 4084268: Add rate limiting and brute-force protection for better-auth email/password endpoints. Configures Redis-backed rate limiting at 5 attempts/minute for sign-in and 3 attempts/minute for sign-up. Includes failed login tracking with account lockout support. Auth0 JWT pathway remains unchanged.

## 2.3.3

### Patch Changes

- Add indexes to optimise slow queries
- 2398ab0: Add indexes on high-traffic query paths
  - `user_clubs(user_id)`: Auth lookup optimization (5,632 calls, 6.5x faster expected)
  - `rides(ride_date)`: Ride list filtering (2,817 calls, 5x faster expected)
  - `users_on_rides(ride_id)`: Ride detail lateral joins (covered by above)

  Based on Supabase slow query profiling. Uses `CREATE INDEX CONCURRENTLY` to avoid table locks.

## 2.3.2

### Patch Changes

- Support localhost app through flag

## 2.3.1

### Patch Changes

- Add routes for password reset and change callback for verified email

## 2.3.0

### Minor Changes

- Add resend email verification on signup

## 2.2.0

### Minor Changes

- New auth system

## 2.1.1

### Patch Changes

- Make `/generate` idempotent so rides are never duplicated. Generation previously inserted every computed occurrence with no existence check (the only guard was mutating the template's DTSTART, which was fragile and corrupted the template start date), so re-running the cron could create duplicate rides. Generation now skips any occurrence that already exists for the same `(scheduleId, rideDate)` — including soft-deleted ones, so a deliberately-removed ride is never resurrected — within a transaction, and the DTSTART-mutation hack is removed. The generation window also extends through the end of next month (matching the client) so templates created late in a month still produce rides; with idempotency, the cron's overlapping window is harmless. A reviewed cleanup script for pre-existing duplicates is provided in `scripts/dedupe-generated-rides.sql`.

## 2.1.0

### Minor Changes

- Add dev-only superadmin bypass for testing

## 2.0.0

### Major Changes

- 53655f2: Multi-tenant API. **Breaking** — every authed request now requires `X-Club-Id` (header) or `?club=<slug>` (query), validated against `user_clubs` membership. Compat-mode default (`STRICT_TENANCY` unset) falls back to `DEFAULT_CLUB_SLUG` (default `bcc`) so the legacy frontend keeps working until it's updated; flip `STRICT_TENANCY=true` for hard 400s on missing club.
  - Per-club roles via `user_clubs.role`; `users.role` removed.
  - Global `users.is_super_admin` bypasses all club checks.
  - New `/clubs` management endpoints (CRUD, members, role updates).
  - `/generate` now requires super-admin (was ADMIN); loops all clubs.
  - `/riderhq` BCC-scoped at code level (sunsetting feature; env vars only).
  - `/archive` operates globally as before; archived rows preserve clubId.
  - Cache keys gain clubId prefix: `rides:${clubId}:list:*`, `rides:${clubId}:detail:*`.
  - `/users/me` payload gains `clubs` array (per-club role memberships); legacy `role` field removed from user records.

  Migration path for production: run `bun run db:migrate` (applies 0010–0013 in order). After deploy, set yourself as super-admin: `UPDATE users SET is_super_admin = true WHERE email = 'you@example.com';`. Frontend update can land any time before flipping `STRICT_TENANCY=true`.

### Minor Changes

- 76c7fdb: Multi-tenancy schema (additive). New tables `clubs`, `user_clubs`, `club_api_keys`. Nullable `club_id` columns on rides/repeating_rides/archived_rides/memberships. New `users.is_super_admin` boolean. BCC seeded as default club; existing data backfilled to it. `users.role` retained for now (dropped in finalize migration once code paths switch to `user_clubs.role`).

### Patch Changes

- 4266672: Drop `bcc_` table prefix. Tables renamed via ALTER TABLE; `membership` → `memberships` plural at the same time. No behaviour change. FK constraints and indexes renamed to match. Prep work for multi-tenancy.

## 1.6.4

### Patch Changes

- d34df8c: Update dependencies

## 1.6.3

### Patch Changes

- d176f63: Update Hono and dependencies

## 1.6.2

### Patch Changes

- Update dependencies

## 1.6.1

### Patch Changes

- Empty a user name on creation, and add tests

## 1.6.0

### Minor Changes

- JIT user provisioning: auto-create bcc_users + bcc_accounts on first login for new Auth0 users via /userinfo endpoint. Add changesets for versioning workflow.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## 1.5.1 - 2026-02-20

### Updates

- Bumped minor dependencies

## 1.5.0 - 2026-02-20

### Added

- GitHub Actions cron workflow: generate repeating rides (1st of month, 02:00 UTC)
- GitHub Actions cron workflow: archive past rides (1st of month, 02:05 UTC)
- Both workflows support manual trigger via `workflow_dispatch`

## 1.4.0 - 2026-02-20

### Added

- Husky pre-commit hook enforcing `lint`, `check-types`, and `test`
- `CLAUDE.md` with architecture overview, commands, and commit/PR workflow

### Dependencies

- Added `husky@9.1.7` for git hooks

## 1.3.0 - 2026-02-20

### Added

- Graceful shutdown: SIGTERM/SIGINT handlers drain HTTP server, Redis, and DB pool
- Database index on `bcc_accounts.provider_account_id` for faster auth middleware lookups
- Composite database index on `bcc_rides (schedule_id, ride_date)` for cascade-delete queries

### Changed

- Explicit DB connection pool options: `max: 10`, `idle_timeout: 20s`, `max_lifetime: 1800s`
- Exported postgres client (`sqlClient`) from `src/db/index.ts` for shutdown access

### Migrations

- `0007_uneven_blur.sql`: creates the two new indexes

## 1.1.0 - 2026-02-14

### Added

- Avatar upload endpoint `POST /users/:id/avatar`
  - Accepts multipart/form-data with image files (PNG, JPG, GIF, WebP)
  - 4MB file size limit with validation
  - Automatic image processing using Sharp library
  - Generates two WebP versions: 40x40px thumbnail and 240x240px standard
  - Stores files in `public/avatars/` directory
  - Authorization: users can update own avatar, admins can update any
- Static file serving for `/avatars/*` route
- Database schema: added `imageLarge` column to `bcc_users` table
- Database migration: `0006_wandering_quentin_quire.sql`

### Dependencies

- Added `sharp@0.34.5` for image processing

### Technical Notes

- Avatar files named as: `{userId}-thumb.webp` (40px) and `{userId}.webp` (120px)
- Database stores relative paths: `/avatars/{userId}-thumb.webp` and `/avatars/{userId}.webp`
- Backwards compatible with existing Gravatar and Auth0 avatar URLs
