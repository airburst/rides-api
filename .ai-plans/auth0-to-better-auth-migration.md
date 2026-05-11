# Auth0 → Better-Auth Migration (Phase 2)

## Context

Phase 1 (multi-tenancy) is live in production. This phase replaces Auth0 with **better-auth** for both the API and the frontend, giving us self-hosted email+password auth with no external identity provider.

The frontend currently runs on Vercel as a static CSR TanStack Start app, talking to a Hono API on Oracle Cloud. Auth0 is deeply embedded on the frontend (3 core hooks, ~25 dependent files). Existing users will be required to set new passwords via reset email — that's accepted scope.

A new wrinkle from this round of design: club-scoped URLs. New users discover a club via a public URL (`/c/<slug>`) and sign up into that club. Existing users visiting another club's URL get a "join this club" CTA. This generalises signup from "single default club" to "the club whose URL you arrived at" — which is what BCC operationally does today but extends naturally to multi-club.

## Decisions (settled)

- **Transport**: HttpOnly cookies + shared registrable parent domain. Cross-origin Bearer-in-localStorage rejected (Safari ITP, XSS surface).
- **Domain for build/test**: `fairhursts.net` (already owned). Frontend at `app.fairhursts.net`, API stays at `api.fairhursts.net`. Better-auth cookie domain `.fairhursts.net`. Anticipate a future production parent — keep cookie domain in env so it moves cleanly.
- **Email**: console-only during build (server logs the link; we copy/paste manually for the test users), **Resend** before the prod cutover password-reset blast. Sending domain DKIM/SPF/DMARC setup on `fairhursts.net` is a prerequisite for the blast.
- **Signup**: open, scoped by club-URL. New user visits `https://app.fairhursts.net/c/<slug>` → "Sign up" → posts signup with that club's slug → user + `user_clubs(club, USER)` row in one transaction. Existing user visiting another club URL → "Join this club" button → adds another `user_clubs` row. **No DEFAULT_CLUB_SLUG fallback for signup** — the club slug must be explicit in the URL. (Note: the API's `DEFAULT_CLUB_SLUG` compat is for legacy frontend requests missing `X-Club-Id`; not the same thing.)
- **Code structure**: new frontend repo (`bcc-rides-v2` or pick a name), dual-auth on the API via a long-lived branch (`feat/better-auth`) — kept separate from `main` for hygiene; merged once cutover is complete and Auth0 code is excised.
- **User migration**: hard cutover. All existing users receive a "set your new password" email at switchover. No dual-auth window for users — but the API runs dual-auth code for the build/test period so both frontends can hit it.
- **Future tenant routing**: subdomain per club (DevOps work). Until then, club slug in path. The API's `resolveClub` middleware already handles both header and `?club=` query — no API change for tenant resolution.

## Architecture overview

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│ bcc-rides (current, Auth0)  │ ──JWT── │ rides-api main             │
│ bcc-rides.vercel.app        │  Bearer │ api.fairhursts.net          │
└─────────────────────────────┘         │  auth0-only branch          │
                                        └─────────────────────────────┘
                                                    │
                                          shared Postgres (Supabase)
                                                    │
