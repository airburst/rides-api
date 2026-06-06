import type { Context } from "hono";
import { createFactory } from "hono/factory";
import {
  checkRateLimit,
  clearFailedLogins,
  isAccountLocked,
  trackFailedLogin,
} from "../lib/cache.js";
import { env } from "../lib/env.js";

interface Env {
  Variables: {
    loginProtection?: {
      trackFailedLogin: typeof trackFailedLogin;
      clearFailedLogins: typeof clearFailedLogins;
      isAccountLocked: typeof isAccountLocked;
    };
    email?: string;
  };
}

const factory = createFactory<Env>();
const cacheEnabled = env("CACHE_ENABLED");

function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

// Rate limiting middleware
export const apiRateLimit = factory.createMiddleware(async (c, next) => {
  if (!cacheEnabled) {
    await next();
    return;
  }

  const ip = getClientIp(c);
  const { allowed, remaining, resetAt } = await checkRateLimit(
    `api:${ip}`,
    100, // 100 requests
    60, // per 60 seconds
  );

  c.header("X-RateLimit-Limit", "100");
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

  if (!allowed) {
    return c.json({ error: "Rate limit exceeded. Too many requests." }, 429);
  }

  await next();
});

// Strict rate limiting for login attempts
export const loginRateLimit = factory.createMiddleware(async (c, next) => {
  if (!cacheEnabled) {
    await next();
    return;
  }

  const ip = getClientIp(c);
  const { allowed, remaining, resetAt } = await checkRateLimit(
    `login:${ip}`,
    5, // 5 attempts
    15 * 60, // per 15 minutes
  );

  c.header("X-RateLimit-Limit", "5");
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

  if (!allowed) {
    return c.json(
      {
        error: "Too many login attempts. Please try again in 15 minutes.",
        retryAt: Math.ceil(resetAt / 1000),
      },
      429,
    );
  }

  await next();
});

// Check failed logins and track failures
export const loginProtection = factory.createMiddleware(async (c, next) => {
  if (!cacheEnabled) {
    await next();
    return;
  }

  c.set("loginProtection", {
    trackFailedLogin,
    clearFailedLogins,
    isAccountLocked,
  });

  await next();
});

// Verify account is not locked
export const checkAccountLock = factory.createMiddleware(async (c, next) => {
  if (!cacheEnabled) {
    await next();
    return;
  }

  const email = c.req.query("email")?.toLowerCase();

  if (!email) {
    return c.json({ error: "Email parameter required" }, 400);
  }

  if (await isAccountLocked(email)) {
    return c.json(
      {
        error:
          "Account temporarily locked due to too many failed login attempts. Please try again in 15 minutes.",
        locked: true,
      },
      429,
    );
  }

  c.set("email", email);
  await next();
});
