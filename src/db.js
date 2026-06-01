// Phase 6 — SQLite persistence (the ETL layer).
//
// Through Phase 5 the server re-parsed every JSONL on each boot. Here we ingest
// once into SQLite and query from it, skipping files we've already seen — so the
// second launch is fast. SQLite only (built into Node ≥22 as node:sqlite); no deps.
//
// SECURITY: unchanged from the parser — we persist ONLY usage + metadata, never
// message bodies. The DB holds the same normalized records the parser emits.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "./parser.js";
import { resolveProjectsDir, listSessions, prettyProject } from "./projects.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// DB path: env override → <project>/data/usage.db.
export function resolveDbPath() {
  return process.env.CLAUDE_DASHBOARD_DB || join(PROJECT_ROOT, "data", "usage.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  path         TEXT PRIMARY KEY,
  mtime_ms     REAL    NOT NULL,
  size         INTEGER NOT NULL,
  project      TEXT,
  session_id   TEXT,
  record_count INTEGER NOT NULL,
  ingested_at  TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  id             INTEGER PRIMARY KEY,
  file_path      TEXT    NOT NULL REFERENCES files(path) ON DELETE CASCADE,
  ts             TEXT,
  model          TEXT,
  project        TEXT,
  cwd            TEXT,
  session_id     TEXT,
  is_sidechain   INTEGER NOT NULL DEFAULT 0,
  input          INTEGER NOT NULL DEFAULT 0,
  output         INTEGER NOT NULL DEFAULT 0,
  cache_write    INTEGER NOT NULL DEFAULT 0,
  cache_write_1h INTEGER NOT NULL DEFAULT 0,
  cache_write_5m INTEGER NOT NULL DEFAULT 0,
  cache_read     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_records_ts      ON records(ts);
CREATE INDEX IF NOT EXISTS idx_records_file    ON records(file_path);
CREATE INDEX IF NOT EXISTS idx_records_project ON records(project);
`;

// Open (creating if needed) the database and ensure schema + pragmas.
export function openDb(dbPath = resolveDbPath()) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

// Incremental ETL: parse only new or changed files; skip ones whose (mtime,size)
// match what we already stored. Files that vanished from disk are pruned.
// Returns a summary for the CLI / server boot log.
export async function ingestAll({ db, projectsDir, log = () => {} } = {}) {
  const dir = projectsDir || resolveProjectsDir();
  if (!dir) return { dir: null, scanned: 0, ingested: 0, skipped: 0, pruned: 0, inserted: 0 };

  const seenFile = db.prepare("SELECT mtime_ms, size FROM files WHERE path = ?");
  const delRecords = db.prepare("DELETE FROM records WHERE file_path = ?");
  const delFile = db.prepare("DELETE FROM files WHERE path = ?");
  const upsertFile = db.prepare(
    `INSERT INTO files (path, mtime_ms, size, project, session_id, record_count, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       mtime_ms=excluded.mtime_ms, size=excluded.size, project=excluded.project,
       session_id=excluded.session_id, record_count=excluded.record_count,
       ingested_at=excluded.ingested_at`
  );
  const insRecord = db.prepare(
    `INSERT INTO records
       (file_path, ts, model, project, cwd, session_id, is_sidechain,
        input, output, cache_write, cache_write_1h, cache_write_5m, cache_read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const onDisk = new Set();
  let scanned = 0, ingested = 0, skipped = 0, inserted = 0;
  const nowIso = new Date().toISOString();

  for (const { project, files } of listSessions(dir)) {
    for (const file of files) {
      onDisk.add(file);
      scanned++;
      let st;
      try {
        st = statSync(file);
      } catch {
        continue;
      }
      const prev = seenFile.get(file);
      if (prev && prev.mtime_ms === st.mtimeMs && prev.size === st.size) {
        skipped++;
        continue; // unchanged since last ingest — skip the expensive parse
      }

      const recs = await parseFile(file, { project });
      for (const r of recs) r.project = prettyProject(r.cwd) || project;

      // Re-ingest atomically: drop this file's old rows, insert fresh, update stamp.
      db.exec("BEGIN");
      try {
        delRecords.run(file);
        // Parent row first — records carry a FK to files(path).
        upsertFile.run(file, st.mtimeMs, st.size, project, recs[0]?.sessionId ?? null, recs.length, nowIso);
        for (const r of recs) {
          insRecord.run(
            file, r.timestamp, r.model, r.project, r.cwd, r.sessionId, r.isSidechain ? 1 : 0,
            r.input, r.output, r.cacheWrite, r.cacheWrite1h, r.cacheWrite5m, r.cacheRead
          );
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      ingested++;
      inserted += recs.length;
    }
  }

  // Prune files that no longer exist on disk (records cascade-delete).
  let pruned = 0;
  const known = db.prepare("SELECT path FROM files").all();
  for (const { path } of known) {
    if (!onDisk.has(path)) {
      delFile.run(path);
      pruned++;
    }
  }

  log(`scanned ${scanned}, ingested ${ingested} (${inserted} records), skipped ${skipped}, pruned ${pruned}`);
  return { dir, scanned, ingested, skipped, pruned, inserted };
}

// Load all persisted records back into the normalized shape aggregate() expects.
export function loadRecords(db) {
  const rows = db
    .prepare(
      `SELECT ts, model, project, cwd, session_id, is_sidechain,
              input, output, cache_write, cache_write_1h, cache_write_5m, cache_read
       FROM records`
    )
    .all();
  return rows.map((r) => ({
    timestamp: r.ts,
    model: r.model,
    // Derive the label from the authoritative cwd on read, so changing the
    // grouping rule doesn't require re-ingesting. Fall back to the stored value.
    project: prettyProject(r.cwd) || r.project,
    cwd: r.cwd,
    sessionId: r.session_id,
    isSidechain: !!r.is_sidechain,
    input: r.input,
    output: r.output,
    cacheWrite: r.cache_write,
    cacheWrite1h: r.cache_write_1h,
    cacheWrite5m: r.cache_write_5m,
    cacheRead: r.cache_read,
  }));
}

// Quick stats for the boot/CLI log.
export function dbStats(db) {
  const files = db.prepare("SELECT COUNT(*) n FROM files").get().n;
  const records = db.prepare("SELECT COUNT(*) n FROM records").get().n;
  return { files, records };
}