┌─────────────────────────────┐         ┌─────────────────────────────┐
│ bcc-rides-v2 (new)          │ cookies │ rides-api feat/better-auth │
│ app.fairhursts.net          │ ──────► │  same VPS, same DB          │
│ TanStack Start CSR          │         │  dual-auth window (test)    │
└─────────────────────────────┘         └─────────────────────────────┘
```

During test: both stacks run in parallel against the same DB. At cutover, DNS flips `app.fairhursts.net` → (future) production parent, the dual-auth branch merges to main, Auth0 code is stripped.

---

## Phase 2A — API: better-auth alongside Auth0 (dual-auth)

Branch `feat/better-auth` off `main`. Stays a branch until cutover. No release/version bump on `main` while this is in flight.

### Schema changes

Better-auth's CLI (`npx @better-auth/cli@latest generate`) produces a Drizzle schema reflecting its expected models. We feed it our existing `src/db/schema/index.ts` and override `modelName` / `fields` so it targets:

- `user` → existing `users` table. Keep all existing columns (`name`, `email`, `emailVerified`, `image`, `mobile`, `emergency`, `isSuperAdmin`, `preferences`, `membershipId`, `membershipStatus`). Register the extras as `additionalFields`.
- `session` → existing `sessions` table. Currently has `sessionToken` PK + `userId` + `expires`. Better-auth expects `id` (PK), `userId`, `expiresAt`, `token`, `ipAddress`, `userAgent`. **Drop and recreate** — table is vestigial NextAuth leftover, zero rows in prod that matter.
- `account` → existing `accounts` table. Currently OAuth-shaped. Better-auth expects `id` (PK), `userId`, `accountId`, `providerId`, `password` (hashed, nullable for OAuth-only accounts), `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `createdAt`, `updatedAt`. **Drop and recreate** — existing rows are auth0-provider and unused after cutover.
- `verification` → rename existing `verification_tokens` to `verification`. Adjust columns.

Migration sequence (three files):

1. `0014_drop_legacy_auth_tables.sql` — drop `sessions`, `accounts`, `verification_tokens` (all empty/vestigial in prod). Down-migration backup: nothing useful to preserve.
2. `0015_better_auth_tables.sql` — `@better-auth/cli generate` output, hand-tweaked to use Drizzle's `casing: "snake_case"`.
3. `0016_user_clubs_signup_hook.sql` — if any composite indexes need updating for the new signup path; likely empty.

### Better-auth init

New file `src/lib/auth.ts` (replaces `src/lib/auth0.ts` eventually; both coexist on the branch):

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
    // legacy Auth0 origin retained during dual-auth window:
    "https://bcc-rides.vercel.app",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    disableSignUp: false, // we wrap signup with a custom endpoint, but leave the underlying handler enabled
  },
  advanced: {
    cookies: {
      sessionToken: {
        attributes: {
          sameSite: "lax",
          secure: true,
          domain: process.env.COOKIE_DOMAIN, // ".fairhursts.net" in test; flips for prod parent
        },
      },
    },
    disableAccountLinking: true, // don't auto-merge old auth0 accounts with new credential accounts
  },
  user: {
    additionalFields: {
      mobile: { type: "string", required: false },
      emergency: { type: "string", required: false },
      isSuperAdmin: { type: "boolean", required: false, defaultValue: false },
      preferences: { type: "string", required: false }, // JSON-stringified; we keep DB column as jsonb
      membershipId: { type: "string", required: false },
      membershipStatus: { type: "string", required: false },
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      if (process.env.EMAIL_PROVIDER === "resend") {
        // resend client send
      } else {
        console.info(`[AUTH:VERIFY] ${user.email} → ${url}`);
      }
    },
  },
  // Same pattern for sendResetPassword.
});
```

### Hono mount

`src/index.ts`:

```ts
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

CORS already allows `credentials: true`; add the new test origin and (eventually) the prod parent origin to the allowlist (`src/index.ts:24-37`).

### Middleware

`src/middleware/auth.ts` (the file lives on the branch with both code paths):

```ts
// Try better-auth session first, then fall back to Auth0 JWT.
// Both produce the same AuthUser shape on c.set("user").
const session = await auth.api.getSession({ headers: c.req.raw.headers });
if (session) {
  c.set("user", toAuthUser(session.user));
  await next();
  return;
}
// Existing Auth0 path follows as today.
```

`AuthUser` interface unchanged. `toAuthUser` maps better-auth's user record to our internal shape. JIT provisioning logic is removed for the better-auth path (signup is explicit, not implicit on first request).

`src/middleware/club.ts` — unchanged. `resolveClub` reads `X-Club-Id` / `?club=` independently of auth.

### New endpoints

`POST /signup/club/:slug` — wraps better-auth signup with club assignment.

```ts
// 1. Resolve club by slug.
// 2. Call auth.api.signUpEmail({ body: { email, password, name } })
// 3. On success, insert user_clubs(userId=newUser.id, clubId=club.id, role="USER").
// 4. Better-auth sends verification email automatically.
// 5. Return: { success: true, requiresVerification: true }
```

