# Auth Migration: Auth0 → better-auth

## Context

Rides API currently authenticates users via Auth0 (external JWKS JWT verification). This plan replaces it with better-auth — self-hosted email+password auth, no external identity provider dependency.

Multi-tenancy (phase 0 + 1) is complete and live in v2.0.0. This is the next phase.

## Decisions

- **Library**: `better-auth` with `emailAndPassword` plugin. No bearer plugin — cookies only.
- **Transport**: HttpOnly cookies. Bearer-in-localStorage rejected: Safari ITP blocks cross-origin storage tokens; localStorage increases XSS surface. Cookie domain `.fairhursts.net` covers both `app.fairhursts.net` (frontend) and `api.fairhursts.net` (API) with a single session cookie. `COOKIE_DOMAIN` env var keeps this portable for future production parent domain changes.
- **Domains**: API at `api.fairhursts.net`, new frontend at `app.fairhursts.net`. Per-club subdomains (e.g. `bcc.fairhursts.net`) are **out of scope** — no significant API impact since `resolveClub` already handles both `X-Club-Id` header and `?club=` query; it becomes a frontend + DNS-only change when the time comes.
- **Auth endpoints**: mount at `/api/auth/**` via Hono — `app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw))`. Provides sign-in, sign-up, sign-out, password reset, email verification out of the box.
- **Club-scoped signup**: new `POST /signup/club/:slug` endpoint wraps better-auth signup — creates user + `user_clubs(club, USER)` row in one transaction. Standard better-auth `/api/auth/sign-up/email` is left enabled but the frontend only calls the club endpoint.
- **Sign-up policy**: open registration.
- **Account linking disabled**: `disableAccountLinking: true` — prevents better-auth auto-merging old Auth0 accounts with new credential accounts on email match during the dual-auth window.
- **Email during development**: `EMAIL_PROVIDER=console` logs the verification/reset URL to stdout (copy-paste manually). Flip to `EMAIL_PROVIDER=resend` before the BCC cutover blast.
- **Email provider (production)**: Resend. better-auth has a first-party Resend integration. DKIM/SPF/DMARC must be verified on `fairhursts.net` before the cutover blast.
- **Cron auth**: unchanged — `API_KEY` bearer token checked separately in archive/generate/riderhq routes, never touches the session layer.
- **Dev bypass**: unchanged — `DEV_SKIP_AUTH` looks up user by email, still valid.
- **User migration**: hard cutover. Send password-reset links to all BCC users in role-ordered batches. Once all have set passwords, decommission Auth0.
- **Placeholder emails**: confirmed none in production (`SELECT … WHERE email LIKE '%@placeholder.local'` returns empty). Cutover is clean. ✓

---

## Schema changes

`sessions` and `accounts` are both effectively empty in production (Auth0 uses stateless JWTs — no session rows; `accounts` holds only the Auth0 sub used for JIT provisioning). **Drop and recreate** both rather than reshape. `verificationTokens` is also empty — drop and recreate as `verification`.

**`users`** — additive only:

- `emailVerified`: `timestamp` → `boolean` (better-auth expects boolean)
- `lastLoginAt`: add `timestamp` nullable — updated on every successful auth; used to order BCC password-reset batches

**`accounts`** — drop and recreate with better-auth shape:
`id`, `userId`, `accountId`, `providerId`, `password` (nullable bcrypt hash), `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `createdAt`, `updatedAt`

**`sessions`** — drop and recreate with better-auth shape:
`id`, `userId`, `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`

**`verificationTokens`** — drop and recreate as `verification`:
`id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`

Use `@better-auth/cli generate` against the existing schema to produce the migration SQL, then hand-tweak for Drizzle's `casing: "snake_case"`.

---

## New file: `src/lib/auth.ts`

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: [
    "http://localhost:3000",
    "https://app.fairhursts.net",
    "https://bcc-rides.vercel.app", // legacy — remove after BCC cutover
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  advanced: {
    cookies: {
      sessionToken: {
        attributes: {
          sameSite: "lax",
          secure: true,
          domain: process.env.COOKIE_DOMAIN, // ".fairhursts.net"
        },
      },
    },
    disableAccountLinking: true,
  },
  user: {
    additionalFields: {
      isSuperAdmin: { type: "boolean", required: false, defaultValue: false },
      mobile: { type: "string", required: false },
      emergency: { type: "string", required: false },
      preferences: { type: "string", required: false },
      membershipId: { type: "string", required: false },
      membershipStatus: { type: "string", required: false },
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      if (process.env.EMAIL_PROVIDER === "resend") {
        /* resend send */
      } else {
        console.info(`[AUTH:VERIFY] ${user.email} → ${url}`);
      }
    },
  },
  // sendResetPassword: same EMAIL_PROVIDER pattern
});
```

