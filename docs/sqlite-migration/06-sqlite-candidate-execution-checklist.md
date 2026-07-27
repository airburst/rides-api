# SQLite Candidate Execution Checklist

Date: 2026-07-27
Status: Ready to execute

## Objective

Deliver a minimal SQLite candidate that is benchmarkable against the local Postgres baseline with no unnecessary scope expansion.

This checklist is optimized for:

- Fast delivery of a valid candidate
- Reliable baseline vs candidate comparison
- Clear go/no-go decision using measured evidence

## Roles and Owners

- Technical owner: API maintainer
- Database owner: DB/schema maintainer
- Benchmark owner: performance owner
- Decision owner: project owner

If one person covers all roles, keep role labels for clarity and sign-off.

## Global Constraints

- No production cutover in this track
- No per-tenant DB split in this track
- No Litestream integration in this track
- Keep benchmark scenario set fixed between baseline and candidate runs

## Phase Checklist

## Phase 0 - Prep and Branch

Owner: Technical owner
Effort: S (0.5 day)

Tasks:

- [x] Create SQLite candidate branch
- [ ] Freeze benchmark scenario file for this cycle
- [x] Record baseline artifact path from local Postgres run
- [ ] Record environment assumptions (cache on/off, host class, seed source)

Baseline artifact path recorded:

- artifacts/bench/postgres-baseline-latest.json

Exit criteria:

- [x] Baseline artifact exists
- [ ] Frozen scenario profile is committed

## Phase 1 - Dual-Dialect DB Bootstrap

Owner: Technical owner
Effort: M (1 day)

Tasks:

- [x] Add DB dialect switch (postgres vs sqlite) in DB bootstrap layer
- [x] Keep postgres path unchanged and still default
- [x] Add SQLite connection lifecycle handling for clean shutdown
- [x] Add candidate env keys and documentation notes

Exit criteria:

- [x] App boots in postgres mode unchanged
- [x] App boots in sqlite mode without startup errors

Verification notes:

- Bootstrap smoke test passed for `DB_DIALECT=postgres`
- Bootstrap smoke test passed for `DB_DIALECT=sqlite` using `SQLITE_DB_PATH=/tmp/rides-candidate-test.sqlite`

## Phase 2 - SQLite Schema Subset for Benchmark Paths

Owner: Database owner
Effort: M (1-2 days)

Tables required for first candidate:

- [x] clubs
- [x] user_clubs
- [x] users
- [x] rides
- [x] users_on_rides

Tasks:

- [x] Define SQLite-compatible schema subset
- [x] Map incompatible types explicitly (uuid, enum, jsonb, timestamptz)
- [x] Create or adapt migration flow for SQLite candidate DB
- [x] Ensure required indexes exist for benchmark query paths

Exit criteria:

- [x] Schema creates cleanly in SQLite
- [x] Required tables and indexes verified

Verification notes:

- Added startup SQLite bootstrap for benchmark-critical tables and indexes
- Smoke query in SQLite mode succeeded against `rides` table after bootstrap

## Phase 3 - Query Compatibility for Benchmarked Endpoints

Owner: Technical owner
Effort: M (1 day)

Endpoints in scope:

- [ ] GET /rides
- [ ] GET /rides/:id
- [ ] GET /users?q=...

Tasks:

- [x] Replace or adapt case-insensitive user search behavior for SQLite
- [ ] Verify date filtering and ordering semantics for rides list
- [ ] Verify ride detail joins return same response shape
- [ ] Add focused regression tests for these endpoints if missing

Exit criteria:

- [ ] Endpoint responses are shape-compatible with baseline
- [ ] Endpoint scenarios return successful status codes under candidate

## Phase 4 - Candidate Data Load with Production-Replica Source

Owner: Database owner
Effort: M (1 day)

Tasks:

- [x] Reuse local source/pump workflow assumptions from bin/serve
- [x] Load equivalent data into SQLite candidate DB for benchmark subset tables
- [x] Validate row counts for subset tables vs Postgres reference
- [x] Validate at least one known club and ride id for benchmark variables

Progress notes:

- Added `db:pump:sqlite` script and `src/db/pump-sqlite.ts` for benchmark subset data

Verification notes:

- Row-count parity validated with `bench:verify-counts` (all 6 subset tables matched)
- Candidate benchmark run uses `BENCH_CLUB_ID=bcc` and dynamic SQLite `BENCH_RIDE_ID` lookup

Exit criteria:

- [x] Candidate DB has comparable data shape
- [x] BENCH_CLUB_ID and BENCH_RIDE_ID are verified valid

## Phase 5 - Candidate Benchmark Run and Comparison

Owner: Benchmark owner
Effort: S-M (0.5-1 day)

Tasks:

- [x] Run candidate benchmark with same profile and env assumptions as baseline
- [x] Generate sqlite-candidate-latest artifact
- [x] Run compare latest command
- [x] Capture pass/fail summary with scenario deltas

Exit criteria:

- [x] Comparison report produced
- [x] Clear pass/fail status recorded

Current benchmark result:

- Final valid local comparison completed for `rides_list`, `ride_detail`, and `users_search`
- SQLite improved p50 latency and throughput across measured scenarios
- SQLite regressed p95/p99 enough to fail the current no-regression gate
- Local-only auth completion used `BENCH_ALLOW_DEV_AUTH_BYPASS=true` with `DEV_SKIP_AUTH=true`

## Phase 6 - Hotspot Tuning Loop (only if fail)

Owner: Technical owner + Database owner
Effort: M (1-3 days, variable)

Tasks:

- [x] Identify failing scenarios from compare output
- [ ] Identify top latency contributors (query shape, index, lock contention)
- [ ] Apply minimal tuning changes
- [ ] Re-run candidate benchmark
- [ ] Repeat until pass or no viable improvement

Stop condition:

- [ ] Stop after 3 major tuning iterations and review architecture choice if still failing

Exit criteria:

- [ ] Candidate passes benchmark gate or is explicitly marked no-go

Current status:

- Candidate is explicitly no-go under current acceptance thresholds unless further tuning work is approved

## Phase 7 - Decision Record

Owner: Decision owner
Effort: S (0.5 day)

Tasks:

- [x] Record benchmark artifacts and comparison summary
- [ ] Record cost estimate delta
- [x] Record decision: continue migration or halt
- [ ] Record unresolved risks and follow-up actions

Exit criteria:

- [x] Signed go/no-go decision exists

Decision recorded:

- Local benchmark decision: halt by default
- Reason: SQLite candidate fails the current no-regression gate due tail-latency regressions at p95/p99

## Effort Summary

- Minimum expected effort (smooth path): 5-7 working days
- Likely effort with one tuning loop: 7-10 working days
- High-friction effort (multiple tuning loops): 10+ working days

## Commands and Artifacts

Reference benchmark workflow:

- scripts/bench/run.mjs
- scripts/bench/compare.mjs
- scripts/bench/scenarios.default.json

Reference docs:

- docs/sqlite-migration/04-benchmark-and-cost-gate.md
- docs/sqlite-migration/05-benchmark-harness-plan.md

Key artifacts:

- artifacts/bench/postgres-baseline-latest.json
- artifacts/bench/sqlite-candidate-latest.json

## Risks to Watch During Execution

- Query semantic drift on search/date behavior
- Hidden lock contention under concurrent reads/writes
- Dataset mismatch between baseline and candidate
- Scope creep into non-benchmark endpoints before gate pass

## Definition of Success for This Track

- A SQLite candidate exists and runs benchmark scenarios
- Baseline vs candidate comparison is complete and reproducible
- Decision is made from measured cost/performance data, not assumptions