`POST /clubs/:slug/join` (new, authed) — existing-user joins another club.

```ts
// 1. Resolve club by slug.
// 2. Look up user_clubs(userId=session.user.id, clubId=club.id).
// 3. If exists → 409 already a member. Else insert with role="USER".
```

`/clubs/:slug/members` (existing) — gains an optional invite email send for super-admins / club admins adding a known email. Not the primary signup path.

### Routes that change

- `src/routes/generate.ts:84-97` — Auth0 JWT branch reads `account?.users?.isSuperAdmin`. Replace with better-auth `auth.api.getSession()` check. Dual-auth: try both.
- `src/routes/users.ts:38-83` — `/users/me` already returns the compat `role` field; that stays. Add `clubs[]` (already present from phase 1).

### Env vars added

- `COOKIE_DOMAIN` — `.fairhursts.net` for test, flips at production cutover.
- `EMAIL_PROVIDER` — `console` (default) or `resend`.
- `RESEND_API_KEY` — only when EMAIL_PROVIDER=resend.
- `EMAIL_FROM` — e.g. `noreply@fairhursts.net`.
- `BETTER_AUTH_SECRET` — random 32-byte string for session signing.
- `BETTER_AUTH_URL` — `https://api.fairhursts.net` (the API's own URL).
- `AUTH0_*` and `API_KEY` remain unchanged during dual-auth window.

### Tests

- `src/middleware/__tests__/provisioning.test.ts` — Auth0 JIT provisioning tests stay green on the dual-auth branch. JIT path is deprecated but functional until cutover.
- New `src/lib/__tests__/auth.test.ts` — better-auth signup, login, session, password reset happy paths against a mocked email sender.
- New `src/routes/__tests__/signup.test.ts` — `POST /signup/club/:slug` creates user + user_clubs row; signup with unknown slug → 404; duplicate email → conflict.
- `src/routes/__tests__/authorization.test.ts` — extend mock to set a better-auth session cookie and verify the same role-based gating works.

### Critical files (phase 2A)

- `src/lib/auth.ts` — NEW
- `src/lib/auth0.ts` — kept; eventually deleted
- `src/middleware/auth.ts` — modified to try both
- `src/index.ts` — better-auth handler mount, CORS update
- `src/db/schema/index.ts` — better-auth-shaped session/account/verification
- `drizzle/0014_*.sql` `drizzle/0015_*.sql` (+ maybe 0016)
- `src/routes/signup.ts` — NEW (club-scoped signup)
- `src/routes/clubs.ts` — `POST /clubs/:slug/join` added
- `src/routes/generate.ts` — dual-auth check
- env: `COOKIE_DOMAIN`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`

---

## Phase 2B — Frontend: new repo with better-auth

New repo `bcc-rides-v2` (or pick a name). Clean rebuild — copy-don't-fork the existing `bcc-rides` repo. TanStack Start, CSR build, Vercel deploy.

### Route structure

```
/                         → landing (lists known clubs, or 302 to a default)
/c/:slug                  → club home (public ride list)
/c/:slug/login            → login form
/c/:slug/signup           → signup form (new user joining this club)
/c/:slug/join             → "you're logged in, join this club" CTA
/c/:slug/forgot-password
/c/:slug/reset-password   → handles ?token=... from email
/c/:slug/verify-email     → handles ?token=... from email
/c/:slug/profile          → existing profile completion + per-club role display
/c/:slug/rides            → ride list (was /, now club-scoped)
/c/:slug/rides/:id        → ride detail
```

The slug from the URL drives both the club selector for the API (`X-Club-Id` header) and the signup/join routing.

### Better-auth client

`src/lib/auth.ts` (frontend):

```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
  fetchOptions: { credentials: "include" },
});
```

Replaces the entire Auth0Provider + useAuth0 surface.

### Hook replacements

- `src/components/Providers.tsx` — drop `Auth0Provider` wrapper.
- `src/hooks/useSession.ts` — rewrite around `authClient.useSession()`. Still hits `/users/me` for the DB record + per-club role (the compat field stays in the payload). Profile-completion redirect logic preserved.
- `src/hooks/useApiClient.ts` — drop `getAccessTokenSilently`. Replace with a fetch wrapper that sets `credentials: "include"` and `X-Club-Id: <slug-from-route>`. No token argument any more.

### API client

`src/lib/api.ts`:

```ts
export async function apiClient<T>(endpoint, options) {
  const headers = { ...options.headers };
  if (options.clubSlug) headers["X-Club-Id"] = options.clubSlug;
  // drop token branch; rely on cookies via credentials: "include"
  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });
}
```

All consumer hooks (`useRides`, `useCreateRide`, etc.) lose their token argument. The active club slug from the route param is threaded through instead. A small `useClubSlug()` hook reads it from `useParams()`.

### Auth flows

- **Signup**: `/c/:slug/signup` form → `POST /signup/club/:slug` → tells user "check your email", they click verify link → land on `/c/:slug/verify-email?token=...` → frontend calls `authClient.verifyEmail({ token })` → on success, redirect to `/c/:slug/login`.
- **Login**: `/c/:slug/login` → `authClient.signIn.email({ email, password })` → cookie set → redirect to `/c/:slug/rides`.
- **Forgot password**: `/c/:slug/forgot-password` → `authClient.forgetPassword({ email, redirectTo: "/c/:slug/reset-password" })` → email out → reset-password page → `authClient.resetPassword({ token, newPassword })`.
- **Logout**: `authClient.signOut()` → cookie cleared.
- **Join another club** (existing user): land on `/c/:other-slug` while logged in → see "You're not a member of <other-club>. Join now?" → `POST /clubs/:other-slug/join` → success → redirect to that club's ride list.

### Env vars (frontend)

- `VITE_API_URL` — `https://api.fairhursts.net`.
- Drop `VITE_AUTH0_*`.

