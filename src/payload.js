// Phase 7 — serialize normalized records into the visual-redesign data contract
// (see claude-dashboard-design handoff README, "Data contract — GET /api/usage").
//
// Every bucket carries BOTH a raw type-object {input,output,cacheWrite,cacheRead}
// (token counts) AND a weighted type-object (input-equivalent contributions), so
// the client's basis toggle is a pure switch and the stacked series always has the
// four token types. Weighted is computed here with the real per-type rates,
// including the 1h/5m cache-write split.
import { WEIGHTS } from "./weights.js";

// Project bar/dot colors, applied in raw-descending rank order. The first four
// match the design handoff (terra, teal, amber, blue); the rest extend the palette.
const PALETTE = ["#C96442", "#1F6F6B", "#B5862E", "#5B6FA8", "#7A5C9E", "#3F8C6E", "#A24E32", "#8A8476"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const emptyAgg = () => ({
  input: 0, output: 0, cacheWrite: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, count: 0,
});
function add(a, r) {
  a.input += r.input;
  a.output += r.output;
  a.cacheWrite += r.cacheWrite;
  a.cacheWrite5m += r.cacheWrite5m;
  a.cacheWrite1h += r.cacheWrite1h;
  a.cacheRead += r.cacheRead;
  a.count += 1;
}
const rawObj = (a) => ({ input: a.input, output: a.output, cacheWrite: a.cacheWrite, cacheRead: a.cacheRead });
// Weighted (input-equivalent) per type. cacheWrite honors the 1h/5m rate split.
const weightedObj = (a) => ({
  input: a.input * WEIGHTS.input,
  output: a.output * WEIGHTS.output,
  cacheWrite: a.cacheWrite5m * WEIGHTS.cacheWrite5m + a.cacheWrite1h * WEIGHTS.cacheWrite1h,
  cacheRead: a.cacheRead * WEIGHTS.cacheRead,
});
const buckets = (a) => ({ raw: rawObj(a), weighted: weightedObj(a) });

// UTC day key "YYYY-MM-DD" (matches the parser's UTC timestamps).
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
const shortDate = (iso) => (iso ? `${MONTHS[new Date(iso).getUTCMonth()]} ${String(new Date(iso).getUTCDate()).padStart(2, "0")}` : "");
function span(first, last) {
  if (!first || !last) return "—";
  const ms = new Date(last) - new Date(first);
  if (ms < 60e3) return `${Math.max(1, Math.round(ms / 1e3))}s`;
  if (ms < 3600e3) return `${Math.round(ms / 60e3)}m`;
  if (ms < 86400e3) return `${Math.round(ms / 3600e3)}h`;
  return `${Math.round(ms / 86400e3)}d`;
}

export function buildPayload(records, { dir = null, generatedAt = new Date().toISOString() } = {}) {
  const totals = emptyAgg();
  const byDay = new Map();
  const byProject = new Map();
  const byModel = new Map();
  const byThread = new Map();
  let minTs = null;
  let maxTs = null;

  for (const r of records) {
    add(totals, r);

    if (r.timestamp) {
      if (!minTs || r.timestamp < minTs) minTs = r.timestamp;
      if (!maxTs || r.timestamp > maxTs) maxTs = r.timestamp;
      const dk = dayKey(r.timestamp);
      if (!byDay.has(dk)) byDay.set(dk, emptyAgg());
      add(byDay.get(dk), r);
    }

    if (!byProject.has(r.project)) byProject.set(r.project, { agg: emptyAgg(), sessions: new Set() });
    const p = byProject.get(r.project);
    add(p.agg, r);
    p.sessions.add(r.sessionId);

    if (!byModel.has(r.model)) byModel.set(r.model, emptyAgg());
    add(byModel.get(r.model), r);

    if (!byThread.has(r.sessionId)) byThread.set(r.sessionId, { agg: emptyAgg(), project: r.project, first: null, last: null });
    const t = byThread.get(r.sessionId);
    add(t.agg, r);
    if (r.timestamp) {
      if (!t.first || r.timestamp < t.first) t.first = r.timestamp;
      if (!t.last || r.timestamp > t.last) t.last = r.timestamp;
    }
  }

  // Projects, ranked by raw desc → palette assigned in rank order.
  const projects = [...byProject.entries()]
    .map(([name, v]) => ({ name, agg: v.agg, sessions: v.sessions.size }))
    .sort((a, b) => (b.agg.input + b.agg.output + b.agg.cacheWrite + b.agg.cacheRead) - (a.agg.input + a.agg.output + a.agg.cacheWrite + a.agg.cacheRead))
    .map((p, i) => ({
      name: p.name,
      sessions: p.sessions,
      messages: p.agg.count,
      color: PALETTE[i % PALETTE.length],
      ...buckets(p.agg),
    }));

  // Daily series, zero-filled from first to last day so the area chart is continuous
  // and the client's 7-day week grouping aligns to calendar weeks.
  const series = [];
  if (minTs && maxTs) {
    const start = new Date(`${dayKey(minTs)}T00:00:00Z`);
    const end = new Date(`${dayKey(maxTs)}T00:00:00Z`);
    for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      series.push({ date: dk, ...buckets(byDay.get(dk) || emptyAgg()) });
    }
  }

  const models = [...byModel.entries()]
    .map(([name, agg]) => ({ name, share: totals.count ? agg.count / totals.count : 0, ...buckets(agg) }))
    .sort((a, b) => b.share - a.share);

  const wsum = (o) => o.input + o.output + o.cacheWrite + o.cacheRead;
  const threads = [...byThread.entries()]
    .map(([sessionId, t]) => ({
      project: t.project,
      session: (sessionId || "").slice(0, 8),
      started: shortDate(t.first),
      span: span(t.first, t.last),
      messages: t.agg.count,
      ...buckets(t.agg),
    }))
    .sort((a, b) => wsum(b.weighted) - wsum(a.weighted));

  return {
    meta: {
      projectsDir: dir,
      messages: totals.count,
      rangeStart: minTs ? dayKey(minTs) : null,
      rangeEnd: maxTs ? dayKey(maxTs) : null,
      generatedAt,
      estimated: true,
    },
    // Advisory/config display; authoritative weighting is baked into the numbers above.
    weights: { input: WEIGHTS.input, output: WEIGHTS.output, cacheWrite: WEIGHTS.cacheWrite5m, cacheRead: WEIGHTS.cacheRead },
    totals: buckets(totals),
    series,
    projects,
    threads,
    models,
  };
}
