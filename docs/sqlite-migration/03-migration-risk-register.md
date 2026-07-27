# SQLite Migration Risk Register

Date: 2026-07-27
Status: Draft for planning

Scales:

- Likelihood: Low / Medium / High
- Impact: Low / Medium / High
- Effort: S / M / L
- Blast radius: route/module scope affected

## Top Risks

| ID  | Risk                                                            | Likelihood | Impact | Effort | Blast Radius                  | Mitigation                                                       |
| --- | --------------------------------------------------------------- | ---------- | ------ | ------ | ----------------------------- | ---------------------------------------------------------------- |
| R1  | Hidden Postgres-specific SQL breaks at runtime                  | High       | High   | M      | Archive + utility scripts     | Inventory all raw SQL; rewrite to portable Drizzle/SQLite syntax |
| R2  | Drizzle schema type incompatibilities (pgEnum/jsonb/uuid)       | High       | High   | M      | DB schema + all routes        | Introduce sqlite-core schema variant and explicit type mapping   |
| R3  | Auth adapter mismatch (better-auth provider set to pg)          | High       | Medium | S      | Auth boot path                | Switch adapter provider and verify session/token flows           |
| R4  | Lock contention under concurrent writes (SQLITE_BUSY)           | Medium     | High   | M      | Write-heavy routes + jobs     | Enable WAL, busy timeout, retries, serialized job concurrency    |
| R5  | Loss of strict tenant isolation if club constraints regress     | Medium     | High   | M      | All tenant routes             | Keep clubId in phase 1; add regression tests for club scoping    |
| R6  | Migration toolchain not ready for multi-db future               | Medium     | Medium | M      | Deploy + operations           | Build version tracking and per-target migration runner           |
| R7  | Search behavior differences (ilike/collation) alter API results | Medium     | Medium | S      | users search endpoints        | Normalize search terms; validate with parity tests               |
| R8  | Date/time semantics drift (timezone, string ordering)           | Medium     | Medium | M      | rides/repeating/archive       | Standardize ISO UTC storage and comparisons                      |
| R9  | Backup/restore process incomplete before prod cutover           | Medium     | High   | M      | Ops + incident response       | Define RPO/RTO; stage Litestream; run restore drills             |
| R10 | Cross-tenant jobs overload shared DB file                       | Medium     | Medium | M      | generate/archive/riderhq      | Per-club batching, bounded concurrency, backpressure             |
| R11 | Observability gaps hide tenant hotspots                         | Medium     | Medium | S      | Runtime monitoring            | Add tenant-tagged logs/metrics/lock counters                     |
| R12 | Deployment/runtime mismatch for SQLite file persistence         | Medium     | High   | M      | Infrastructure                | Ensure persistent local volume and startup file checks           |
| R13 | API latency regression despite lower DB overhead assumptions    | Medium     | High   | M      | Critical read/write endpoints | Enforce no-regression benchmark gate with p50/p95/p99 thresholds |
| R14 | Cost reduction does not materialize after migration             | Medium     | Medium | S      | Infrastructure + operations   | Baseline and compare full monthly TCO before go-live             |

## Re-scored for Current Reality (single tenant today)

Current production risk is lower than a mature multi-tenant deployment because:

- Only BathCC is active
- better-auth not in production tenant use
- Breaking schema/runtime changes are acceptable now

This lowers immediate blast radius, but does not remove architectural risk for 100-1000 club targets.

## Sequenced Mitigation Plan

1. Pre-migration hardening
   - Add tenant-scoping regression tests
   - Add baseline latency/error metrics
2. Engine migration in place (shared SQLite)
   - Switch dialect/client/schema types
   - Replace Postgres-only SQL/functions
3. Reliability hardening
   - WAL, busy timeout, lock retries
   - Background job throttling
4. Backup maturity
   - Litestream config + restore drill
5. Scale gate review
   - Decide if per-tenant DB split is needed

## Go/No-Go Criteria

Go when all are true:

- Lint/test/typecheck pass
- Tenant-scoping tests pass
- Archive/generate parity tests pass
- No unresolved SQLITE_BUSY spikes in load test
- Restore drill succeeds within defined RTO
- Benchmark gate passes (see 04-benchmark-and-cost-gate.md)
- Forecast monthly TCO is lower than current baseline (or explicitly approved)

No-Go if any of the above fail.
