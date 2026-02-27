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
- **Before creating a PR**: bump the version in `package.json` using appropriate semver (patch for fixes, minor for features, major for breaking changes) and add a corresponding entry to `CHANGELOG.md` following the existing Keep a Changelog format.

## Architecture

Cycling club ride management API. Bun runtime, Hono framework, Drizzle ORM, PostgreSQL, optional Redis cache. Deployed to Oracle Cloud VPS via PM2.

### Request flow

```
Request → CORS → Logger → Auth middleware → Route handler → DB query → Response
                           ↓                                 ↓
                     JWT verify (jose)              Cache check/invalidate (Redis)
                     + accounts DB lookup
```

### Auth: two patterns

- **JWT auth** (`authMiddleware` / `optionalAuth`): verifies Auth0 JWT via JWKS, then looks up `accounts.providerAccountId` (Auth0 `sub`) joined to `users`. Both valid JWT AND a matching DB account row required — new Auth0 users without an account row get 401.
- **API key auth** (`archive`, `riderhq`): static Bearer token check against `API_KEY` env var. `generate` accepts either API key OR ADMIN JWT.

### Database conventions

- All tables prefixed `bcc_` via `pgTableCreator`. Raw SQL (e.g. `archive.ts`) hardcodes these prefixed names.
- `casing: "snake_case"` in Drizzle config — camelCase TS properties auto-map to snake_case columns.
- Single schema file: `src/db/schema/index.ts`.
- Rides use soft-delete (`deleted: boolean`). Every ride query must include `eq(rides.deleted, false)`.
- `rideLimit: -1` means unlimited (not `null`).

### Caching

- Gated by `CACHE_ENABLED === "true"` (exact string match).
- Cache invalidation calls use `void` (fire-and-forget, intentionally not awaited).
- Only ride list and detail GET endpoints are cached. Mutations invalidate via `cacheInvalidatePattern("rides:list:*")`.

## Key gotchas

- **Import extensions**: all imports use `.js` extensions despite being `.ts` files. Required for ESM + Bun's `moduleResolution: "bundler"`.
- **`console.log` is a lint error**. Use `console.info`, `console.warn`, or `console.error`.
- **`import type`** enforced by `consistent-type-imports` rule.
- **Unused vars**: prefix with `_` to suppress lint warning.
- **Test mocking order**: `mock.module()` must be called BEFORE importing routes. Authorization tests use dynamic `await import(...)` after mocks are set up.
- **Winter time**: repeating rides have a `winterStartTime` (HH:MM) that overrides start time Nov-Feb, applied in `rrule-utils.ts`.

## See also

`AGENTS.md` — authorization matrix, testing standards, deployment details, common issues.
