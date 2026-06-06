import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import pkg from "../package.json" with { type: "json" };
import { sqlClient } from "./db/index.js";
import { auth } from "./lib/auth.js";
import { closeRedisConnection, getRedisClient } from "./lib/cache.js";
import { env } from "./lib/env.js";
import { archiveRouter } from "./routes/archive.js";
import { clubsRouter } from "./routes/clubs.js";
import { generateRouter } from "./routes/generate.js";
import { repeatingRidesRouter } from "./routes/repeating-rides.js";
import { riderhqRouter } from "./routes/riderhq.js";
import { ridesRouter } from "./routes/rides.js";
import { signupRouter } from "./routes/signup.js";
import { usersRouter } from "./routes/users.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      const isLocalhostOrigin = /^http:\/\/localhost:\d+$/.test(origin);
      const allowLocalhostInProd = env("ALLOW_LOCALHOST_ORIGIN_IN_PROD");
      const allowed = [
        "https://bcc-rides.vercel.app",
        "https://app.fairhursts.net",
      ];
      if (allowed.includes(origin)) return origin;
      // Any localhost port in development. In production this is explicit opt-in.
      if (
        isLocalhostOrigin &&
        (env("NODE_ENV") === "development" || allowLocalhostInProd)
      ) {
        return origin;
      }
      // Allow Vercel preview deployments
      if (
        /^https:\/\/bcc-rides-.*-airbursts-projects\.vercel\.app$/.test(origin)
      ) {
        return origin;
      }
      return null;
    },
    credentials: true,
  }),
);

// Static file serving
app.use("/avatars/*", serveStatic({ root: "./public" }));

// Routes
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/signup", signupRouter);
app.route("/rides", ridesRouter);
app.route("/users", usersRouter);
app.route("/repeating-rides", repeatingRidesRouter);
app.route("/clubs", clubsRouter);
app.route("/generate", generateRouter);
app.route("/archive", archiveRouter);
app.route("/riderhq", riderhqRouter);

// Health check
app.get("/health", async (c) => {
  const redisClient = await getRedisClient();

  const redisStatus = redisClient?.isOpen ? "connected" : "disconnected";

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: pkg.version,
    cache: {
      enabled: env("CACHE_ENABLED"),
      redis: redisStatus,
    },
  });
});

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = env("PORT");
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });

console.info(`Starting server on port ${port}...`);
console.info(`Server running on http://localhost:${port}`);

async function shutdown() {
  console.info("Shutting down...");
  server.close();
  await closeRedisConnection();
  await sqlClient.end();
  console.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
