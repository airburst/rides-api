# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev             # hot-reload dev server
bun run build           # tsc compile to dist/
bun run start           # run compiled output
bun test                # run all tests
bun test src/routes/__tests__/authorization.test.ts  # run single test file
bun run lint            # eslint --fix
bun run check-types     # tsc --noEmit
bun run db:generate     # create migration from schema changes
bun run db:migrate      # apply migrations (NEVER use db:push - has bugs)
```

Pre-commit hook (husky): `bun run lint && bun run check-types && bun test`

## Commits and PRs

- **Before committing**: run `bun run lint && bun run check-types && bun test` (enforced by husky pre-commit hook).
- **Before creating a PR**: add a changeset via `bun run changeset` (patch for fixes, minor for features, major for breaking changes).
- **Versioning**: `bun run version` consumes changesets, bumps `package.json` version, and updates `CHANGELOG.md`.

## Architecture

Cycling club ride management API. Bun runtime, Hono framework, Drizzle ORM, PostgreSQL, optional Redis cache. Deployed to Oracle Cloud VPS via PM2.

### Request flow

```
Request → CORS → Logger → optionalAuth/authMiddleware → resolveClub → Route handler → DB query → Response
                           ↓                              ↓                         ↓
                     JWT verify (jose)          X-Club-Id / ?club=         Cache (Redis, club-scoped)
                     + accounts DB lookup        + user_clubs membership
```

### Multi-tenancy

- Every request is scoped to a club. Authed clients send `X-Club-Id` header; public routes accept `?club=<slug>`.
- `resolveClub` middleware validates membership via `user_clubs`; super-admins (`users.is_super_admin`) bypass.
- Compat-mode (default): missing identifier → `DEFAULT_CLUB_SLUG` env (default `bcc`). `STRICT_TENANCY=true` flips to hard 400.
- Per-club role lives on `user_clubs.role` (USER/LEADER/ADMIN). `users.role` no longer exists.
- Use `requireClubRole(...)` (not `requireRole`) for role gates. Super-admin satisfies any gate.

### Auth: two patterns

- **JWT auth** (`authMiddleware` / `optionalAuth`): verifies Auth0 JWT via JWKS, then looks up `accounts.providerAccountId` (Auth0 `sub`) joined to `users`. JIT provisions on first request.
- **API key auth** (`archive`, `riderhq`, `generate`): static Bearer token check against `API_KEY` env var (the super-admin key for cron). `generate` also accepts a super-admin JWT.

### Database conventions

- Plain table names (no prefix). Raw SQL (e.g. `archive.ts`) hardcodes these names — keep in sync with schema.
- `casing: "snake_case"` in Drizzle config — camelCase TS properties auto-map to snake_case columns.
- Single schema file: `src/db/schema/index.ts`.
- **Tenant scoping**: every query against rides/repeating_rides/archived_rides/memberships MUST include `eq(table.clubId, c.get("club").id)`. Forgetting this is a cross-tenant data leak.
- Rides use soft-delete (`deleted: boolean`). Every ride query must include `eq(rides.deleted, false)` alongside the clubId predicate.
- `rideLimit: -1` means unlimited (not `null`).

### Caching

- Gated by `CACHE_ENABLED === "true"` (exact string match).
- Cache invalidation calls use `void` (fire-and-forget, intentionally not awaited).
- Only ride list and detail GET endpoints are cached. Cache keys carry clubId: `rides:${clubId}:list:*`, `rides:${clubId}:detail:*`. Use `clubCachePattern(clubId)` for per-club bulk invalidation; never use a global `rides:*` pattern.

## Key gotchas

- **Import extensions**: all imports use `.js` extensions despite being `.ts` files. Required for ESM + Bun's `moduleResolution: "bundler"`.
- **`console.log` is a lint error**. Use `console.info`, `console.warn`, or `console.error`.
- **`import type`** enforced by `consistent-type-imports` rule.
- **Unused vars**: prefix with `_` to suppress lint warning.
- **Test mocking order**: `mock.module()` must be called BEFORE importing routes. Authorization tests use dynamic `await import(...)` after mocks are set up.
- **Winter time**: repeating rides have a `winterStartTime` (HH:MM) that overrides start time Nov-Feb, applied in `rrule-utils.ts`.

## See also

`AGENTS.md` — authorization matrix, testing standards, deployment details, common issues.
