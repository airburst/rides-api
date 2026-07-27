# Local Benchmark Findings

Date: 2026-07-27
Status: Completed local benchmark cycle

## Scope

This document records the results of the local benchmark-first SQLite candidate evaluation.

Compared backends:

- Baseline: local Postgres
- Candidate: local SQLite

Dataset:

- Production-replica local data pump
- Candidate SQLite subset row-count parity verified for benchmark-critical tables

Scenarios benchmarked:

- GET /rides?start=2026-01-01&end=2026-12-31
- GET /rides/:id
- GET /users?q=a

Load profile used:

- Warmup requests per scenario: 50
- Measured requests per scenario: 300
- Concurrency: 20

This is a modest load profile. It is enough to expose latency-shape differences, but it is not a stress test.

## Final Valid Comparison Summary

After invalid runs were discarded and auth/setup issues were corrected, the valid local comparison showed:

- SQLite improved p50 latency on all measured scenarios
- SQLite improved throughput on all measured scenarios
- SQLite regressed tail latency (p95 and/or p99) enough to fail the current no-regression gate

Representative valid comparison:

### rides_list

- baseline succeeded: true
- candidate succeeded: true
- p50 delta: -25.20%
- p95 delta: +1.31%
- p99 delta: +28.51%
- rps delta: +25.05%
- Result: fail

### ride_detail

- baseline succeeded: true
- candidate succeeded: true
- p50 delta: -25.15%
- p95 delta: -21.59%
- p99 delta: +23.47%
- rps delta: +28.84%
- Result: fail

### users_search

- baseline succeeded: true
- candidate succeeded: true
- p50 delta: -32.16%
- p95 delta: +14.18%
- p99 delta: +15.41%
- rps delta: +32.18%
- Result: fail

## Interpretation

The SQLite candidate is competitive on median latency and throughput.

However, the current decision bar is stricter:

- no performance regression at p95
- p99 regression allowed only within a narrow window

Under that bar, the candidate is currently a no-go.

This is not evidence that SQLite is broadly slower. It is evidence that, for this API and query shape, SQLite currently has worse tail latency under modest concurrent load.

## What Invalid Runs Taught

Earlier comparison artifacts were invalid for three reasons:

- benchmark server not running (`statusCounts.error`)
- auth-bypass user misconfigured, causing 401/500 responses
- stale artifacts compared after route/runtime fixes

These were corrected before the valid final comparison above.

## Likely Causes Of Tail-Latency Regression

Most likely contributors:

- Drizzle relation loading in list/detail paths
- query plan differences for date-filtered ride list
- local file-backed variance surfacing at p95/p99
- JSON payload assembly combined with nested relation fetching

## Recommendation

Current recommendation: do not proceed with SQLite migration on the strength of these results alone.

Reason:

- It does not satisfy the explicit no-regression requirement.

Possible follow-up if you choose to continue exploration:

1. Repeat benchmarks 3-5 times in `bun run start` mode only and compare medians.
2. Tune the `/rides` list path first.
3. Test whether removing or restructuring nested relation loading materially improves p95/p99.
4. Re-evaluate after tuning before making an architectural decision.

## Decision

Local benchmark conclusion:

- SQLite candidate: not approved under current acceptance thresholds
- Project status: stop by default unless further tuning work is explicitly approved
