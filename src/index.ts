import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import pkg from "../package.json" assert { type: "json" };
import { sqlClient } from "./db/index.js";
import { closeRedisConnection, getRedisClient } from "./lib/cache.js";
import { archiveRouter } from "./routes/archive.js";
import { generateRouter } from "./routes/generate.js";
import { repeatingRidesRouter } from "./routes/repeating-rides.js";
import { riderhqRouter } from "./routes/riderhq.js";
import { ridesRouter } from "./routes/rides.js";
import { usersRouter } from "./routes/users.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = ["http://localhost:3000", "https://bcc-rides.vercel.app"];
      if (allowed.includes(origin)) return origin;
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
app.route("/rides", ridesRouter);
app.route("/users", usersRouter);
app.route("/repeating-rides", repeatingRidesRouter);
app.route("/generate", generateRouter);
app.route("/archive", archiveRouter);
app.route("/riderhq", riderhqRouter);

// Health check
app.get("/health", async (c) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const redisClient = await getRedisClient();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const redisStatus = redisClient?.isOpen ? "connected" : "disconnected";

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: pkg.version,
    cache: {
      enabled: process.env.CACHE_ENABLED === "true",
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

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

console.info(`Starting server on port ${port}...`);
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
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
