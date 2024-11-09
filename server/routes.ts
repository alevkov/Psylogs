import type { Express } from "express";
import { z } from "zod";
import { ROUTE_ALIASES } from "../client/src/lib/constants";

const doseSchema = z.object({
  substance: z.string(),
  amount: z.number(),
  route: z.string(),
  unit: z.enum(["mg", "g", "ug", "ml"]),
  timestamp: z.string().datetime(),
});

export function registerRoutes(app: Express) {
  // Health check endpoint
  app.get("/api/health", (_, res) => {
    res.json({ status: "ok" });
  });

  // Get routes reference
  app.get("/api/routes", (_, res) => {
    res.json(ROUTE_ALIASES);
  });
}
