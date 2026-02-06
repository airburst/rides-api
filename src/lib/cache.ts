// @ts-expect-error - bun:redis types not yet in bun-types
import { createClient } from "bun:redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CACHE_ENABLED = process.env.CACHE_ENABLED === "true";
const CACHE_TTL = Number.parseInt(process.env.CACHE_TTL ?? "300", 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRedisClient(): Promise<any> {
  if (!CACHE_ENABLED) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    redisClient = createClient({ url: REDIS_URL });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    redisClient.on("error", (err: Error) => {
      console.error("Redis Client Error:", err);
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const client = await getRedisClient();
    if (!client) return null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const cached = await client.get(key);
    if (cached) {
      console.info(`[CACHE HIT] ${key}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
  ttl: number = CACHE_TTL,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const client = await getRedisClient();
    if (!client) return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await client.setEx(key, ttl, JSON.stringify(value));
    console.info(`[CACHE SET] ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
  }
}

export async function cacheInvalidate(key: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const client = await getRedisClient();
    if (!client) return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await client.del(key);
    console.info(`[CACHE INVALIDATE] ${key}`);
  } catch (error) {
    console.error(`Cache invalidate error for key ${key}:`, error);
  }
}

export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const client = await getRedisClient();
    if (!client) return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const keys = await client.keys(pattern);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (keys.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await client.del(keys);
      console.info(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `[CACHE INVALIDATE PATTERN] ${pattern} (${keys.length} keys)`,
      );
    }
  } catch (error) {
    console.error(`Cache invalidate pattern error for ${pattern}:`, error);
  }
}

export function buildCacheKey(
  type: "list" | "detail",
  params: Record<string, string | number | undefined>,
): string {
  if (type === "list") {
    const { date = "all", limit = "50", offset = "0" } = params;
    return `rides:list:${date}:${limit}:${offset}`;
  }

  // type === "detail"
  const { rideId } = params;
  return `rides:detail:${String(rideId)}`;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await redisClient.quit();
    redisClient = null;
    console.info("Redis connection closed");
  }
}