### Deployment

Vercel project pointed at `app.fairhursts.net`. Vercel custom domain + DNS CNAME in fairhursts.net DNS. `vercel.json` mostly unchanged (still CSR, all routes to `/_shell.html`).

### Why CSR is fine

Better-auth's `useSession()` is a client-side fetch to `/api/auth/get-session` — works identically in CSR. The cookie is set by the API (same registrable domain), browser sends it on every request to either origin. SSR would only matter if we wanted server-rendered auth gating, which a club app doesn't need. Note for the future: if we add per-club SSR for SEO of ride listings, that's a separate refactor.

---

## Phase 2C — Cutover

Pre-flight:

1. Verify Phase 2A merged to a deployable state (still on `feat/better-auth`).
2. Verify Phase 2B working against the dual-auth API in test (`app.fairhursts.net` exercising signup, login, password reset, join-another-club, ride list, super-admin actions).
3. Resend account set up, domain DKIM/SPF/DMARC verified.
4. Take Supabase backup. Note PITR cutover timestamp.

Cutover day:

1. Switch `EMAIL_PROVIDER=resend` on the test API. Sanity-check one reset email arrives.
2. Bulk-send password reset emails to every existing user. Script:
   ```sql
   SELECT email FROM users WHERE email IS NOT NULL;
   ```
   For each, call `auth.api.requestPasswordReset({ body: { email, redirectTo: "https://app.fairhursts.net/c/bcc/reset-password" } })`.
3. Announce in club Slack/email: "We've changed how login works. Check your email for a password setup link."
4. Merge `feat/better-auth` → `main` on the API.
5. Auth0 endpoints on the API can stay live for the grace period (e.g. 14 days) for any user who tries to use the old frontend. They'll get a 401 from `/users/me` (no Auth0 token in better-auth code path) which will trigger a logout — they're guided to the new app.
6. DNS: keep `bcc-rides.vercel.app` (old frontend) live for the grace period. Redirect prominently to `app.fairhursts.net`. The old frontend is read-only / login-loop from the user's perspective.

