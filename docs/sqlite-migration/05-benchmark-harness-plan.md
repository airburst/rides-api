# Benchmark Harness Plan (Implementation Guide)

Date: 2026-07-27
Status: Ready to run

## Purpose

This document maps benchmark requirements to runnable harness scripts and endpoint scenarios for this API.

It implements two goals:

1. Reproducible speed comparisons between Postgres baseline and SQLite candidate
2. Explicit no-regression decisioning aligned to 04-benchmark-and-cost-gate.md

## Recommended Execution Environments

Run in this order:

1. Local developer environment
2. Production-like staging (primary decision gate)
3. Limited production validation only after staging pass

Do not run full stress load against production.

## Harness Location

- scripts/bench/run.mjs
- scripts/bench/compare.mjs
- scripts/bench/scenarios.default.json
- scripts/bench/README.md

## Scenario Mapping

The default scenario file maps directly to existing routes.

Read-heavy (enabled by default):

- GET /rides
- GET /rides/:id
- GET /users?q=...

Mutation scenarios (disabled by default for safety):

- POST /rides/:id/join
- POST /rides/:id/leave
- POST /generate
- POST /archive

## Required Inputs

Environment variables for run script:

- BENCH_BASE_URL
- BENCH_CLUB_ID
- BENCH_BEARER_TOKEN (for authed user routes)
- BENCH_API_KEY (for API key routes)
- BENCH_RIDE_ID (for ride detail/join/leave paths)

Optional:

- BENCH_OUTPUT_DIR (default: artifacts/bench)
- BENCH_LABEL (default: bench-run)
- BENCH_WARMUP_REQUESTS (default: 50)
- BENCH_TIMEOUT_MS (default: 10000)

## Dataset and Seed Guidance

Maintain two fixture sets:

- dataset-100-clubs
- dataset-1000-clubs

Each fixture should include:

- rides across multiple date ranges
- repeating rides templates
- archived rides
- users and memberships sufficient for authz checks

## Run Profiles

Use at least two profiles:

1. Smoke profile
   - Small request counts
   - Fast feedback for PR checks
2. Decision profile
   - Larger request counts
   - Concurrency near expected production burst

Example defaults in scenarios.default.json:

- warmupRequests: 50
- measuredRequests: 300
- concurrency: 20

Tune these upward for staging decision runs.

## Command Flow

1. Capture baseline:
   - run harness against Postgres
   - save output JSON
2. Capture candidate:
   - run harness against SQLite
   - save output JSON
3. Compare results:
   - run compare script with baseline and candidate JSON files
   - review pass/fail gate summary

## Local Postgres Benchmark Workflow (using bin/serve)

This repository already has a full local bootstrap path in bin/serve:

- starts local Postgres
- applies migrations
- pumps SOURCE_URL data when configured
- starts API

Use this as your baseline source of truth for Postgres performance.

### Terminal 1: start local replica API

1. Ensure .env.local has SOURCE_URL set to the production source intended for pump.
2. Start the stack:

   ./bin/serve

3. Wait for API readiness:

   curl http://localhost:3001/health

### Terminal 2: run benchmark harness against local Postgres

Set benchmark variables, then run:

BENCH_BASE_URL=http://localhost:3001 \
BENCH_CLUB_ID=<club-slug-or-id> \
BENCH_RIDE_ID=<known-ride-id> \
BENCH_BEARER_TOKEN=<jwt-if-needed> \
bun run bench:run:postgres

Notes:

- If BENCH_BEARER_TOKEN is omitted, bearer-auth scenarios are skipped.
- This is acceptable for read-only baseline smoke runs, but decision runs should include authenticated scenarios.

### Candidate run (SQLite branch/environment)

Run the same scenario profile against the SQLite candidate environment:

BENCH_BASE_URL=http://localhost:3001 \
BENCH_CLUB_ID=<club-slug-or-id> \
BENCH_RIDE_ID=<known-ride-id> \
BENCH_BEARER_TOKEN=<jwt-if-needed> \
bun run bench:run:sqlite

### Compare latest baseline vs candidate

bun run bench:compare:latest

This uses:

- artifacts/bench/postgres-baseline-latest.json
- artifacts/bench/sqlite-candidate-latest.json

### Recommended discipline

- Keep scenario config fixed between baseline and candidate runs.
- Use warmed data and identical cache settings.
- Run at least 3 repetitions and compare medians to reduce noise.

## Gate Rules Enforced by compare.mjs

- p50: candidate must be <= baseline
- p95: candidate must be <= baseline
- p99: candidate can regress by up to 5 percent only if p95 improved and error rate did not increase
- error rate: candidate must be <= baseline

Note: query-level and cost-level gate checks remain required, but are tracked outside this harness output unless integrated with DB/query telemetry export.

## Artifacts

Each run writes:

- full run metadata
- per-scenario latency stats (p50/p95/p99)
- throughput and error metrics
- raw status code counts

Store JSON artifacts per run and keep them with the migration decision record.

## Suggested Next Extension

After initial scaffolding, add:

- query timing export from DB layer
- CPU/memory snapshot capture during runs
- monthly cost model calculator from measured infra profile

Execution tracking and ownership are captured in:

- 06-sqlite-candidate-execution-checklist.md
