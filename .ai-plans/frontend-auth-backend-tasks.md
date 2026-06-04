# Backend Tasks for Frontend Auth Integration

## Context

The frontend is adding custom signup/login/reset screens for better-auth. Two backend changes are needed to support the full flow.

---

## 1. Fix callbackURL in signup.ts

**File:** `src/routes/signup.ts` (line 65)

The callbackURL currently points to the frontend origin root. After verification, users should land on `/auth/verified` in the frontend app.

**Change:**

```typescript
// Before
const origin = c.req.header("origin") ?? env("APP_URL") ?? "/";
await auth.api.signUpEmail({
  body: { email, password, name, callbackURL: origin },

// After
const origin = c.req.header("origin") ?? env("APP_URL") ?? "";
await auth.api.signUpEmail({
  body: { email, password, name, callbackURL: `${origin}/auth/verified` },
```

---

## 2. Add sendResetPassword to auth.ts

**File:** `src/lib/auth.ts`

The `emailAndPassword` config needs a `sendResetPassword` callback for the forgot-password flow. Same pattern as `sendVerificationEmail`.

**Change:** Add to `emailAndPassword` block:

```typescript
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  sendResetPassword: async ({ user, url }) => {
    if (env("EMAIL_PROVIDER") === "resend") {
      const resend = new Resend(env("RESEND_API_KEY"));
      const { error } = await resend.emails.send({
        from: env("EMAIL_FROM"),
        to: user.email,
        subject: "Reset your password",
        html: `<a href="${url}">Click here to reset your password</a>`,
      });
      if (error) throw new Error(`Resend error: ${error.message}`);
      return;
    }
    console.info(`[AUTH:RESET] ${user.email} → ${url}`);
  },
},
```

---

## Verification

- `bun run check-types` passes
- Test signup: email link now redirects to `<origin>/auth/verified`
- Test forgot-password: `POST /api/auth/request-password-reset` no longer returns "Reset password isn't enabled"