Post-cutover (after 14 days or when last existing user has migrated):

1. Pull Auth0 code from API: delete `src/lib/auth0.ts`, simplify `middleware/auth.ts`, remove dual-auth branch logic.
2. Drop `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` from env.
3. Cancel Auth0 tenant subscription.
4. Decommission old frontend (delete the Vercel project pointing at `bcc-rides.vercel.app`).
5. Move `app.fairhursts.net` → future production parent. Update `COOKIE_DOMAIN` env on API, redeploy.

---

## Other things to consider

- **Password requirements**: better-auth defaults to min 8 chars. Configure to require a digit + non-alphanumeric? Don't over-engineer for a club app. Skip breach checks unless requested.
- **Rate limiting**: better-auth has built-in rate limits on login (5 attempts / minute) and password reset. Confirm defaults are sane; tune if abused.
- **Session length**: default 7 days. Adequate.
- **Account linking is OFF** (set above) — important during dual-auth to avoid auto-merging legacy auth0 accounts with new credential accounts on email match.
- **First super-admin survives the swap**: `users.isSuperAdmin` is preserved (you set it during phase 1). better-auth's user table maps to the same row.
- **2FA / passkeys**: out of scope, but better-auth has plugins. Add later if club desires.
- **GDPR right-to-delete**: better-auth has `auth.api.deleteUser`. Out of scope for this phase but worth knowing.
- **Audit log**: better-auth doesn't log sign-ins by default. Consider Postgres trigger or app-level logging on session create. Defer.
- **Email DKIM/SPF/DMARC**: required for Resend deliverability. Set up on `fairhursts.net` DNS before cutover day. Use Resend's domain-verification UI.
- **`api.fairhursts.net` is on the production VPS**: the dual-auth build deploys there too. So the "test" API isn't truly isolated — it's the same instance, just on a feature branch with `EMAIL_PROVIDER=console`. Acceptable risk because the new endpoints (`/api/auth/*`, `/signup/club/:slug`) are non-destructive and only invoked by the new frontend.
- **Public landing page `/`**: currently the existing app's home. Decide whether `/` on the new frontend redirects to BCC or shows a "pick a club" page. Recommend redirecting to `/c/bcc` until other clubs exist.
- **Existing user joining BCC after migration**: if a user gets the password reset email, sets a password, and lands on `/c/bcc/rides`, they're a member because they were in `user_clubs(bcc, …)` from phase 1. No friction.
- **New user signing up at BCC**: visits `/c/bcc` → signup → verify email → joins BCC as USER. Future LEADER/ADMIN promotion via club ADMIN's existing `PATCH /clubs/bcc/members/:userId`.
- **Robots.txt / SEO**: club signup pages should be indexable so people can find them. Make sure `noindex` isn't on the new frontend.
- **Mobile/PWA detection**: current `useRefreshTokensFallback` code in `Providers.tsx` is Auth0-specific. Dropped entirely.
- **Vercel preview deployments of the new frontend**: each PR preview gets a `*.vercel.app` URL. For dev convenience set `BETTER_AUTH_URL` and CORS to accept the preview domain, or accept that previews log in only via test instance pointing at the live API.

---

## Verification

End-to-end manual on test instance (`app.fairhursts.net` + `api.fairhursts.net` on feature branch):

- [ ] Visit `/c/bcc` unauthenticated → ride list loads (public).
- [ ] `/c/bcc/signup` with `console` email → check API logs for verification URL → click → land on verify page → success → redirected to login.
- [ ] Login → cookie set (devtools: `.fairhursts.net` domain, Secure, SameSite=Lax) → redirected to `/c/bcc/rides`.
- [ ] Authed actions: join ride, create ride (as LEADER), all expected role gates fire.
- [ ] `useSession()` returns the user record including `role: "ADMIN"` (compat field) and `clubs: [{clubId: "bcc", role: "ADMIN"}]`.
- [ ] Logout → cookie cleared → redirected to login.
- [ ] Forgot password → email logged → click → reset page → new password → log in.
- [ ] Second user signs up at `/c/bcc/signup` → exists with USER role in BCC.
- [ ] Same user visits `/c/<other-slug>` (create a second club for the test) → sees "Join this club" → joins → user_clubs gains row.
- [ ] Same user tries to spoof `X-Club-Id` from devtools to bypass membership → 403.
- [ ] Old Auth0 frontend (`bcc-rides.vercel.app`) still works against same API (Auth0 path) → confirms dual-auth window is safe.
- [ ] Super-admin: visit `/c/<any-slug>` → bypasses membership check → role=ADMIN in payload.
- [ ] Pre-cutover smoke: API tests pass (`bun test`), lint clean, types clean.

