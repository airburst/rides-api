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

- [ ] Create SQLite candidate branch
- [ ] Freeze benchmark scenario file for this cycle
- [ ] Record baseline artifact path from local Postgres run
- [ ] Record environment assumptions (cache on/off, host class, seed source)

Exit criteria:

- [ ] Baseline artifact exists
- [ ] Frozen scenario profile is committed

## Phase 1 - Dual-Dialect DB Bootstrap

Owner: Technical owner
Effort: M (1 day)

Tasks:

- [ ] Add DB dialect switch (postgres vs sqlite) in DB bootstrap layer
- [ ] Keep postgres path unchanged and still default
- [ ] Add SQLite connection lifecycle handling for clean shutdown
- [ ] Add candidate env keys and documentation notes

Exit criteria:

- [ ] App boots in postgres mode unchanged
- [ ] App boots in sqlite mode without startup errors

## Phase 2 - SQLite Schema Subset for Benchmark Paths

Owner: Database owner
Effort: M (1-2 days)

Tables required for first candidate:

- [ ] clubs
- [ ] user_clubs
- [ ] users
- [ ] rides
- [ ] users_on_rides

Tasks:

- [ ] Define SQLite-compatible schema subset
- [ ] Map incompatible types explicitly (uuid, enum, jsonb, timestamptz)
- [ ] Create or adapt migration flow for SQLite candidate DB
- [ ] Ensure required indexes exist for benchmark query paths

Exit criteria:

- [ ] Schema creates cleanly in SQLite
- [ ] Required tables and indexes verified

## Phase 3 - Query Compatibility for Benchmarked Endpoints

Owner: Technical owner
Effort: M (1 day)

Endpoints in scope:

- [ ] GET /rides
- [ ] GET /rides/:id
- [ ] GET /users?q=...

Tasks:

- [ ] Replace or adapt case-insensitive user search behavior for SQLite
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

- [ ] Reuse local source/pump workflow assumptions from bin/serve
- [ ] Load equivalent data into SQLite candidate DB for benchmark subset tables
- [ ] Validate row counts for subset tables vs Postgres reference
- [ ] Validate at least one known club and ride id for benchmark variables

Exit criteria:

- [ ] Candidate DB has comparable data shape
- [ ] BENCH_CLUB_ID and BENCH_RIDE_ID are verified valid

## Phase 5 - Candidate Benchmark Run and Comparison

Owner: Benchmark owner
Effort: S-M (0.5-1 day)

Tasks:

- [ ] Run candidate benchmark with same profile and env assumptions as baseline
- [ ] Generate sqlite-candidate-latest artifact
- [ ] Run compare latest command
- [ ] Capture pass/fail summary with scenario deltas

Exit criteria:

- [ ] Comparison report produced
- [ ] Clear pass/fail status recorded

## Phase 6 - Hotspot Tuning Loop (only if fail)

Owner: Technical owner + Database owner
Effort: M (1-3 days, variable)

Tasks:

- [ ] Identify failing scenarios from compare output
- [ ] Identify top latency contributors (query shape, index, lock contention)
- [ ] Apply minimal tuning changes
- [ ] Re-run candidate benchmark
- [ ] Repeat until pass or no viable improvement

Stop condition:

- [ ] Stop after 3 major tuning iterations and review architecture choice if still failing

Exit criteria:

- [ ] Candidate passes benchmark gate or is explicitly marked no-go

## Phase 7 - Decision Record

Owner: Decision owner
Effort: S (0.5 day)

Tasks:

- [ ] Record benchmark artifacts and comparison summary
- [ ] Record cost estimate delta
- [ ] Record decision: continue migration or halt
- [ ] Record unresolved risks and follow-up actions

Exit criteria:

- [ ] Signed go/no-go decision exists

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
