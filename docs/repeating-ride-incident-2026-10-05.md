# Repeating Ride Incident: 5 October 2026

## Production Findings

Investigation performed over `sshora`, using read-only PostgreSQL transactions
with a 10-second statement timeout. No production data or configuration changed.
The database connection string was loaded only inside the production process and
was not displayed, copied locally, or transmitted as investigation output.
Production uses PM2, not Docker. The server and database clocks are UTC.
Deployed API revision: `7b7e641`.

The PM2 output log (`~/.pm2/logs/rides-api-out.log`, lines 535873-535902)
contains four consecutive pairs:

```text
POST /repeating-rides -> 201
POST /generate       -> 403
```

The generation failures take 8-10 ms. The deployed `/generate` implementation
returns this 403 for a valid Auth0 token without super-admin authority, before
reading the request body or generating any rides. Template creation requires
club ADMIN authority, which is a different permission.

The database contains three identical BCC templates named `Bath Hills and Hops`:

| ID                                     | Creation Time (UTC) | Active Instances | Deleted Instances |
| -------------------------------------- | ------------------- | ---------------- | ----------------- |
| `fa633d68-394b-4df0-b74b-494a5050569e` | 14:54:37.451        | 0                | 0                 |
| `e391c4d0-d814-4395-9e25-9a61d06101cf` | 14:55:00.685        | 0                | 0                 |
| `3dd84aaf-1db5-4d55-8ff7-c59e94affca3` | 14:55:27.733        | 0                | 0                 |

Persisted schedule:

```text
DTSTART:20261015T181500Z
RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TH;UNTIL=20270330T000000Z
```

Persisted fields include winter start `18:15`, group `All`, distance `25`,
meeting point `Cadence, Chelsea Road`, and unlimited rider capacity (`-1`).
These are stored template fields, not a recovered raw request body.
Club-scoped queries found no active or soft-deleted rides with this name.

Later logs show a successful deletion of template
`507db84c-8d36-4350-8894-e7016c86fc01`; that row is absent from the database.
The same sequence also includes three failed attempts to delete template
`fa633d68-394b-4df0-b74b-494a5050569e` through `/rides/:id`, each returning 404.
That is a separate client deletion-routing issue, not instance generation.

## Conclusion And Limits

Generation was denied by authorization, not by malformed instance fields.
The frontend saved a template successfully, then called the super-admin-only
global generation endpoint. After that failure, submitting the still-active
form saved another template. Local tests reproduce this authorization mismatch.
Generation writes only to `rides`, never to `repeating_rides`.

Access logs do not retain timestamps, request bodies, response bodies, or caller
identities. Exact submitted payloads and request times cannot be reconstructed.
The 14:54-14:55 UTC database creation times precede the reported 16:45 time;
the report time should not be treated as the submission time. The deleted
template's original contents are not recoverable from these sources.

## Fix

- Add `POST /repeating-rides/:id/generate`, gated by normal session/JWT auth,
  club resolution, and club ADMIN authority. Look up the template by both ID and
  club ID. Require a valid generation date and reject unexpected request fields.
- Preserve global `/generate` restrictions for cron and super-admin operations.
- Share instance-generation logic, invalidate only the active club's cache,
  and serialize concurrent generation with a transaction-scoped advisory lock.
- Update the sibling `rides` frontend to use the scoped endpoint, retain the
  saved template ID, freeze saved fields, and keep failed generation retryable.
- Treat unsuccessful response bodies as failures even when HTTP status is 200.

Deploy the API before the frontend. No production remediation was performed.
Before generating production instances, an administrator should choose one
canonical template and remove the other duplicates. Generating all three would
produce three independent sets of rides because idempotency is per template.

## Local Reproduction And E2E

Requires Docker, Bun, Node, and the sibling `../rides` checkout. The recommended
command installs locked dependencies and Playwright Chromium automatically:

```bash
./bin/e2e
./bin/e2e --grep 'browser retry'
```

The runner creates a uniquely named container on a dynamically allocated local
database port, applies migrations, runs Playwright, and removes the container
and volume in a `finally` block. It handles SIGINT/SIGTERM and returns a failing
exit code when setup or tests fail. After SIGKILL or a machine restart,
`./bin/e2e-cleanup` removes only containers labelled `clubrides.e2e=true`.
Do not run cleanup while tests are active. API port 3101 and frontend port 3000
must be free. Existing servers and the interactive demo database are untouched.

For manual database setup, the test setup refuses databases other than
`rides_incident` on localhost or 127.0.0.1. All credentials below are synthetic,
local-only values, unrelated to production.

```bash
docker run -d --name rides-incident-postgres \
  -p 127.0.0.1:55432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=local-incident-only \
  -e POSTGRES_DB=rides_incident postgres:17
DATABASE_URL=postgres://postgres:local-incident-only@localhost:55432/rides_incident bun run db:migrate
bun run test:e2e
```

For an existing container, use `docker start rides-incident-postgres`.
Playwright starts fresh API and frontend servers on ports 3101 and 3000,
uses real local Better Auth sessions, and cleans up its synthetic fixtures.
It refuses to reuse already-running servers; stop the demo before running e2e.

Tests cover concurrent retries, uniqueness of persisted instances, schedule
linkage, winter times, unlimited capacity, soft-deleted occurrences, all user
roles, cross-club IDs, non-members, malformed input, global permissions, desktop
and mobile form retries, repeated submission after saving, and declining
generation. Browser failures retain screenshots and traces in `test-results`.

For interactive local development:

```bash
bun run incident:dev
```

App: `http://localhost:3000`; API: `http://localhost:3101`.
Log in using `incident-admin@example.invalid` and
`Local-incident-test-password-123`. This is a normal club admin, not a super-admin.