End-to-end on production day:

- [ ] Resend deliverability test (send to your own email; not in spam).
- [ ] Reset email to one canary user; observe full set-password → login → ride list flow.
- [ ] Send to remaining users in batches.
- [ ] Monitor logs for auth failures > baseline rate.

---

## Files to touch (high-confidence list)

### API (`rides-api`, branch `feat/better-auth`)

- `src/lib/auth.ts` — NEW (better-auth init)
- `src/lib/auth0.ts` — kept; removed post-cutover
- `src/middleware/auth.ts` — dual-auth try-better-then-auth0
- `src/middleware/club.ts` — unchanged
- `src/index.ts` — mount better-auth handler, CORS update, env vars
- `src/db/schema/index.ts` — session/account/verification reshape
- `src/routes/signup.ts` — NEW
- `src/routes/clubs.ts` — `POST /clubs/:slug/join` added
- `src/routes/users.ts` — possibly remove the compat `role` field once the new frontend ships
- `src/routes/generate.ts` — dual-auth path
- `drizzle/0014_drop_legacy_auth_tables.sql` — NEW
- `drizzle/0015_better_auth_tables.sql` — NEW (from `@better-auth/cli generate`)
- `drizzle/meta/_journal.json` — entries 14, 15
- `src/lib/__tests__/auth.test.ts` — NEW
- `src/routes/__tests__/signup.test.ts` — NEW
- `src/routes/__tests__/authorization.test.ts` — adapt mocks
- `src/middleware/__tests__/provisioning.test.ts` — deprecated; deleted post-cutover

### Frontend (NEW repo `bcc-rides-v2`)

- All of `src/` written from scratch but copying:
  - Component library (rides cards, forms, layout)
  - Type definitions
  - Most route handlers (refactored for `/c/:slug/...`)
- `src/lib/auth.ts` — NEW (better-auth client)
- `src/lib/api.ts` — credentials-include fetch wrapper
- `src/hooks/useSession.ts` — better-auth-based
- `src/hooks/useApiClient.ts` — drops token, adds X-Club-Id
- `src/hooks/useClubSlug.ts` — NEW (reads from route params)
- `src/routes/c.$slug.*` — new route tree
- `src/routes/c.$slug.login.tsx` — NEW
- `src/routes/c.$slug.signup.tsx` — NEW
- `src/routes/c.$slug.forgot-password.tsx` — NEW
- `src/routes/c.$slug.reset-password.tsx` — NEW
- `src/routes/c.$slug.verify-email.tsx` — NEW
- `src/routes/c.$slug.join.tsx` — NEW (existing user)
- `src/components/Providers.tsx` — no Auth0Provider
- `vite.config.ts` — same (CSR `spa: { enabled: true }`)
- `vercel.json` — same
- `package.json` — drops `@auth0/auth0-react`, adds `better-auth`

---

## Unresolved questions

- Pick a name for the new frontend repo.
- Final production parent domain — when known, factor into the Phase 2C DNS flip.
- Whether to keep `/users/me` compat `role` field after old frontend dies, or remove it in a post-cutover cleanup PR.
- Whether `/signup/club/:slug` should also require an invite code (defence against bots) or rely on email verification only.
- Welcome email content — better-auth's email is just the verification link. Send a richer welcome email post-verification?
- Whether to deprecate `API_KEY` super-admin auth for `/generate` etc. now that we have better-auth sessions, or keep both indefinitely for cron headless callers.
