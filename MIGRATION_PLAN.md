# Database Migration Plan: Slow Query Optimization

## Overview

This migration adds missing indexes on high-traffic query paths identified in Supabase slow query analysis. **Total expected improvement: 60% reduction in slow query total time** (from ~15s to ~6s per monitoring window).

## Index Changes

### Tier 1 — High Impact, Low Risk (Execute First)

#### 1. User Clubs Lookup Optimization

**Query**: `SELECT club_id, role FROM user_clubs WHERE user_id = $1` (5,632 calls)
**Current**: 0.32ms mean, 1,834ms total time
**After**: ~0.05ms mean, ~280ms total (6.5x improvement)

```sql
-- Recommended by Supabase index advisor
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_clubs_user_id_idx
ON user_clubs(user_id);
```

**Rationale**: Auth lookup on every request; filters on `user_id` in multi-tenant system; call volume justifies index.

---

#### 2. Rides List Query Optimization

**Query**: Lateral join fetch with filtering on `ride_date` (2,817 calls)
**Current**: 1.61ms mean, 4,533ms total
**After**: ~0.3ms mean, ~850ms total (5.3x improvement)

```sql
-- Filter on ride_date (range queries common)
CREATE INDEX CONCURRENTLY IF NOT EXISTS rides_ride_date_idx
ON rides(ride_date);

-- Lateral join lookup on users_on_rides
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_on_rides_ride_id_idx
ON users_on_rides(ride_id);
```

**Rationale**: Query filters calendar date range; high call volume; lateral join scans all ride participants.

---

#### 3. Rides Detail Query Optimization

**Query**: Single ride detail with participants (4,989 calls)
**Current**: 0.49ms mean, 2,471ms total
**After**: Covered by rides_list indexes (shared)

```sql
-- Shares index with rides list query
-- users_on_rides_ride_id_idx covers this lookup
```

---

### Tier 2 — Conditional (After Profiling accounts_query)

#### 4. Accounts Query Index

**Query**: `SELECT * FROM accounts WHERE provider_account_id = $1` (13,907 calls)
**Current**: 0.34ms mean, 4,748ms total
**Status**: Pending profiling (see PROFILE_ACCOUNTS_QUERY.md)

```sql
-- To be confirmed after EXPLAIN ANALYZE profiling
-- If I/O-bound (Seq Scan detected):
CREATE INDEX CONCURRENTLY IF NOT EXISTS accounts_provider_account_id_idx
ON accounts(provider_account_id);
```

**Decision point**: Only add if EXPLAIN shows Seq Scan; otherwise CPU-bound (JSON building) and needs query restructuring.

---

## Migration Execution

### Pre-Migration

```bash
# 1. Backup current slow query stats
psql -d $DATABASE_URL -c "
  COPY (
    SELECT query, mean_exec_time, calls, total_exec_time
    FROM pg_stat_statements
    ORDER BY total_exec_time DESC
    LIMIT 20
  ) TO '/tmp/slow_queries_before.csv' CSV HEADER;
"

# 2. Create baseline measurement
psql -d $DATABASE_URL -c "SELECT pg_stat_statements_reset();"
```

### Migration (Drizzle + SQL)

Create migration file `src/db/migrations/add_indexes_slow_queries.ts`:

```typescript
import type { SQL } from "drizzle-orm";

export async function up(db: any): Promise<void> {
  // All indexes use CONCURRENTLY to avoid table locks

  // Tier 1: Auth path (user_clubs lookup)
  await db.execute(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_clubs_user_id_idx
     ON user_clubs(user_id)`,
  );

  // Tier 1: Rides list path (ride filtering + participant lookup)
  await db.execute(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS rides_ride_date_idx
     ON rides(ride_date)`,
  );

  await db.execute(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS users_on_rides_ride_id_idx
     ON users_on_rides(ride_id)`,
  );

  // Tier 2: Accounts (conditional - only if profiling confirms I/O-bound)
  // await db.execute(
  //   `CREATE INDEX CONCURRENTLY IF NOT EXISTS accounts_provider_account_id_idx
  //    ON accounts(provider_account_id)`
  // );
}

export async function down(db: any): Promise<void> {
  await db.execute(`DROP INDEX CONCURRENTLY IF EXISTS user_clubs_user_id_idx`);
  await db.execute(`DROP INDEX CONCURRENTLY IF EXISTS rides_ride_date_idx`);
  await db.execute(
    `DROP INDEX CONCURRENTLY IF EXISTS users_on_rides_ride_id_idx`,
  );
  // await db.execute(`DROP INDEX CONCURRENTLY IF EXISTS accounts_provider_account_id_idx`);
}
```

Alternatively, use raw SQL migration in `drizzle/` directory:

```sql
-- migration: add_slow_query_indexes
-- timestamp: 2026-06-06T00:00:00Z

