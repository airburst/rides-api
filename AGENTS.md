# AI Agent Guidelines for Rides API

This document provides guidelines for AI agents (and developers) working on this codebase.

## Pre-Commit Checklist ✅

**ALWAYS run these commands before committing:**

```bash
bun run lint          # Fix code style issues
bun test              # Run all tests
bun run check-types   # TypeScript type checking
```

All three must pass before pushing code. These checks are also enforced in CI.

### Quick Pre-Commit Command

```bash
bun run lint && bun test && bun run check-types && git add -A && git commit -m "your message" && git push
```

## Testing Standards

### Test Coverage Requirements

- **Authorization tests**: 100% coverage required (security-critical)
- **Utility functions**: 80%+ coverage recommended
- **Business logic**: Test critical paths and edge cases

### Test Organization

```
src/
├── routes/
│   ├── __tests__/
│   │   └── authorization.test.ts  # HTTP authorization tests
│   └── rides.ts
├── lib/
│   ├── __tests__/
│   │   └── rrule-utils.test.ts    # Utility tests
│   └── rrule-utils.ts
└── test/
    ├── auth.ts          # Auth mocking utilities
    ├── fixtures.ts      # Test data factories
    ├── mocks.ts         # Database mocks
    └── helpers.ts       # Test helpers
```

### Writing Tests

- Use Bun's built-in test runner (`import { describe, test, expect } from "bun:test"`)
- Mock external dependencies (Auth0, database)
- Focus on authorization first, then business logic
- Use descriptive test names that explain what's being tested

## Code Style

- **Logging**: Use `console.info()` for informational messages (not `console.log`)
- **Async operations**: Use `void` for intentionally floating promises
- **TypeScript**: Export types when needed by tests (e.g., `export type Role`)
- **Error handling**: Proper try-catch blocks with meaningful error messages

## CI/CD Pipeline

The project uses GitHub Actions for automated deployment:

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Runs on every push and PR
   - Steps: lint → test → type-check → build
   - Must pass before deploy

2. **Deploy Workflow** (`.github/workflows/deploy.yml`)
   - Triggered after CI success on `main` branch
   - Auto-deploys to production VPS
   - Uses PM2 for zero-downtime reload

### Environment Secrets

Production secrets are stored in GitHub Environment settings:

- `SSH_PRIVATE_KEY`
- `VPS_HOST`
- `VPS_USER`

## Database Migrations

- Use `bun run db:migrate` (not `db:push` - drizzle-kit has bugs with push)
- Always add `IF NOT EXISTS` to migration SQL
- Test migrations locally before pushing

## Bun-Specific Notes

- Bun runs TypeScript natively (no need for tsx/ts-node)
- Use `bun test` for testing (Jest-compatible)
- Install packages with `bun install` (80x faster than npm)
- Scripts use `bun --watch` for hot reload in development

## Project Structure

```
rides-api/
├── src/
│   ├── routes/          # API route handlers
│   ├── middleware/      # Auth middleware
│   ├── db/             # Database schema and connection
│   ├── lib/            # Utility functions
│   └── test/           # Test utilities
├── drizzle/            # Database migrations
├── bruno/              # API test collection
└── .github/workflows/  # CI/CD configuration
```

## Common Issues

### Test Files Not Linting

Test files are excluded from strict ESLint rules. See `eslint.config.js`:

```js
ignores: [
  "**/__tests__/**",
  "src/test/**",
  // ...
];
```

### Type Errors with `bun:test`

Make sure `bun-types` is installed and in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["bun-types"]
  }
}
```

### Mock Type Issues

Use `as any` for flexible mocks:

```typescript
findFirst: mock(() => Promise.resolve(null as any));
```

## Tenant scoping

The API is multi-tenant. Each request resolves to one club via `resolveClub` middleware:

- **Authed**: `X-Club-Id` header. Validated against `user_clubs` membership unless `users.is_super_admin`.
- **Public**: `?club=<slug>` query param.
- **Compat mode** (default, `STRICT_TENANCY` unset): missing identifier → falls back to `DEFAULT_CLUB_SLUG` env (default `bcc`). Strict mode (`STRICT_TENANCY=true`) → 400 on missing.

**Tenant-scoping is non-negotiable** for these tables: `rides`, `repeating_rides`, `archived_rides`, `memberships`. Every query must include `eq(table.clubId, c.get("club").id)`. Cache keys must include `clubId`. Use `clubCachePattern(clubId)` for invalidation; never `rides:*` global.

`/users/me` is the one route that doesn't require a club context — it returns the user record plus their `clubs` array (per-club roles).

## Authorization Matrix

Roles live on `user_clubs.role` (per-club: USER, LEADER, ADMIN). `users.is_super_admin: boolean` is the only global authority and bypasses all club checks.

**Critical Security Rules:**

- **Rides**: Public GET (?club= required), LEADER/ADMIN of the active club for modifications
- **Repeating Rides**: club ADMIN for all operations
- **Users**:
  - `GET /users/me` → any authenticated user (no club scope)
  - `GET /users` → club ADMIN; lists members of active club
  - `GET /users/:id` → self or club ADMIN; target must be in same club (super-admin bypasses)
  - `PATCH /users/:id` → self or club ADMIN; role updates write to `user_clubs.role` for active club
- **Clubs**:
  - `POST /clubs` → super-admin only
  - `GET /clubs` → user's clubs (or all if super-admin)
  - `GET /clubs/:slug` → member or super-admin
  - `PATCH /clubs/:slug`, `*/members`, `*/members/:userId` → club ADMIN or super-admin
- **Generate**: super-admin only (API key or super-admin JWT). Loops all clubs.
- **Archive**: API key ONLY. Operates globally on rides table (clubId carried through to archive).
- **RiderHQ**: API key ONLY. BCC-scoped at code level; sunsetting feature.

## Deployment

### Production Deployment

Automated via GitHub Actions:

1. Push to `main` branch
2. CI runs (lint, test, type-check, build)
3. If CI passes, deploy workflow triggers
4. SSH to VPS, pull code, install deps, migrate, build, reload PM2

### Manual Deployment (Emergency)

```bash
ssh ubuntu@143.47.251.53
cd ~/rides-api
git pull
bun install
bun run db:migrate
bun run build
pm2 reload ecosystem.config.cjs
```

## Questions?

For issues or questions:

- Check GitHub Actions logs for CI/CD failures
- Review test output for failing tests
- Check VPS logs: `pm2 logs rides-api`
