import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";

const redisUrl = env("REDIS_URL");
const cacheEnabled = env("CACHE_ENABLED");
const cacheTtl = env("CACHE_TTL") || 300; // Default to 5 minutes

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!cacheEnabled) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = createClient({ url: redisUrl });

    redisClient.on("error", (err: Error) => {
      console.error("Redis Client Error:", err);
    });

    await redisClient.connect();
    console.info("✅ Redis connected successfully");

    return redisClient;
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    redisClient = null;
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = await getRedisClient();
    if (!client) return null;

    const cached = await client.get(key);
    if (cached) {
      console.info(`[CACHE HIT] ${key}`);
      return JSON.parse(cached) as T;
    }

    console.info(`[CACHE MISS] ${key}`);
    return null;
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttl: number = cacheTtl,
): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;

    await client.setEx(key, ttl, JSON.stringify(value));
    console.info(`[CACHE SET] ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
  }
}

export async function cacheInvalidate(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;

    await client.del(key);
    console.info(`[CACHE INVALIDATE] ${key}`);
  } catch (error) {
    console.error(`Cache invalidate error for key ${key}:`, error);
  }
}

export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;

    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
      console.info(
        `[CACHE INVALIDATE PATTERN] ${pattern} (${keys.length} keys)`,
      );
    }
  } catch (error) {
    console.error(`Cache invalidate pattern error for ${pattern}:`, error);
  }
}

export function buildCacheKey(
  type: "list" | "detail",
  clubId: string,
  params: Record<string, string | number | undefined>,
): string {
  if (type === "list") {
    const { date = "all", limit = "50", offset = "0" } = params;
    return `rides:${clubId}:list:${date}:${limit}:${offset}`;
  }

  // type === "detail"
  const { rideId } = params;
  return `rides:${clubId}:detail:${String(rideId)}`;
}

export function clubCachePattern(clubId: string): string {
  return `rides:${clubId}:*`;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.info("Redis connection closed");
  }
}

// Auth & Security: Failed login tracking (gated on cacheEnabled)
export async function trackFailedLogin(
  email: string,
  ip: string,
): Promise<number> {
  if (!cacheEnabled) return 0; // No-op if Redis disabled

  try {
    const client = await getRedisClient();
    if (!client) return 0;

    const key = `auth:failed-login:${email}`;
    const attempts = await client.incr(key);

    // Set 15-minute expiry on first attempt
    if (attempts === 1) {
      await client.expire(key, 15 * 60);
    }

    console.warn(
      `[AUTH] Failed login for ${email} from ${ip} (attempt ${attempts})`,
    );
    return attempts;
  } catch (error) {
    console.error(`Failed login tracking error for ${email}:`, error);
    return 0;
  }
}

export async function getFailedLoginAttempts(email: string): Promise<number> {
  if (!cacheEnabled) return 0; // No-op if Redis disabled

  try {
    const client = await getRedisClient();
    if (!client) return 0;

    const key = `auth:failed-login:${email}`;
    const attempts = await client.get(key);
    return attempts ? parseInt(attempts, 10) : 0;
  } catch (error) {
    console.error(`Get failed login attempts error for ${email}:`, error);
    return 0;
  }
}

export async function isAccountLocked(email: string): Promise<boolean> {
  if (!cacheEnabled) return false; // No-op if Redis disabled

  const attempts = await getFailedLoginAttempts(email);
  return attempts >= 5;
}

export async function clearFailedLogins(email: string): Promise<void> {
  if (!cacheEnabled) return; // No-op if Redis disabled

  try {
    const client = await getRedisClient();
    if (!client) return;

    const key = `auth:failed-login:${email}`;
    await client.del(key);
    console.info(`[AUTH] Cleared failed login counter for ${email}`);
  } catch (error) {
    console.error(`Clear failed login error for ${email}:`, error);
  }
}

// Rate limiting (gated on cacheEnabled)
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  // If Redis disabled, allow all requests (no-op)
  if (!cacheEnabled) {
    return {
      allowed: true,
      remaining: limit,
      resetAt: Date.now() + windowSeconds * 1000,
    };
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      // If Redis unavailable, allow request (fail open)
      return {
        allowed: true,
        remaining: limit,
        resetAt: Date.now() + windowSeconds * 1000,
      };
    }

    const rateKey = `ratelimit:${key}`;
    const current = await client.incr(rateKey);

    if (current === 1) {
      await client.expire(rateKey, windowSeconds);
    }

    const ttl = await client.ttl(rateKey);
    const resetAt = Date.now() + ttl * 1000;
    const allowed = current <= limit;

    if (!allowed) {
      console.warn(
        `[RATELIMIT] Limit exceeded for ${key} (${current}/${limit})`,
      );
    }

    return {
      allowed,
      remaining: Math.max(0, limit - current),
      resetAt,
    };
  } catch (error) {
    console.error(`Rate limit check error for ${key}:`, error);
    // Fail open on error
    return {
      allowed: true,
      remaining: limit,
      resetAt: Date.now() + windowSeconds * 1000,
    };
  }
}
