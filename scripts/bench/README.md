# Benchmark Harness

This folder contains a lightweight benchmark harness for API no-regression checks.

## Files

- run.mjs: execute benchmark scenarios and write JSON results
- compare.mjs: compare baseline vs candidate and evaluate pass/fail gate
- scenarios.default.json: default endpoint scenarios

## Safety Defaults

Mutation-heavy scenarios are disabled by default.

To include mutation scenarios, edit scenarios.default.json and set enabled=true for those scenarios.

## Required Environment Variables

- BENCH_BASE_URL
- BENCH_CLUB_ID
- BENCH_BEARER_TOKEN
- BENCH_RIDE_ID

Optional for API key scenarios:

- BENCH_API_KEY
- BENCH_ALLOW_DEV_AUTH_BYPASS=true

Optional controls:

- BENCH_LABEL
- BENCH_OUTPUT_DIR
- BENCH_WARMUP_REQUESTS
- BENCH_TIMEOUT_MS

## Usage

Run benchmark:

bun run bench:run

Run auto-labeled Postgres baseline:

bun run bench:run:postgres

Run auto-labeled SQLite candidate:

bun run bench:run:sqlite

Compare two outputs:

bun run bench:compare artifacts/bench/baseline.json artifacts/bench/candidate.json

Compare latest labeled outputs:

bun run bench:compare:latest

Each run writes two files:

- timestamped artifact (for historical record)
- label-latest artifact (for stable compare inputs)

## Local Postgres Baseline Quickstart

1. Start local replica API in another terminal:

./bin/serve

2. Confirm health:

curl http://localhost:3001/health

3. Capture Postgres baseline:

BENCH_BASE_URL=http://localhost:3001 \
BENCH_CLUB_ID=<club-slug-or-id> \
BENCH_RIDE_ID=<known-ride-id> \
BENCH_BEARER_TOKEN=<jwt-if-needed> \
bun run bench:run:postgres

4. Capture candidate and compare:

BENCH_BASE_URL=http://localhost:3001 \
BENCH_CLUB_ID=<club-slug-or-id> \
BENCH_RIDE_ID=<known-ride-id> \
BENCH_BEARER_TOKEN=<jwt-if-needed> \
bun run bench:run:sqlite

bun run bench:compare:latest

## SQLite Candidate Data Prep

Before running `bench:run:sqlite`, bootstrap and load the SQLite candidate data subset:

SQLITE_DB_PATH=./data/rides-candidate.sqlite bun run db:pump:sqlite

Then point benchmark runs to the candidate API started with:

DB_DIALECT=sqlite SQLITE_DB_PATH=./data/rides-candidate.sqlite bun run dev

## Row Count Verification

Validate benchmark subset table counts between Postgres and SQLite:

SQLITE_DB_PATH=./data/rides-candidate.sqlite bun run bench:verify-counts

## Find A Valid Local Benchmark User

`GET /users?q=...` requires an authenticated user with club `ADMIN` role (or super-admin). To find a valid local user from the SQLite candidate dataset:

SQLITE_DB_PATH=./data/rides-candidate.sqlite BENCH_CLUB_ID=bcc bun run bench:find-user

Use the suggested email as `DEV_SKIP_AUTH_USER` for both Postgres and SQLite local runs.

## Local Auth-Gated Scenarios Without Real Auth0 JWT

If local development uses the existing `DEV_SKIP_AUTH=true` and `DEV_SKIP_AUTH_USER=...` server-side bypass, you can benchmark bearer-protected scenarios without a real Auth0 token:

BENCH_ALLOW_DEV_AUTH_BYPASS=true \
BENCH_BASE_URL=http://localhost:3001 \
BENCH_CLUB_ID=bcc \
BENCH_RIDE_ID=<ride-id> \
bun run bench:run:sqlite

Use this only for local benchmark coverage of auth-gated routes. Do not use it for staging or production-like auth validation.

Important:

- `bench:compare` now requires both baseline and candidate scenarios to complete with zero failures.
- If a baseline run returns `401` or a candidate run returns `500`, that scenario is invalid and must be rerun after fixing auth or server errors.
