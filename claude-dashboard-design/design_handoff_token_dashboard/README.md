# Handoff: Claude Code Token Dashboard — visual redesign

A front-end implementation of the **"Claude brand"** visual identity for the Claude Code
token-usage dashboard (Phase 7 of the build plan: *"give it a deliberate visual identity —
looks intentional, not framework-default"*).

This bundle is a **runnable reference implementation**, not a throwaway mock: open
`index.html` and it renders with embedded sample data. Wire it to your local server by
replacing one function (`loadData()` in `app.js`) and you have the real thing.

---

## What's in the box

| File | Role |
|------|------|
| `index.html` | Page skeleton — masthead, controls, hero, tiles, chart row, threads table. Loads Chart.js (CDN), `sample-data.js`, `app.js`. |
| `styles.css` | The entire Claude-brand design system as CSS custom properties + component classes. **Restyle the whole app from `:root`.** |
| `app.js` | Vanilla-JS render layer + Chart.js config + working controls (cost-basis & granularity toggles, model/project filters). |
| `sample-data.js` | `window.USAGE_SAMPLE` — a synthetic-but-consistent payload in the exact shape your `/api/usage` endpoint should return. Lets the UI run with no backend. |

No build step, no framework, no npm install. Chart.js is the only runtime dependency.

---

## About these files

These are **design reference files written in plain HTML/CSS/JS**. They show the intended
look, layout, and behavior. You can ship them close to as-is for a vanilla dashboard, **or**
recreate them in whatever your codebase already uses (React, Vue, Svelte). If you port to a
framework, keep `styles.css`'s tokens — they *are* the design — and treat the markup in
`index.html` + the render functions in `app.js` as the component spec.

## Fidelity: **high**

Final colors, typography, spacing, and interactions. Recreate pixel-for-pixel. Every value
you need is tokenized in `styles.css` and listed under **Design tokens** below.

---

## Layout (top to bottom)

Single column, `max-width: 1440px`, centered, `40px 56px 52px` padding. Designed for desktop
(≥1280px); the title and controls reflow on narrower widths but the dashboard is desktop-first.

1. **Masthead** — flex row, baseline-aligned, `1.5px solid ink` bottom rule.
   - Left: terracotta mono kicker `✳ CLAUDE CODE · USAGE`, then `<h1>` "Token Usage" in
     Newsreader 46px/500.
   - Right: projects dir (mono) + messages/range (sans) stacked, then a dark **Refresh** button.
2. **Controls** — flex-wrap row, each control is a label (`.eyebrow`) over a control:
   - *Granularity* segmented pill `Hour · Day · Week` (Day active).
   - *Cost basis* segmented pill `Weighted · Raw total` (Weighted active).
   - *Model*, *Project* — `<select>` styled as `.field`.
   - *From / To* — date readouts as `.field`.
   - *Sub-agents* `Hide · Roll up` pill, pushed right (`margin-left:auto`).
3. **Hero — "Where the tokens go"** (the centerpiece). Rounded `18px` card with soft shadow.
   - Top: left lede (terracotta kicker, Newsreader 33px headline, 15px body insight) | right
     figures (Weighted vs Raw big serif numbers, `3.6× inflation` caption).
   - Legend: *weighted (real cost)* solid swatch · *raw extension = cache reads* hatched swatch.
   - **Ranked project rows**: 3-col grid `[180px | 1fr | 138px]`. Each row = name + dot +
     thread/msg meta · a bar track (solid = weighted, scaled to the largest raw; hatched ghost
     = raw extension) · weighted figure + `N× raw` multiple (terracotta when > 3×).
4. **Stat tiles** — 5-col grid. Weighted · Raw (terracotta, `3.6× the weighted`) · Output ·
   Cache reads (`94% of raw`) · Messages. Label / big mono number / sans footnote.
5. **Chart row** — `[1fr | 360px]` grid.
   - *Usage over time*: Chart.js stacked **area**, basis-aware, stacked by token type. Token
     legend below.
   - *By model*: horizontal bars, terracotta fill, weighted/raw figure per row.
6. **Top threads** — table, 7 columns. Project (dot + name) · Session (mono) · Started · Span ·
   Weighted (right, mono) · Raw (right, terracotta when multiple > 3×) · Msgs. Footnote about
   estimated costs.

---

## The story the design leads with

The hero exists to make **one insight** legible: *where the tokens actually go.*
`weather-station` is **79% of raw** tokens but only **58% of weighted** — a **4.9× cache-read
multiple** from re-reading large files — while `Praxium` does comparable work at **1.4×**. The
solid-vs-ghost bars and the per-row multiple badge encode that gap directly. Keep this hierarchy
if you re-lay-out: the project comparison is the most important element on the page.

---

## Interactions & behavior

- **Cost basis (Weighted ⇄ Raw)** — re-renders the time-series chart and the By-model figures
  against the chosen basis. Fully wired in `app.js`.
- **Granularity (Day / Week)** — `Day` shows daily buckets; `Week` aggregates every 7 days.
  `Hour` falls back to Day in the sample (no sub-day data) — your server returns true hourly
  buckets for `--granularity hour`.
- **Project / Model selects** — filter the threads table; selecting a project also dims the
  other hero bars and rescales the tiles/series to that project's share. Project and Model are
  mutually exclusive in the sample (one scope at a time); a real backend can cross-filter.
- **Refresh** — re-calls `loadData()`.
- **Chart tooltip** — index mode, dark `ink` background, mono title, compact-formatted values.
- No transitions/animations beyond Chart.js defaults and button hover (`ink → #000`).

## State

Held in a single `state` object in `app.js`:
`{ basis: 'weighted'|'raw', gran: 'hour'|'day'|'week', project: 'all'|<name>, model: 'all'|<name> }`.
Any change mutates `state` then calls `renderAll()`, which re-runs every render function. No
framework state needed; port to your store of choice if framework-izing.

---

## Data contract — `GET /api/usage`

`app.js` `loadData()` fetches this and falls back to `window.USAGE_SAMPLE` when offline. Every
bucket carries **both** the four raw token-type counts **and** the four weighted (input-
equivalent) contributions, so the basis toggle is a pure client-side switch and the four token
types are always available for the stacked series.

```jsonc
{
  "meta": {
    "projectsDir": "/home/you/.claude/projects",
    "messages": 1549,
    "rangeStart": "2026-05-06",
    "rangeEnd": "2026-06-01",
    "generatedAt": "2026-05-31T12:00:00Z",
    "estimated": true
  },
  "weights": { "input": 1, "output": 5, "cacheWrite": 1.25, "cacheRead": 0.1 }, // info/config
  "totals": {
    "raw":      { "input": …, "output": …, "cacheWrite": …, "cacheRead": … },
    "weighted": { "input": …, "output": …, "cacheWrite": …, "cacheRead": … }
  },
  "series":   [ { "date": "2026-05-06", "raw": {…4 types}, "weighted": {…4 types} }, … ],
  "projects": [ { "name": "weather-station", "sessions": 4, "messages": 996, "color": "#C96442",
                  "raw": {…}, "weighted": {…} }, … ],
  "threads":  [ { "project": …, "session": "75a03b8b", "started": "May 29", "span": "31m",
                  "messages": 121, "raw": {…}, "weighted": {…} }, … ],
  "models":   [ { "name": "claude-sonnet-4-5", "share": 0.882, "raw": {…}, "weighted": {…} }, … ]
}
```

A "type object" is always `{ input, output, cacheWrite, cacheRead }` in token counts (raw) or
input-equivalent units (weighted). Client helper `sum(obj)` totals the four; the basis toggle
just selects `bucket.raw` vs `bucket.weighted`.

**Server responsibilities** (per the build plan): bind to `localhost` only; read `usage` +
metadata only, never message bodies; compute `weighted` with real per-model pricing; honor
`CLAUDE_PROJECTS_DIR`. The `weights` block is advisory (shown/configurable); the authoritative
weighted numbers come from the server.

> ⚠️ `sample-data.js` is **synthetic**. Grand totals match the source export exactly
> (raw 199.8M, weighted 56.1M, output 4.94M, cache reads 188.6M); per-project/day type splits
> are reconstructed for illustration. Real numbers come from your parser.

---

## Design tokens

All defined in `styles.css :root`.

### Color
| Token | Hex | Use |
|-------|-----|-----|
| `--paper` | `#EFECE3` | page background (warm cream) |
| `--card` | `#FBFAF6` | card surface |
| `--card-edge` | `#E4DFD2` | card border |
| `--line` | `#E1DBCD` | rules, gridlines, bar tracks |
| `--seg-track` | `#E7E2D6` | segmented-control track |
| `--bar-track` | `#EBE6D9` | by-model bar track |
| `--ink` | `#23211D` | primary text, masthead rule, refresh btn |
| `--ink-70` | `#5C574D` | secondary text |
| `--ink-50` | `#8A8476` | labels / muted |
| `--terra` | `#C96442` | brand accent (raw, multiples, output) |
| `--terra-dk` | `#A24E32` | accent hover/deep |
| `--tok-input` | `#1F6F6B` | series: input (teal) |
| `--tok-output` | `#C96442` | series: output (terracotta) |
| `--tok-cw` | `#B5862E` | series: cache write (amber) |
| `--tok-cr` | `#CFC8B6` | series: cache read (muted stone) |

### Type
- **Display / headings** — `Newsreader` (serif). h1 46/500, hero h2 33/500, card h3 20/500.
- **UI / body** — `Hanken Grotesk` (sans). Body 15, controls 12.5–13, labels 10 uppercase
  `.14em` tracking.
- **Figures / code / sessions** — `JetBrains Mono`, tabular-nums. Tiles 25, hero figures use
  serif, table/meta 11.5–13.

### Spacing / radius / shadow
- Page padding `--pad: 56px`; section gaps 14–16px; card padding 20–34px.
- Radii: `--r-sm 6` · `--r-md 9` · `--r-lg 12` · `--r-xl 18`; pills `999px`.
- `--shadow-card: 0 1px 0 rgba(255,255,255,.6) inset, 0 14px 34px -28px rgba(60,40,20,.5)`
  (hero only; flat cards elsewhere).

---

## Assets & fonts

- **Fonts** via Google Fonts (`<link>` in `index.html`): Newsreader, Hanken Grotesk,
  JetBrains Mono. Swap for your licensed brand faces if you have them (the design targets a
  Tiempos/Styrene-style pairing; Newsreader + Hanken Grotesk are the open stand-ins).
- **Chart.js** `4.4.4` via jsDelivr CDN. Self-host for an offline/local-only app.
- **No image assets.** The `✳` kicker glyph is a text character, not the Claude sunburst —
  substitute your real brand mark if available.

---

## To go live

1. Drop these four files into the dashboard's static dir.
2. In `app.js`, `loadData()` already calls `fetch('/api/usage')` first and only falls back to
   the sample — so once your endpoint returns the contract above, the sample is bypassed.
3. (Optional) delete `sample-data.js` and its `<script>` tag for production.
4. Self-host Chart.js + fonts if the app must run fully offline on `localhost`.
