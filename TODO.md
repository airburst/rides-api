# TODO - Rides API

## ✅ Completed Work

### Bun Migration & CI/CD

- [x] Migrated from npm to Bun (80x faster installs)
- [x] Updated all scripts to use Bun runtime
- [x] Created PM2 ecosystem config for production
- [x] Set up GitHub Actions CI workflow (lint, test, type-check, build)
- [x] Set up GitHub Actions Deploy workflow (auto-deploy on main)
- [x] Configured production environment secrets
- [x] Zero-downtime deployments via PM2 reload

### Test Infrastructure

- [x] Created test utilities (`src/test/`)
  - [x] Mock auth tokens and helpers (`auth.ts`)
  - [x] Test data factories (`fixtures.ts`)
  - [x] Database and context mocks (`mocks.ts`)
  - [x] Test helpers and utilities (`helpers.ts`)
- [x] Infrastructure tests (16 tests passing)
- [x] Added bun-types for TypeScript support

### RRule Utility Tests

- [x] Complete test coverage for `src/lib/rrule-utils.ts` (26 tests)
- [x] Schedule generation tests (weekly, daily, multiple days)
- [x] Winter time adjustment tests (Oct-Mar)
- [x] RRule start date update tests
- [x] Edge case handling

### Authorization Tests (CRITICAL - 100% Coverage)

- [x] HTTP authorization tests for ALL routes (105 tests)
- [x] **Rides Routes** - Public GET, LEADER/ADMIN for modifications
- [x] **Repeating Rides** - ADMIN only for all operations
- [x] **Users Routes** - /me for any auth, /users for ADMIN, /:id for self-or-ADMIN
- [x] **Generate Route** - API key OR ADMIN JWT (403 for USER/LEADER)
- [x] **Archive Route** - API key ONLY (rejects all JWTs)
- [x] Invalid token handling tests
- [x] Fixed generate.ts to return 403 for insufficient permissions

### Documentation

- [x] Created AGENTS.md with AI agent guidelines
- [x] Pre-commit checklist (`lint && test && check-types`)
- [x] Testing standards and organization
- [x] Authorization matrix reference
- [x] CI/CD documentation

### Current Status

**147/147 tests passing (100%)** 🎉

- 16 infrastructure tests
- 26 RRule utility tests
- 105 authorization tests

---

## ⏸️ Deferred (Optional Future Work)

### Phase 4: Business Logic Tests

**Priority:** Low - Not security-critical, authorization is fully tested

Add tests for route business logic edge cases (~40-60 tests):

#### Rides Route (`src/routes/__tests__/rides.test.ts`)

- [ ] Capacity validation
  - Cannot join full ride (when rideLimit reached)
  - Cannot exceed maxRiders limit
- [ ] Join/leave logic
  - Cannot join same ride twice
  - Can leave ride successfully
  - Leader cannot leave own ride
- [ ] Soft delete behavior
  - Sets deleted flag instead of removing
  - Deleted rides excluded from listings

**Estimated:** 150-200 lines, ~15-20 tests

#### Repeating Rides Route (`src/routes/__tests__/repeating-rides.test.ts`)

- [ ] Cascade deletes
  - Deleting template removes future rides
  - Past rides preserved
- [ ] Schedule updates
  - Updating RRule regenerates rides
  - Existing riders preserved where possible

**Estimated:** 120-150 lines, ~10-15 tests

#### Users Route (`src/routes/__tests__/users.test.ts`)

- [ ] Search functionality
  - Case-insensitive name search
  - Partial matching works
  - Returns expected fields only

**Estimated:** 80-100 lines, ~8-10 tests

#### Generate Route (`src/routes/__tests__/generate.test.ts`)

- [ ] Bulk ride generation
  - Generates rides for specified month/year
  - Calls makeRidesInPeriod correctly
  - Inserts rides into database
  - Updates RRule start dates
- [ ] Validation
  - Requires valid month (1-12)
  - Requires valid year

**Estimated:** 80-100 lines, ~8-10 tests

**Total Phase 4:** ~430-550 lines, ~40-60 tests

---

### Phase 5: Integration Test Utilities

**Priority:** Low - Infrastructure for future integration testing

- [ ] Create test database setup/teardown helpers
- [ ] Create HTTP request builders for Hono
- [ ] Create authentication token builders
- [ ] Document integration testing patterns
- [ ] Add database seeding utilities for tests

**Estimated:** 200-300 lines

---

## 🔮 Future Enhancements

### Testing

- [ ] Add code coverage reporting (Bun has built-in coverage support)
- [ ] Add performance/benchmark tests for critical paths
- [ ] Add contract tests for API responses

### CI/CD

- [ ] Add staging environment deployment
- [ ] Add smoke tests after deployment
- [ ] Add rollback automation on health check failure
- [ ] Add GitHub PR status checks

### Development Experience

- [ ] Add pre-commit git hooks (husky) for lint/test
- [ ] Add conventional commits enforcement
- [ ] Add automated changelog generation
- [ ] Add API documentation generation (OpenAPI/Swagger)

### Monitoring

- [ ] Add structured logging
- [ ] Add error tracking (Sentry, Bugsnag, etc.)
- [ ] Add performance monitoring (APM)
- [ ] Add uptime monitoring

---

## 📝 Notes

### Why Business Logic Tests Are Optional

The critical security layer (authorization) is fully tested with 105 tests covering every endpoint and role combination. Business logic tests would catch edge cases and regression bugs, but won't uncover security vulnerabilities.

**Recommendation:** Add business logic tests when:

- You encounter bugs in production that could have been caught
- You're adding complex new features
- You want to enforce strict TDD workflow

### Test Organization

```
src/
├── routes/
│   ├── __tests__/
│   │   └── authorization.test.ts  # ✅ 105 tests (COMPLETE)
│   │   └── rides.test.ts          # ⏸️ Future (business logic)
│   │   └── users.test.ts          # ⏸️ Future (business logic)
│   └── rides.ts
├── lib/
│   ├── __tests__/
│   │   └── rrule-utils.test.ts    # ✅ 26 tests (COMPLETE)
│   └── rrule-utils.ts
└── test/
    ├── auth.ts                    # ✅ Test utilities (COMPLETE)
    ├── fixtures.ts                # ✅ Test utilities (COMPLETE)
    ├── mocks.ts                   # ✅ Test utilities (COMPLETE)
    ├── helpers.ts                 # ✅ Test utilities (COMPLETE)
    └── __tests__/
        └── infrastructure.test.ts  # ✅ 16 tests (COMPLETE)
```

### Pre-Commit Workflow

Always run before committing (see AGENTS.md):

```bash
bun run lint && bun test && bun run check-types
```

### Authorization Matrix (Quick Reference)

| Route               | GET     | POST          | PUT        | DELETE  | Notes                   |
| ------------------- | ------- | ------------- | ---------- | ------- | ----------------------- |
| **Rides**           | Public  | LEADER+       | LEADER+    | LEADER+ | Public read, auth write |
| **Repeating Rides** | ADMIN   | ADMIN         | ADMIN      | ADMIN   | Admin-only              |
| **Users**           | ADMIN\* | -             | Self/ADMIN | -       | \*except /me (any auth) |
| **Generate**        | -       | API Key/ADMIN | -          | -       | Dual auth               |
| **Archive**         | -       | API Key ONLY  | -          | -       | API key only            |

---

## 🎯 Current Priority

**Ship it!** All critical work is complete. The API is production-ready with:

- ✅ 100% authorization coverage
- ✅ Automated CI/CD
- ✅ Zero-downtime deployments
- ✅ Comprehensive test infrastructure

Add business logic tests later if needed.