---

## Updated: `src/middleware/auth.ts`

Cookies and bearer tokens are **separate headers** — no token shape detection needed. `resolveBetterAuthUser` reads the `Cookie` header; `resolveAuth0User` reads `Authorization: Bearer`. They cannot conflict, and neither path adds overhead for the other.

```ts
// ── better-auth path (reads Cookie header) ────────────────────────────────────
async function resolveBetterAuthUser(headers: Headers): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  void updateLastLogin(session.user.id);
  return { id: session.user.id, isSuperAdmin: session.user.isSuperAdmin, ... };
}

// ── Auth0 path (reads Authorization: Bearer header) ───────────────────────────
// DELETE this function and its call site after BCC migration complete
async function resolveAuth0User(token: string): Promise<AuthUser | null> {
  const payload = await verifyAuth0Token(token);
  const user = await findOrProvisionUser(payload, token);
  if (!user) return null;
  void updateLastLogin(user.id);
  return { id: user.id, isSuperAdmin: user.isSuperAdmin, ... };
}

// ── main resolver ─────────────────────────────────────────────────────────────
async function resolveUser(c: Context): Promise<AuthUser | null> {
  const fromCookie = await resolveBetterAuthUser(c.req.raw.headers);
  if (fromCookie) return fromCookie;
  // ── DELETE block below after BCC migration ────────────────────────────────
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return resolveAuth0User(authHeader.slice(7));
  }
  // ── END DELETE ────────────────────────────────────────────────────────────
  return null;
}
```

After BCC migration: delete `resolveAuth0User` and its import, delete the marked block in `resolveUser`, delete `src/lib/auth0.ts`. `authMiddleware` and `optionalAuth` wrappers are untouched.

Other changes:

- `AuthUser` interface: drop `auth0Id`; add optional `sessionId` (set on better-auth path only)
- JIT provisioning removed for the better-auth path — explicit signup only
- Dev bypass unchanged

---

## New endpoint: `src/routes/signup.ts`

`POST /signup/club/:slug` — club-scoped signup, no auth required:

1. Resolve club by slug (404 if unknown)
2. Call `auth.api.signUpEmail({ body: { email, password, name } })`
3. On success, insert `user_clubs(userId, clubId, role: "USER")`
4. better-auth sends verification email automatically (console or Resend per `EMAIL_PROVIDER`)
5. Return `{ success: true, requiresVerification: true }`

---

## Env vars

Remove (after BCC cutover): `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`

Add:

- `BETTER_AUTH_SECRET` — random 32+ byte string for session signing
- `BETTER_AUTH_URL` — API base URL (`https://api.fairhursts.net`)
- `COOKIE_DOMAIN` — `.fairhursts.net`
- `EMAIL_PROVIDER` — `console` (default) or `resend`
- `EMAIL_FROM` — e.g. `noreply@fairhursts.net`
- `RESEND_API_KEY` — only required when `EMAIL_PROVIDER=resend`

---

## Migration (two steps)

1. **Schema**: drop `accounts`, `sessions`, `verificationTokens`; recreate as better-auth shapes; alter `users.emailVerified` timestamp → boolean; add `users.lastLoginAt`.
2. **Data**: existing Auth0 users have no password — they go through password reset. No row-level data to migrate. Sessions was empty; old accounts rows are discarded (Auth0 subs no longer needed once users set passwords).

Verify locally with `bin/serve` before applying to Supabase.

---

## Dual-auth parallel operation (BCC transition period)

Cookies (better-auth) and bearer JWT (Auth0) use separate headers — no conflict, no overhead for either path. BCC users arrive with `Authorization: Bearer <Auth0 JWT>` and hit `resolveAuth0User` directly. New-club test users arrive with a session cookie and hit `resolveBetterAuthUser` directly. Both can coexist against the same database indefinitely until BCC cutover.

`src/lib/auth0.ts` is kept until BCC migration is complete, then deleted alongside the marked block in `resolveUser`.

---

## User migration (BCC — batched password resets)

**Ordering**: ADMINs first, then LEADERs, then USERs; within each role ordered by `users.lastLoginAt DESC NULLS LAST` (most recently active most likely to act promptly).

**`lastLoginAt`**: added in the schema migration; updated on every successful auth from day one of deployment so the ordering is meaningful by cutover day.

Migration script `scripts/send-password-resets.ts`:

