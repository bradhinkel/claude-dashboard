/* sample-data.js
 * Synthetic but internally-consistent sample payload for the Claude Code Token
 * Dashboard. Mirrors the exact JSON contract your local server should return
 * from GET /api/usage (see README "Data contract"). Lets the UI run with zero
 * backend — open index.html and it renders.
 *
 * Replace window.USAGE_SAMPLE with a real fetch('/api/usage') in production.
 *
 * Every bucket carries the FOUR raw token-type counts AND the FOUR weighted
 * (input-equivalent) contributions. The server computes `weighted` per record
 * using real per-model pricing; here we reconstruct it from documented weights
 * so totals reconcile with the source export:
 *   raw total      199,843,620
 *   weighted total  56,132,993   (3.6x inflation, driven by cache reads)
 */
(function () {
  // Default token-type weights, relative to an input token. Editable config on
  // the server (Sonnet-class ratios). Cache reads bill ~0.1x; output ~5x.
  const WEIGHTS = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
  // How the non-cache (productive) raw tokens split across the three types.
  const PROD = { input: 0.15, output: 0.45, cacheWrite: 0.40 };

  // Solve a bucket's four token-type counts from its authoritative raw &
  // weighted totals, honoring its own raw/weighted multiple.
  //   weighted = 2.9*(raw - cacheRead) + 0.1*cacheRead  =>  cacheRead below
  function splitBucket(rawTotal, weightedTotal) {
    let cacheRead = Math.round((2.9 * rawTotal - weightedTotal) / 2.8);
    cacheRead = Math.max(0, Math.min(cacheRead, rawTotal - 4));
    const n = rawTotal - cacheRead;
    const raw = {
      input: Math.round(n * PROD.input),
      output: Math.round(n * PROD.output),
      cacheWrite: Math.round(n * PROD.cacheWrite),
      cacheRead,
    };
    const weighted = {
      input: Math.round(raw.input * WEIGHTS.input),
      output: Math.round(raw.output * WEIGHTS.output),
      cacheWrite: Math.round(raw.cacheWrite * WEIGHTS.cacheWrite),
      cacheRead: Math.round(raw.cacheRead * WEIGHTS.cacheRead),
    };
    return { raw, weighted };
  }
  const addInto = (acc, o) => { for (const k in o) acc[k] = (acc[k] || 0) + o[k]; return acc; };

  // ---- Projects (authoritative raw + weighted totals; sum to grand totals) ----
  const projectDefs = [
    { name: 'weather-station',  raw: 157348480, weighted: 32299090, sessions: 4, messages: 996, color: '#C96442' },
    { name: 'Praxium',          raw: 26335365,  weighted: 19368767, sessions: 2, messages: 261, color: '#1F6F6B' },
    { name: 'pdf_tts',          raw: 9159911,   weighted: 2236706,  sessions: 1, messages: 137, color: '#B5862E' },
    { name: 'claude-dashboard', raw: 6999864,   weighted: 2228430,  sessions: 2, messages: 155, color: '#5B6FA8' },
  ];
  const projects = projectDefs.map((p) => ({ ...p, ...splitBucket(p.raw, p.weighted) }));

  // Grand totals — authoritative per-type counts from the source export, so the
  // headline tiles read exactly (output 4.94M, cache reads 188.6M, raw 199.8M,
  // weighted 56.1M). Per-project splits above are approximate by comparison.
  const totals = {
    raw:      { input: 1_300_000,  output: 4_943_300,  cacheWrite: 5_007_027, cacheRead: 188_593_293 },
    weighted: { input: 3_014_880,  output: 28_000_000, cacheWrite: 6_258_784, cacheRead: 18_859_329 },
  };

  // ---- Threads (one conversation each) ----
  const threadDefs = [
    { project: 'Praxium',          session: '75a03b8b', started: 'May 29', span: '31m', raw: 19520864, weighted: 18060983, messages: 121 },
    { project: 'weather-station',  session: '09560acc', started: 'May 06', span: '20h', raw: 85455064, weighted: 16107943, messages: 439 },
    { project: 'weather-station',  session: 'e7783ae0', started: 'May 14', span: '4d',  raw: 70088228, weighted: 15489959, messages: 515 },
    { project: 'pdf_tts',          session: 'ab5f62ee', started: 'May 29', span: '2h',  raw: 9159911,  weighted: 2236706,  messages: 137 },
    { project: 'claude-dashboard', session: '3d5cdd4a', started: 'May 31', span: '26m', raw: 4656880,  weighted: 1524971,  messages: 97 },
    { project: 'Praxium',          session: '24d0a9a3', started: 'May 29', span: '1h',  raw: 6814501,  weighted: 1307784,  messages: 140 },
    { project: 'claude-dashboard', session: '6269e46e', started: 'May 31', span: '10m', raw: 2342984,  weighted: 703459,   messages: 58 },
    { project: 'weather-station',  session: '8a0d88aa', started: 'May 12', span: '3h',  raw: 1753564,  weighted: 658766,   messages: 40 },
    { project: 'weather-station',  session: '816cf878', started: 'May 18', span: '1s',  raw: 51624,    weighted: 42422,    messages: 2 },
  ];
  const threads = threadDefs.map((t) => ({ ...t, ...splitBucket(t.raw, t.weighted) }));

  // ---- Models (split grand totals by share) ----
  const modelDefs = [
    { name: 'claude-sonnet-4-5', share: 0.882 },
    { name: 'claude-opus-4-1',   share: 0.093 },
    { name: 'claude-haiku-4-5',  share: 0.025 },
  ];
  const scaleObj = (o, k) => Object.fromEntries(Object.entries(o).map(([t, v]) => [t, Math.round(v * k)]));
  const models = modelDefs.map((m) => ({
    name: m.name, share: m.share,
    raw: scaleObj(totals.raw, m.share),
    weighted: scaleObj(totals.weighted, m.share),
  }));

  // ---- Daily time series (May 06 -> Jun 01). Distribute grand totals by the
  // activity shape so the series sums back to the totals. ----
  const shape = [
    ['2026-05-06', 3790], ['2026-05-07', 2040], ['2026-05-08', 1130], ['2026-05-09', 350],
    ['2026-05-10', 266],  ['2026-05-11', 506],  ['2026-05-12', 1460], ['2026-05-13', 426],
    ['2026-05-14', 3200], ['2026-05-15', 2870], ['2026-05-16', 2400], ['2026-05-17', 2056],
    ['2026-05-18', 1265], ['2026-05-19', 232],  ['2026-05-20', 174],  ['2026-05-21', 156],
    ['2026-05-22', 217],  ['2026-05-23', 101],  ['2026-05-24', 176],  ['2026-05-25', 233],
    ['2026-05-26', 324],  ['2026-05-27', 436],  ['2026-05-28', 562],  ['2026-05-29', 6200],
    ['2026-05-30', 1182], ['2026-05-31', 3090],
  ];
  const shapeSum = shape.reduce((s, d) => s + d[1], 0);
  const series = shape.map(([date, w]) => {
    const f = w / shapeSum;
    return { date, raw: scaleObj(totals.raw, f), weighted: scaleObj(totals.weighted, f) };
  });

  window.USAGE_SAMPLE = {
    meta: {
      projectsDir: '/home/bradhinkel/.claude/projects',
      messages: 1549,
      rangeStart: '2026-05-06',
      rangeEnd: '2026-06-01',
      generatedAt: new Date().toISOString(),
      estimated: true,
    },
    weights: WEIGHTS,
    totals,
    series,
    projects,
    threads,
    models,
  };
})();
