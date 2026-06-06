# Sentry Setup Plan — rides-api

## Overview

Add error capture and basic performance tracing to the Hono API using `@sentry/node` v8.
Errors will be captured with request context. 5% of requests will be traced.
The Sentry free tier (5K errors/mo, 5M spans/mo) is almost certainly sufficient for this app.

---

## Step 1 — Install

```bash
bun add @sentry/node
```

---

## Step 2 — Add `SENTRY_DSN` to env schema

**File:** `src/lib/env.ts`

Add to the schema (optional so startup doesn't fail in dev/test without a DSN):

```typescript
SENTRY_DSN: { type: "string", optional: true },
```

---

## Step 3 — Create `src/instrumentation.ts`

This file must be imported **before anything else** because `@sentry/node` v8 uses
OpenTelemetry auto-instrumentation that patches modules at load time.

```typescript
import * as Sentry from "@sentry/node";
import { env } from "./lib/env.js";

const dsn = env("SENTRY_DSN");

Sentry.init({
  dsn,
  environment: env("NODE_ENV"),
  enabled: !!dsn && env("NODE_ENV") === "production",
  tracesSampleRate: 0.05, // 5% of requests — keeps span quota comfortable
  // Filter noise that isn't worth capturing
  ignoreErrors: ["Not found"],
  beforeSend(event) {
    // Drop 401/403 errors — not actionable
    const status = event.contexts?.response?.status_code;
    if (status === 401 || status === 403) return null;
    return event;
  },
});
```

---

## Step 4 — Update `index.ts`

### 4a — Import instrumentation first (before all other imports)

```typescript
// MUST be the very first import
import "./instrumentation.js";

import { config } from "dotenv";
// ... rest of imports unchanged
```

### 4b — Update the error handler

Replace the existing `app.onError` block:

```typescript
import * as Sentry from "@sentry/node";

// Error handler
app.onError((err, c) => {
  Sentry.captureException(err, {
    extra: {
      path: c.req.path,
      method: c.req.method,
      clubId: c.get("club")?.id,
    },
  });
  console.error("Error:", err);
  return c.json({ error: "Internal server error" }, 500);
});
```

---

## Step 5 — Add env var

In `.env` (dev, optional — init is disabled when NODE_ENV !== production):

```
SENTRY_DSN=
```

In production (Oracle VPS / PM2 ecosystem config or `.env.production`):

```
SENTRY_DSN=https://xxxx@oXXXXX.ingest.sentry.io/XXXXXXX
```

Get the DSN from: Sentry dashboard → Project Settings → Client Keys (DSN).

---

## Step 6 — Verify source maps (optional but recommended)

Without source maps, stack traces show compiled `dist/` paths instead of `src/` paths.

```bash
bun add -d @sentry/cli
```

Add to `package.json` scripts — run after `build`:

```json
"sentry:sourcemaps": "sentry-cli sourcemaps inject dist && sentry-cli sourcemaps upload dist"
```

Requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` env vars (from Sentry CI settings).
This step is optional for an initial setup — errors are still captured, just with minified traces.

---

## Step 7 — Smoke test

Deploy to production and trigger a deliberate error:

```bash
curl https://api.fairhursts.net/rides/this-route-does-not-exist-boom
```

Check Sentry Issues dashboard — should see the error within ~30s.

---

## Gotchas

- **Import order is critical.** `instrumentation.ts` must be the first import. If something else
  imports postgres/redis before Sentry initialises, auto-instrumentation for those clients won't work.
- **`enabled: !!dsn`** means tests and dev won't hit Sentry even if the env var is accidentally set.
- **`tracesSampleRate: 0.05`** (5%) is conservative. Sentry free tier gives 5M spans/mo.
  At 100 req/min that's ~8.6M spans/mo at 100% — so 5% keeps you well inside the free tier.
- **Bun note:** `@sentry/node` v8 OpenTelemetry instrumentation is tested against Node.
  Bun's Node compat is high but if you see any startup errors, check Sentry's
  [Bun compatibility notes](https://docs.sentry.io/platforms/javascript/guides/bun/).

---

## What you get

- Unhandled errors in route handlers captured with club/request context
- Stack traces pointing to source (if source maps uploaded)
- Slow request detection via tracing
- Alerts on new error types or error rate spikes
- Release tracking (set `release: pkg.version` in `Sentry.init` if desired)
