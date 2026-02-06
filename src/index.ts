import { serve } from "@hono/node-server";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { repeatingRidesRouter } from "./routes/repeating-rides.js";
import { ridesRouter } from "./routes/rides.js";
import { usersRouter } from "./routes/users.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        "http://localhost:3000",
        "https://bcc-rides.vercel.app",
      ];
      if (allowed.includes(origin)) return origin;
      // Allow Vercel preview deployments
      if (/^https:\/\/bcc-rides-.*-airbursts-projects\.vercel\.app$/.test(origin)) {
        return origin;
      }
      return null;
    },
    credentials: true,
  }),
);

// Routes
app.route("/rides", ridesRouter);
app.route("/users", usersRouter);
app.route("/repeating-rides", repeatingRidesRouter);

// Health check
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

console.info(`Starting server on port ${port}...`);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
console.info(`Server running on http://localhost:${port}`);