1. Fetch BCC `user_clubs` members with no `password` in `accounts`, joined to `users`, ordered by role then `lastLoginAt DESC NULLS LAST`
2. Call `auth.api.requestPasswordReset({ body: { email, redirectTo: "https://app.fairhursts.net/c/bcc/reset-password" } })` for each
3. Batches of 50 with configurable delay between batches (default 60s); safe to re-run
4. Log successes and failures

Monitor: `SELECT COUNT(*) FROM accounts WHERE provider_id = 'credential' AND password IS NULL` — trends to zero.

After all BCC users have set passwords: delete `resolveAuth0User`, delete marked block in `resolveUser`, delete `src/lib/auth0.ts`, remove `AUTH0_*` env vars, cancel Auth0 subscription.

---

## Frontend (new repo — `bcc-rides-v2`)

New repo, clean rebuild. TanStack Start CSR, deployed to Vercel at `app.fairhursts.net`. Old frontend (`bcc-rides.vercel.app`) stays live during the dual-auth window.

**Route structure** (club slug in path; subdomains per club deferred — no API changes needed when that ships):

```
/c/:slug                      club home / ride list (public)
/c/:slug/login
/c/:slug/signup
/c/:slug/forgot-password
/c/:slug/reset-password       handles ?token=... from email
/c/:slug/verify-email         handles ?token=... from email
/c/:slug/join                 existing-user joins another club
/c/:slug/rides/:id
/c/:slug/profile
/                             redirects to /c/bcc until other clubs exist
```

**Key changes from current frontend:**

- Drop `@auth0/auth0-react`, `Auth0Provider`, `useAuth0`, `getAccessTokenSilently`
- `src/lib/auth.ts` — `createAuthClient({ baseURL: VITE_API_URL, fetchOptions: { credentials: "include" } })`
- `useSession()` → `authClient.useSession()` + `/users/me` for DB record + per-club role
- API fetch wrapper: drop token arg; add `credentials: "include"` + `X-Club-Id: <slug-from-route>`
- `useClubSlug()` hook reads club from route params; threads through to all API calls

**Env vars (frontend)**: `VITE_API_URL=https://api.fairhursts.net`; drop `VITE_AUTH0_*`.

---

## Tests

- `src/test/auth.ts` — mint test users via direct DB insert with bcrypt hash (faster than full signup flow in unit tests)
- `src/routes/__tests__/authorization.test.ts` — mock better-auth session cookie; same role-gate assertions
- `src/routes/__tests__/signup.test.ts` — NEW: club-scoped signup creates user + user_clubs row; unknown slug → 404; duplicate email → conflict
- `src/lib/__tests__/auth.test.ts` — NEW: signup/login/session/reset happy paths with `EMAIL_PROVIDER=console`
- `DEV_SKIP_AUTH` tests unchanged

---

## Files to touch

### API (`rides-api`)

- `src/db/schema/index.ts` — drop/recreate accounts/sessions/verificationTokens; boolean emailVerified; add lastLoginAt
- `drizzle/00XX_*.sql` ×2 (drop legacy tables + recreate as better-auth shapes)
- `src/lib/auth.ts` — NEW (better-auth server instance)
- `src/lib/auth0.ts` — KEEP during transition, DELETE after BCC migration complete
- `src/middleware/auth.ts` — dual-auth resolver; drop auth0Id from AuthUser
- `src/index.ts` — mount `/api/auth/**` handler; add trusted origins to CORS
- `src/routes/signup.ts` — NEW (club-scoped signup)
- `src/routes/clubs.ts` — add `POST /clubs/:slug/join`
- `scripts/send-password-resets.ts` — NEW (batched Resend password-reset emailer; ADMIN → LEADER → USER, then lastLoginAt DESC; batches of 50)
- `src/test/auth.ts` — mint test users via direct DB insert
- `src/routes/__tests__/authorization.test.ts` — mock session cookie instead of Auth0 token
- `src/routes/__tests__/signup.test.ts` — NEW
- `src/lib/__tests__/auth.test.ts` — NEW
- `.env` / `.env.local` — add BETTER_AUTH_SECRET, BETTER_AUTH_URL, COOKIE_DOMAIN, EMAIL_PROVIDER, EMAIL_FROM, RESEND_API_KEY

### Frontend (new repo `bcc-rides-v2`)

- Full new repo — copy component library and types from current frontend, rebuild auth and routing around better-auth client and `/c/:slug/...` route tree

---

## Unresolved questions

All resolved.

- **Email provider**: Resend ✓
- **Sign-up policy**: open registration ✓
- **Placeholder emails**: none in production ✓
- **Subdomains per club**: out of scope; no API changes required when it ships ✓
