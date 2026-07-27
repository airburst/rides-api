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
