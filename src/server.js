// Phase 3 — Local server.
// Binds to localhost ONLY (127.0.0.1) and serves aggregated token JSON plus the
// static dashboard. Never serves or transmits message bodies — only aggregates.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, ingestAll, loadRecords, resolveDbPath } from "./db.js";
import { buildPayload } from "./payload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
// Bind to loopback by default (security: localhost only). Set HOST=0.0.0.0 when
// running inside WSL so a browser on the Windows host can reach it via localhost
// forwarding — WSL's relay targets the distro's eth0 IP, not its loopback.
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 4317;

// Phase 6: records live in SQLite. Boot (and /api/refresh) run an incremental
// ingest — new/changed files only — then load from the DB. Unchanged files are
// skipped, so the second launch is fast.
const db = openDb();
let cache = { dir: null, records: [] };
async function reload() {
  const summary = await ingestAll({ db, log: (m) => console.log("  ingest:", m) });
  cache = { dir: summary.dir, records: loadRecords(db) };
  return cache;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

async function serveStatic(res, urlPath) {
  // Resolve safely inside PUBLIC_DIR (no path traversal).
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === "/api/usage") {
    // Phase 7: return the full visual-redesign contract. Filtering (project/model)
    // and day/week granularity are handled client-side by the dashboard.
    return sendJSON(res, 200, buildPayload(cache.records, { dir: cache.dir }));
  }

  if (url.pathname === "/api/refresh") {
    await reload();
    return sendJSON(res, 200, { ok: true, records: cache.records.length, dir: cache.dir });
  }

  return serveStatic(res, url.pathname);
});

await reload();
server.listen(PORT, HOST, () => {
  console.log(`Claude token dashboard → http://${HOST}:${PORT}`);
  console.log(`  logs: ${cache.dir || "(none found)"}`);
  console.log(`  db:   ${resolveDbPath()}`);
  console.log(`  records loaded: ${cache.records.length}`);
});
