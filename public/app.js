/* app.js — Claude Code Token Dashboard
 * Renders the dashboard from the /api/usage payload (window.USAGE_SAMPLE
 * fallback). Vanilla JS + Chart.js. Swap loadData() for a real fetch in prod.
 */
(function () {
  'use strict';

  // ---------- data load ----------
  async function loadData() {
    if (window.USAGE_INLINE) return window.USAGE_INLINE; // self-contained export report
    try {
      const res = await fetch('/api/usage', { headers: { accept: 'application/json' } });
      if (res.ok) return await res.json();
    } catch (e) { /* offline / no server -> sample */ }
    return window.USAGE_SAMPLE;
  }

  // ---------- helpers ----------
  const TYPES = [
    { key: 'cacheRead',  label: 'Cache read',  varc: '--tok-cr' },
    { key: 'cacheWrite', label: 'Cache write', varc: '--tok-cw' },
    { key: 'output',     label: 'Output',      varc: '--tok-output' },
    { key: 'input',      label: 'Input',       varc: '--tok-input' },
  ]; // bottom -> top stacking order
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const sum = (o) => o.input + o.output + o.cacheWrite + o.cacheRead;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const compact = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(Math.round(n));
  };
  const el = (id) => document.getElementById(id);

  const state = { basis: 'weighted', gran: 'day', project: 'all', model: 'all' };
  let DATA, chart;

  // ---------- scope (filters) ----------
  function scope() {
    if (state.project !== 'all') {
      const p = DATA.projects.find((x) => x.name === state.project);
      if (p) return { raw: p.raw, weighted: p.weighted, messages: p.messages, share: sum(p.raw) / sum(DATA.totals.raw) };
    }
    if (state.model !== 'all') {
      const m = DATA.models.find((x) => x.name === state.model);
      if (m) return { raw: m.raw, weighted: m.weighted, messages: Math.round(DATA.meta.messages * m.share), share: m.share };
    }
    return { raw: DATA.totals.raw, weighted: DATA.totals.weighted, messages: DATA.meta.messages, share: 1 };
  }

  // ---------- series bucketing (granularity) ----------
  function buckets() {
    const sc = scope().share;
    let pts = DATA.series.map((d) => ({
      date: d.date,
      raw: scaleObj(d.raw, sc),
      weighted: scaleObj(d.weighted, sc),
    }));
    if (state.gran === 'week') {
      const weeks = [];
      for (let i = 0; i < pts.length; i += 7) {
        const grp = pts.slice(i, i + 7);
        const acc = { date: grp[0].date, raw: zero(), weighted: zero() };
        grp.forEach((g) => { addInto(acc.raw, g.raw); addInto(acc.weighted, g.weighted); });
        weeks.push(acc);
      }
      return weeks;
    }
    return pts; // day (and hour falls back to day in the sample)
  }
  const zero = () => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
  const scaleObj = (o, k) => ({ input: o.input * k, output: o.output * k, cacheWrite: o.cacheWrite * k, cacheRead: o.cacheRead * k });
  const addInto = (a, o) => { for (const k in o) a[k] += o[k]; };

  // ---------- renderers ----------
  function renderMeta() {
    el('m-dir').textContent = DATA.meta.projectsDir;
    el('m-sub').textContent = `${fmt(DATA.meta.messages)} messages · ${DATA.meta.rangeStart} → ${DATA.meta.rangeEnd}`;
    el('f-from').textContent = DATA.meta.rangeStart.slice(5).replace('-', '/');
    el('footnote').textContent =
      `${DATA.meta.rangeStart} → ${DATA.meta.rangeEnd} · Costs are estimated, weighted relative to input tokens — not billed dollars.`;
  }

  function renderHero() {
    const sc = scope();
    const w = sum(sc.weighted), r = sum(sc.raw);
    el('hero-weighted').textContent = compact(w);
    el('hero-raw').textContent = compact(r);
    el('hero-infl').textContent = (r / w).toFixed(1) + '× inflation';

    // dynamic insight from the projects
    const ranked = DATA.projects.map((p) => ({
      name: p.name, raw: sum(p.raw), weighted: sum(p.weighted), mult: sum(p.raw) / sum(p.weighted),
    }));
    const top = ranked.slice().sort((a, b) => b.raw - a.raw)[0];
    const lean = ranked.slice().sort((a, b) => a.mult - b.mult)[0];
    const gr = sum(DATA.totals.raw), gw = sum(DATA.totals.weighted);
    // Dynamic headline: lead with the single worst offender — the project that
    // wastes the most tokens to cache reads (largest raw−weighted gap, not just
    // the highest ratio, so a tiny high-multiple project can't hijack the lede).
    const worst = ranked.slice().sort((a, b) => (b.raw - b.weighted) - (a.raw - a.weighted))[0];
    el('hero-title').textContent = state.project !== 'all'
      ? `${state.project} — ${(sum(sc.raw) / sum(sc.weighted)).toFixed(1)}× cache multiple`
      : `${worst.name} — a ${worst.mult.toFixed(1)}× runaway cache.`;
    el('hero-copy').innerHTML =
      `<b>${top.name}</b> is ${Math.round(top.raw / gr * 100)}% of raw tokens but only ` +
      `${Math.round(top.weighted / gw * 100)}% of weighted — a <b class="accent">${top.mult.toFixed(1)}× cache-read multiple</b> ` +
      `from re-reading large files. <b>${lean.name}</b> does comparable work at ${lean.mult.toFixed(1)}×.`;

    // ranked bars (scaled to the largest RAW so the cache ghost is visible)
    const maxRaw = Math.max(...DATA.projects.map((p) => sum(p.raw)));
    const W = 700;
    el('project-rows').innerHTML = DATA.projects.map((p) => {
      const pr = sum(p.raw), pw = sum(p.weighted), mult = pr / pw;
      const solid = Math.max(4, pw / maxRaw * W);
      const ghost = Math.max(solid + 3, pr / maxRaw * W);
      const dim = (state.project !== 'all' && state.project !== p.name) ? 'opacity:.32;' : '';
      return `
        <div class="prow" style="${dim}">
          <div class="pname">
            <span class="nm"><i class="dot" style="background:${p.color}"></i>${p.name}</span>
            <span class="meta">${p.sessions} threads · ${fmt(p.messages)} msgs</span>
          </div>
          <div class="track">
            <div class="bar-ghost" style="width:${ghost}px;background:repeating-linear-gradient(115deg,${p.color}22,${p.color}22 5px,transparent 5px,transparent 10px);border:1px solid ${p.color}33;"></div>
            <div class="bar-solid" style="width:${solid}px;background:${p.color};"></div>
          </div>
          <div class="val">
            <div class="v">${compact(pw)}</div>
            <div class="m ${mult > 3 ? 'hot' : ''}">${mult.toFixed(1)}× raw</div>
          </div>
        </div>`;
    }).join('');
  }

  function renderTiles() {
    const sc = scope();
    const tiles = [
      { lbl: 'Weighted tokens', v: compact(sum(sc.weighted)), foot: 'input-equivalent' },
      { lbl: 'Raw tokens', v: compact(sum(sc.raw)), foot: (sum(sc.raw) / sum(sc.weighted)).toFixed(1) + '× the weighted', accent: true },
      { lbl: 'Output tokens', v: compact(sc.raw.output), foot: 'what Claude wrote' },
      { lbl: 'Cache reads', v: compact(sc.raw.cacheRead), foot: Math.round(sc.raw.cacheRead / sum(sc.raw) * 100) + '% of raw · ~0.1×' },
      { lbl: 'Messages', v: fmt(sc.messages), foot: 'assistant turns' },
    ];
    el('tiles').innerHTML = tiles.map((t) => `
      <div class="card tile">
        <span class="eyebrow">${t.lbl}</span>
        <span class="v num ${t.accent ? 'accent' : ''}">${t.v}</span>
        <span class="foot">${t.foot}</span>
      </div>`).join('');
  }

  function renderModels() {
    const total = sum(DATA.totals[state.basis]);
    el('model-rows').innerHTML = DATA.models.map((m) => {
      const v = sum(m[state.basis]); const pct = v / total;
      const hl = (state.model === 'all' || state.model === m.name) ? 1 : 0.3;
      return `
        <div class="mrow" style="opacity:${hl}">
          <div class="top"><span class="nm">${m.name.replace('claude-', '')}</span><span class="pct">${(pct * 100).toFixed(1)}%</span></div>
          <div class="track"><div class="fill" style="width:${(pct * 100).toFixed(1)}%;opacity:${0.55 + pct * 0.45}"></div></div>
          <div class="sub">${compact(v)} ${state.basis}</div>
        </div>`;
    }).join('');
  }

  function renderThreads() {
    const rows = DATA.threads.filter((t) => state.project === 'all' || t.project === state.project);
    el('threads-body').innerHTML = rows.map((t) => {
      const p = DATA.projects.find((x) => x.name === t.project);
      const mult = sum(t.raw) / sum(t.weighted);
      return `
        <tr>
          <td><span class="pj"><i class="dot" style="background:${p ? p.color : '#23211D'}"></i>${t.project}</span></td>
          <td class="dim num">${t.session}</td>
          <td class="dim">${t.started}</td>
          <td class="dim num">${t.span}</td>
          <td class="r num">${fmt(sum(t.weighted))}</td>
          <td class="r num ${mult > 3 ? 'hot' : 'dim'}">${fmt(sum(t.raw))}</td>
          <td class="r num dim">${t.messages}</td>
        </tr>`;
    }).join('');
  }

  function renderLegend() {
    el('series-legend').innerHTML = TYPES.slice().reverse().map((t) =>
      `<span><i class="sw" style="background:${css(t.varc)}"></i>${t.label}</span>`).join('');
    el('series-note').textContent = `${state.basis} · stacked by token type`;
  }

  function renderChart() {
    const b = buckets();
    const labels = b.map((d) => d.date.slice(5));
    const datasets = TYPES.map((t) => ({
      label: t.label,
      data: b.map((d) => d[state.basis][t.key]),
      backgroundColor: hexA(css(t.varc), t.key === 'cacheRead' ? 0.5 : 0.9),
      borderColor: css(t.varc),
      borderWidth: 1, fill: true, pointRadius: 0, tension: 0.32,
    }));
    const ctx = el('series-chart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: css('--ink'), padding: 10, cornerRadius: 8, titleFont: { family: 'JetBrains Mono' },
            bodyFont: { family: 'Hanken Grotesk' },
            callbacks: { label: (c) => `${c.dataset.label}: ${compact(c.parsed.y)}` },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { display: false },
            ticks: { color: css('--ink-50'), font: { family: 'JetBrains Mono', size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { stacked: true, grid: { color: css('--line') }, border: { display: false },
            ticks: { color: css('--ink-50'), font: { family: 'JetBrains Mono', size: 11 }, callback: (v) => compact(v) } },
        },
      },
    });
  }
  function hexA(hex, a) {
    hex = hex.replace('#', '');
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function renderAll() {
    renderHero(); renderTiles(); renderModels(); renderThreads(); renderLegend(); renderChart();
  }

  // ---------- controls ----------
  function wireSeg(id, key) {
    el(id).addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v]'); if (!btn) return;
      state[key] = btn.dataset.v;
      [...el(id).children].forEach((c) => c.classList.toggle('active', c === btn));
      renderAll();
    });
  }
  function buildSelects() {
    const ms = el('sel-model');
    ms.innerHTML = `<option value="all">All</option>` + DATA.models.map((m) => `<option value="${m.name}">${m.name}</option>`).join('');
    ms.addEventListener('change', () => { state.model = ms.value; if (state.model !== 'all') { state.project = 'all'; el('sel-project').value = 'all'; } renderAll(); });
    const ps = el('sel-project');
    ps.innerHTML = `<option value="all">All</option>` + DATA.projects.map((p) => `<option value="${p.name}">${p.name}</option>`).join('');
    ps.addEventListener('change', () => { state.project = ps.value; if (state.project !== 'all') { state.model = 'all'; el('sel-model').value = 'all'; } renderAll(); });
  }

  // ---------- boot ----------
  (async function init() {
    DATA = await loadData();
    renderMeta();
    buildSelects();
    wireSeg('seg-gran', 'gran');
    wireSeg('seg-basis', 'basis');
    el('refresh').addEventListener('click', async () => { DATA = await loadData(); renderMeta(); renderAll(); });
    renderAll();
  })();
})();
