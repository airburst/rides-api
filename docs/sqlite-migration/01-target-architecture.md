# Target Architecture Proposal (SQLite)

Date: 2026-07-27
Status: Draft for approval

## Goal

Define a practical SQLite architecture that works now (single tenant, low risk) and scales to 100-1000 clubs.

Additional business constraints:

- Keep infrastructure cost low
- Do not accept performance regression
- Require benchmark proof before implementation/cutover

## Recommendation

Adopt a two-plane design with a shared SQLite data model first:

- Control plane: tenant registry + platform metadata
- Data plane: application domain data (rides, memberships, users)

Phase 1 uses a single shared SQLite file for both planes.
Phase 2 can split to per-tenant data files if load or isolation needs justify it.

## Why This Path

- Lowest implementation complexity now
- Preserves existing club-scoped authz model
- Avoids immediate redesign of all cross-tenant workflows
- Keeps future option open for per-tenant file partitioning
- Allows controlled A/B benchmarking of Postgres vs SQLite with minimal route churn

## Deployment Shapes

### Shape A (recommended now): Shared SQLite file

- One file (for example, data/app.db)
- Keep clubId in tenant-scoped tables
- Tenant isolation remains logical (app-level predicates + tests)
- Best for moderate write volume and fast iteration

### Shape B (future option): Control-plane + per-tenant DB files

- One control-plane DB (tenants/users/global config)
- One data DB per club
- Higher operational complexity (routing, migrations, backup fanout)
- Better hard isolation and easier tenant-level restore

## Table Ownership Map

### Control Plane (shared across all tenants)

| Table         | Plane   | Notes                                |
| ------------- | ------- | ------------------------------------ |
| clubs         | control | Tenant registry (slug/name/settings) |
| club_api_keys | control | API key metadata for automation      |
| users         | control | Global identity (recommended)        |
| accounts      | control | External provider mapping            |
| sessions      | control | better-auth session records          |
| verification  | control | Email verification/reset tokens      |
| user_clubs    | control | Membership and role map              |

### Data Plane (tenant-scoped domain data)

| Table                   | Plane | Keep clubId in Phase 1? | Notes                         |
| ----------------------- | ----- | ----------------------- | ----------------------------- |
| rides                   | data  | yes                     | Core ride records             |
| users_on_rides          | data  | indirectly via ride     | Join table                    |
| repeating_rides         | data  | yes                     | Templates for ride generation |
| archived_rides          | data  | yes                     | Historical ride storage       |
| archived_users_on_rides | data  | indirectly via ride     | Historical join table         |
| memberships             | data  | yes                     | RiderHQ sync artifacts        |

## Non-Negotiable Invariants

- Every tenant-scoped query must remain club-constrained in Phase 1
- Every write path must preserve club-scoped cache invalidation
- Foreign keys must be enabled on every SQLite connection (PRAGMA foreign_keys = ON)
- WAL mode must be enabled before evaluating production write behavior

## Suggested Runtime Topology

- Single API process (or one writer process per DB file in future split model)
- Redis remains optional for cache/rate limit
- Local SSD persistent volume for SQLite files
- Litestream configured after schema and workload stabilize

## Capacity Expectations (rule-of-thumb)

For 100-1000 clubs, shared SQLite is typically viable if:

- Writes are moderate (not heavy concurrent write spikes)
- Cron jobs are throttled/batched
- Proper indexes remain on clubId + date paths
- Busy-timeout/retry behavior is implemented

It becomes risky when many tenants write heavily at the same time.

Capacity assumptions are hypotheses, not guarantees. They must be validated by the benchmark gate in 04-benchmark-and-cost-gate.md.

## Guardrails to Add Early

- Tenant-tagged query latency metrics
- SQLITE_BUSY and lock wait counters
- Migration version tracking
- Per-club job scheduling and backpressure

## Performance and Cost Gate (Required)

No architecture decision is approved unless all of the following pass in benchmark runs:

- p50 and p95 endpoint latency: no regression vs baseline
- p99 endpoint latency: no more than 5% regression vs baseline
- query-level latency for top 5 hottest queries: no regression
- error rate and timeout rate: no regression
- infrastructure monthly cost estimate: lower than current baseline or within a pre-approved variance band

See 04-benchmark-and-cost-gate.md for detailed procedure.

## Architecture Decision Record (ADR) to Approve

Decision: Start with shared SQLite + keep clubId.
Revisit trigger: sustained lock contention, write latency SLO breach, or hard isolation requirement.
