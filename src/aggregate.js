// Phase 2 — Aggregations.
// Load all normalized records and group them along the axes the dashboard needs:
// time (hour/day/week), project, thread (session), model. Each bucket carries the
// four token types plus raw and weighted totals.
import { parseFile } from "./parser.js";
import { resolveProjectsDir, listSessions, prettyProject } from "./projects.js";
import { weightedTotal, rawTotal } from "./weights.js";

function emptyBucket() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, raw: 0, weighted: 0, count: 0 };
}

function addRecord(bucket, r) {
  bucket.input += r.input;
  bucket.output += r.output;
  bucket.cacheWrite += r.cacheWrite;
  bucket.cacheRead += r.cacheRead;
  bucket.raw += rawTotal(r);
  bucket.weighted += weightedTotal(r);
  bucket.count += 1;
}

// Bucket an ISO timestamp by granularity → a sortable key string.
export function timeKey(iso, granularity) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (granularity === "hour") {
    const h = String(d.getUTCHours()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:00`;
  }
  if (granularity === "week") {
    // ISO-ish: key by the Monday of the week.
    const tmp = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
    const dow = (tmp.getUTCDay() + 6) % 7; // Mon=0
    tmp.setUTCDate(tmp.getUTCDate() - dow);
    return `${tmp.getUTCFullYear()}-${String(tmp.getUTCMonth() + 1).padStart(2, "0")}-${String(
      tmp.getUTCDate()
    ).padStart(2, "0")} (wk)`;
  }
  return `${y}-${m}-${day}`; // day (default)
}

// Load every record across all sessions, tagging each with its project label.
export async function loadAllRecords({ projectsDir } = {}) {
  const dir = projectsDir || resolveProjectsDir();
  if (!dir) return { dir: null, records: [] };
  const sessions = listSessions(dir);
  const all = [];
  for (const { project, files } of sessions) {
    for (const file of files) {
      const recs = await parseFile(file, { project });
      // Prefer the authoritative cwd from each record; fall back to folder decode.
      for (const r of recs) r.project = prettyProject(r.cwd) || project;
      all.push(...recs);
    }
  }
  return { dir, records: all };
}

// Build all aggregations the API/UI consume, honoring filters.
export function aggregate(records, { granularity = "day", includeSidechains = true } = {}) {
  const byTime = new Map();
  const byProject = new Map();
  const byThread = new Map();
  const byModel = new Map();
  const totals = emptyBucket();
  const models = new Set();
  const projects = new Set();
  let minTs = null;
  let maxTs = null;

  for (const r of records) {
    if (!includeSidechains && r.isSidechain) continue;
    models.add(r.model);
    projects.add(r.project);
    if (r.timestamp) {
      if (!minTs || r.timestamp < minTs) minTs = r.timestamp;
      if (!maxTs || r.timestamp > maxTs) maxTs = r.timestamp;
    }

    const tKey = timeKey(r.timestamp, granularity);
    if (!byTime.has(tKey)) byTime.set(tKey, emptyBucket());
    addRecord(byTime.get(tKey), r);

    if (!byProject.has(r.project)) byProject.set(r.project, emptyBucket());
    addRecord(byProject.get(r.project), r);

    if (!byThread.has(r.sessionId)) byThread.set(r.sessionId, { project: r.project, first: null, last: null, ...emptyBucket() });
    const tb = byThread.get(r.sessionId);
    addRecord(tb, r);
    if (r.timestamp) {
      if (!tb.first || r.timestamp < tb.first) tb.first = r.timestamp;
      if (!tb.last || r.timestamp > tb.last) tb.last = r.timestamp;
    }

    if (!byModel.has(r.model)) byModel.set(r.model, emptyBucket());
    addRecord(byModel.get(r.model), r);

    addRecord(totals, r);
  }

  const sortedTime = [...byTime.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, v]) => ({ key, ...v }));

  return {
    totals,
    timeSeries: sortedTime,
    byProject: [...byProject.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.weighted - a.weighted),
    byThread: [...byThread.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.weighted - a.weighted),
    byModel: [...byModel.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.weighted - a.weighted),
    meta: {
      models: [...models].sort(),
      projects: [...projects].sort(),
      dateRange: { min: minTs, max: maxTs },
      recordCount: records.length,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { dir, records } = await loadAllRecords();
  console.log("projects dir:", dir);
  const agg = aggregate(records, { granularity: "day" });
  console.log("records:", agg.meta.recordCount);
  console.log("models:", agg.meta.models);
  console.log("date range:", agg.meta.dateRange);
  console.log(
    "TOTAL  raw:",
    agg.totals.raw.toLocaleString(),
    " weighted:",
    Math.round(agg.totals.weighted).toLocaleString(),
    ` (raw is ${(agg.totals.raw / agg.totals.weighted).toFixed(1)}x the weighted)`
  );
  console.log("\nby project (weighted):");
  for (const p of agg.byProject) {
    console.log(`  ${Math.round(p.weighted).toLocaleString().padStart(12)}  ${p.key}`);
  }
}
