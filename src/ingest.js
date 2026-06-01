// Phase 6 CLI — `npm run ingest`.
// Runs the incremental ETL into SQLite and prints what it did. Run it once;
// run it again and watch it skip everything unchanged.
import { openDb, ingestAll, dbStats, resolveDbPath } from "./db.js";

const dbPath = resolveDbPath();
const db = openDb(dbPath);

console.log("db:", dbPath);
const t0 = process.hrtime.bigint();
const summary = await ingestAll({ db, log: (m) => console.log("  " + m) });
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

if (!summary.dir) {
  console.log("no projects dir found — nothing to ingest.");
} else {
  const { files, records } = dbStats(db);
  console.log(`source: ${summary.dir}`);
  console.log(`db now holds ${records.toLocaleString()} records across ${files} files`);
  console.log(`done in ${ms.toFixed(0)} ms`);
}
db.close();
