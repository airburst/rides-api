# Benchmark and Cost Gate (Required)

Date: 2026-07-27
Status: Required before implementation and required before production cutover

## Objective

Any SQLite migration work must prove:

1. Infrastructure cost is lower (or explicitly approved if equal)
2. API and query performance does not regress

No benchmark evidence, no migration.

## Scope

Benchmark these paths because they represent current hot paths and risk areas:

- GET /rides (date range list)
- GET /rides/:id
- POST /rides/:id/join
- POST /rides/:id/leave
- GET /users?q=...
- POST /generate
- POST /archive

Also capture the top 5 query patterns behind those endpoints.

## Test Environments

Use three environments with identical app code and config except DB backend:

- Baseline: current Postgres path
- Candidate A: shared SQLite (Shape A)
- Candidate B (optional): control + per-tenant split simulation

Keep all of these fixed across runs:

- Same machine class (CPU/RAM/disk)
- Same Bun version
- Same Redis setting (enabled or disabled)
- Same dataset snapshot
- Same warmup duration
- Same load profile and duration

## Dataset Profile

Minimum realistic dataset for scale modeling:

- 100 clubs simulated
- 1000 clubs simulated (second pass)
- Ride density and user counts matched to expected production growth
- Include repeating rides and archived rides data

If full realistic volume is too slow for CI, keep a reduced CI profile and run full profile in scheduled benchmark jobs.

## Measurement Method

Use a repeatable harness and store outputs in versioned artifacts.

Recommended layers:

1. HTTP benchmark layer
   - endpoint latency p50/p95/p99
   - throughput
   - error rate
2. Query benchmark layer
   - per-query latency for top 5 query shapes
   - lock wait / busy retry counts (SQLite)
3. Resource layer
   - CPU and memory
   - disk IOPS and WAL growth (SQLite)
4. Cost layer
   - monthly infra estimate from measured resource needs + storage/backup assumptions

## Acceptance Thresholds (Go/No-Go)

All thresholds are relative to Postgres baseline unless noted.

- p50 endpoint latency: no regression
- p95 endpoint latency: no regression
- p99 endpoint latency: <= 5% regression allowed only if p95 improves and error rate is unchanged
- Throughput at target concurrency: no regression
- Error rate and timeout rate: no regression
- Top 5 query latency: no regression
- SQLITE_BUSY retried operations: below agreed SLO and with no user-visible errors
- Monthly TCO estimate: lower than baseline or explicitly approved by decision owner

If any threshold fails, result is No-Go.

## Runbook

1. Freeze benchmark commit SHA
2. Seed identical datasets
3. Warm app and caches for fixed duration
4. Run benchmark scenario suite against Baseline
5. Run same suite against Candidate
6. Collect JSON/CSV results and system metrics
7. Produce comparison report with deltas
8. Mark pass/fail per threshold

## Reporting Format

Each run must produce:

- Commit SHA
- Config snapshot
- Dataset profile id
- Latency table (p50/p95/p99) per endpoint
- Throughput/error table per endpoint
- Top query latency table
- Resource summary
- Monthly cost estimate summary
- Final decision: Go or No-Go with rationale

## Decision Owners

- Technical decision owner: API maintainer
- Business decision owner: project owner

A No-Go from either performance or cost gate blocks migration work beyond prototype.

## Suggested Implementation Sequence for Benchmarks

1. Create benchmark harness and seed profile first
2. Capture Postgres baseline before any SQLite branch work
3. Re-run benchmark after each migration milestone
4. Require passing benchmark in PR checklist for migration-related PRs

## Notes for Current Situation

Because there is currently one tenant (BathCC) and low production coupling to better-auth, you can iterate quickly.
However, this does not waive benchmark requirements for the 100-1000 club target.
