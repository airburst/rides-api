import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { routes } from "../db/schema/index.js";
import {
  computeDistanceKm,
  generateMapImage,
  parseGpxCoords,
} from "../lib/maps.js";
import {
  authMiddleware,
  optionalAuth,
  requireRole,
  type AuthUser,
} from "../middleware/auth.js";

export const routesRouter = new Hono<{ Variables: { user?: AuthUser } }>();

// ---- Routes ----

// GET /routes - List all routes (gpx excluded from response)
routesRouter.get("/", optionalAuth, async (c) => {
  try {
    const result = await db.query.routes.findMany({
      columns: {
        id: true,
        name: true,
        distance: true,
        externalUrl: true,
        mapImageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(routes.createdAt)],
    });
    return c.json({ routes: result });
  } catch (error) {
    console.error("Error fetching routes:", error);
    return c.json({ error: "Failed to fetch routes" }, 500);
  }
});

// GET /routes/:id - Single route (includes gpx)
routesRouter.get("/:id", optionalAuth, async (c) => {
  const id = c.req.param("id");
  try {
    const route = await db.query.routes.findFirst({
      where: eq(routes.id, id),
    });
    if (!route) return c.json({ error: "Route not found" }, 404);
    return c.json({ route });
  } catch (error) {
    console.error("Error fetching route:", error);
    return c.json({ error: "Failed to fetch route" }, 500);
  }
});

// POST /routes - Create a new route
routesRouter.post(
  "/",
  authMiddleware,
  requireRole("LEADER", "ADMIN"),
  async (c) => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Invalid form data" }, 400);
    }

    const name = formData.get("name");
    const gpxFile = formData.get("gpx");
    const externalUrl = formData.get("externalUrl");

    if (!name || typeof name !== "string" || name.trim() === "") {
      return c.json({ error: "name is required" }, 400);
    }
    if (!gpxFile || !(gpxFile instanceof File)) {
      return c.json({ error: "gpx file is required" }, 400);
    }

    const id = crypto.randomUUID();
    try {
      const gpxText = await gpxFile.text();
      const coords = parseGpxCoords(gpxText);
      if (coords.length < 2) {
        return c.json(
          { error: "GPX file contains insufficient track points" },
          400,
        );
      }

      const distance = computeDistanceKm(coords);
      const mapImageUrl = await generateMapImage(coords, id);
      const cleanExternalUrl =
        typeof externalUrl === "string" ? externalUrl : null;

      await db.insert(routes).values({
        id,
        name: name.trim(),
        distance,
        externalUrl: cleanExternalUrl,
        gpx: gpxText,
        mapImageUrl,
      });

      return c.json(
        {
          route: {
            id,
            name: name.trim(),
            distance,
            externalUrl: cleanExternalUrl,
            mapImageUrl,
          },
        },
        201,
      );
    } catch (error) {
      console.error("Error creating route:", error);
      return c.json({ error: "Failed to create route" }, 500);
    }
  },
);

// PUT /routes/:id - Update a route
routesRouter.put(
  "/:id",
  authMiddleware,
  requireRole("LEADER", "ADMIN"),
  async (c) => {
    const id = c.req.param("id");

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Invalid form data" }, 400);
    }

    try {
      const existing = await db.query.routes.findFirst({
        where: eq(routes.id, id),
        columns: { id: true },
      });
      if (!existing) return c.json({ error: "Route not found" }, 404);

      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      const name = formData.get("name");
      if (typeof name === "string" && name.trim() !== "") {
        updateData.name = name.trim();
      }

      const externalUrl = formData.get("externalUrl");
      if (typeof externalUrl === "string") {
        updateData.externalUrl = externalUrl;
      }

      const gpxFile = formData.get("gpx");
      if (gpxFile instanceof File) {
        const gpxText = await gpxFile.text();
        const coords = parseGpxCoords(gpxText);
        if (coords.length < 2) {
          return c.json(
            { error: "GPX file contains insufficient track points" },
            400,
          );
        }
        updateData.gpx = gpxText;
        updateData.distance = computeDistanceKm(coords);
        updateData.mapImageUrl = await generateMapImage(coords, id);
      }

      await db.update(routes).set(updateData).where(eq(routes.id, id));
      return c.json({ success: true, id });
    } catch (error) {
      console.error("Error updating route:", error);
      return c.json({ error: "Failed to update route" }, 500);
    }
  },
);

// DELETE /routes/:id - Delete a route
routesRouter.delete(
  "/:id",
  authMiddleware,
  requireRole("LEADER", "ADMIN"),
  async (c) => {
    const id = c.req.param("id");
    try {
      const existing = await db.query.routes.findFirst({
        where: eq(routes.id, id),
        columns: { id: true },
      });
      if (!existing) return c.json({ error: "Route not found" }, 404);

      await db.delete(routes).where(eq(routes.id, id));
      return c.json({ success: true, id });
    } catch (error) {
      console.error("Error deleting route:", error);
      return c.json({ error: "Failed to delete route" }, 500);
    }
  },
);
