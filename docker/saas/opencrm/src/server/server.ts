// Node entrypoint for the self-hosted fork. Boots the SQLite DB, applies the
// schema, then serves the upstream Hono app + the built Preact client with
// SPA fallback for client-side routing.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import app from "./index.js";
import { initDB, execSchema } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.OPENCRM_DB_PATH ?? "/data/opencrm.db";
const port = Number(process.env.OPENCRM_PORT ?? 8787);
const staticRoot = process.env.OPENCRM_STATIC_ROOT ?? "/app/dist";
const schemaPath = process.env.OPENCRM_SCHEMA_PATH ?? resolve(__dirname, "./schema.sql");

initDB(dbPath);
execSchema(readFileSync(schemaPath, "utf8"));

app.use("/*", serveStatic({ root: staticRoot }));
app.notFound((c) => {
  if (c.req.path.startsWith("/api") || c.req.path === "/openapi.json") {
    return c.json({ error: "not found" }, 404);
  }
  try {
    return c.html(readFileSync(join(staticRoot, "index.html"), "utf8"));
  } catch {
    return c.text("not found", 404);
  }
});

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
console.log(`open-crm listening on :${port}  db=${dbPath}  static=${staticRoot}`);