CREATE INDEX CONCURRENTLY IF NOT EXISTS user_clubs_user_id_idx
ON user_clubs(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS rides_ride_date_idx
ON rides(ride_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS users_on_rides_ride_id_idx
ON users_on_rides(ride_id);

-- Accounts index deferred pending profiling
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS accounts_provider_account_id_idx
-- ON accounts(provider_account_id);
```

### Execution

```bash
# 1. Generate migration if using schema-driven approach
bun run db:generate

# 2. Test locally
DATABASE_URL="postgresql://...localhost..." bun run db:migrate

# 3. Verify indexes were created
bun run db:migrate -- --verbose

# 4. Push to staging
git push origin migration/slow-query-indexes

# 5. After PR approval, deploy to production
# (GitHub Actions will run: bun run db:migrate)

# 6. Monitor in production
# - Check /metrics endpoint for query latency drop
# - Verify cache hit rates stable
# - Confirm no index bloat in 24h
```

---

## Post-Migration Verification

### Immediate (After Migration Completes)

```bash
# Verify indexes exist in production
psql -d $SUPABASE_DATABASE_URL -c "
  SELECT
    schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
  FROM pg_stat_user_indexes
  WHERE indexname IN (
    'user_clubs_user_id_idx',
    'rides_ride_date_idx',
    'users_on_rides_ride_id_idx'
  )
  ORDER BY idx_scan DESC;
"
```

Expected: `idx_scan > 0` for all three within 1 hour.

### 24-Hour Review

```sql
-- Compare slow query stats before/after
SELECT
  query,
  mean_exec_time,
  calls,
  total_exec_time,
  ROUND(100.0 * (old.total_exec_time - new.total_exec_time) / old.total_exec_time) as improvement_pct
FROM slow_queries_before old
JOIN (
  SELECT query, mean_exec_time, calls, total_exec_time
  FROM pg_stat_statements
) new USING (query);
```

**Success criteria**:

- ✅ `user_clubs` lookup: 0.32ms → < 0.05ms (6x faster)
- ✅ `rides` list: 1.61ms → < 0.3ms (5x faster)
- ✅ `rides` detail: no change (already cached)
- ✅ Overall database CPU drop ~10-15%

---

## Rollback Plan

```bash
# If indexes cause issues (unlikely):
psql -d $SUPABASE_DATABASE_URL -c "
  DROP INDEX CONCURRENTLY user_clubs_user_id_idx;
  DROP INDEX CONCURRENTLY rides_ride_date_idx;
  DROP INDEX CONCURRENTLY users_on_rides_ride_id_idx;
"

# Or via migration rollback:
bun run db:migrate --revert  # Uses 'down' function
```

---

## Timeline

| Phase                                | Owner             | Duration  | Blocker              |
| ------------------------------------ | ----------------- | --------- | -------------------- |
| **Step 1**: Profile accounts query   | You (Supabase UI) | 30 min    | None                 |
| **Step 2**: Create migration PR      | Claude            | 15 min    | Profiling results    |
| **Step 3**: PR review + test staging | Team              | 1-2 hours | CI/CD pass           |
| **Step 4**: Deploy to production     | GitHub Actions    | 5-10 min  | PR merge             |
| **Step 5**: 24h monitoring           | Oncall            | 24 hours  | Query latency stable |

---

## Risks & Mitigation

| Risk                            | Impact         | Mitigation                                                 |
| ------------------------------- | -------------- | ---------------------------------------------------------- |
| Index bloat over time           | Storage growth | Run `REINDEX` monthly; monitor with `pg_stat_user_indexes` |
| Index creation locks table      | Brief downtime | Using `CONCURRENTLY` flag; Supabase will queue if needed   |
| Index on low-cardinality column | Unused index   | Profiling + EXPLAIN validates selectivity before adding    |
| Cache invalidation issues       | Stale data     | No schema changes here; caching layers unaffected          |

---

## Next Steps

1. **Now**: Run profiling steps from `PROFILE_ACCOUNTS_QUERY.md` → share EXPLAIN output
2. **After profiling**: Uncomment/add accounts index if I/O-bound
3. **Create PR**: Submit migration with this plan in commit message
4. **Test locally**: `bin/serve` + `bun run db:migrate` before pushing
5. **Deploy**: Merge to main; GitHub Actions auto-runs migration on production
