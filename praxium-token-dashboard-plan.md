# Praxium Project #2 — Claude Code Token Usage Dashboard (REFERENCE / ANSWER KEY)

Build-it-once reference for the author. The student-facing deliverable is a separate
**engagement script** that teaches a student to build their own version with Claude;
this doc is the answer key and friction inventory behind it.

A local web app that reads Claude Code's on-disk session logs and visualizes token usage
over time and by thread/project. Each phase ships something runnable.

---

## Architecture decisions (and why)

**Format: local web app, not a native desktop app.** Local files need a local *process*,
not a native GUI. A small server reads the JSONL; the browser at `localhost` is the UI.
Cross-platform for free — no installer, no code signing, no notarization, no Mac/Win split.

**Runtime: Node end-to-end.** Not because it's pre-installed (the native Claude Code
installer bundles its own runtime and doesn't expose `node`/`npm`), but for one language
across server and client. Install is one step (`winget install OpenJS.NodeJS.LTS`).
*Zero-install alternative (declined):* static HTML reading the folder client-side —
Chromium-only, re-pick each session, loses the client/server lesson.

**Persistence: none until Phase 6.** In-memory parse per refresh through Phase 5; SQLite
arrives later to teach ETL. Never Supabase/Postgres.

**Cost: tokens are the unit. Show total AND weighted as a toggle.** The *gap* between them
is the lesson — raw total is dominated by cache reads (~100×, billed ~0.1×), weighted
collapses it. Keep the four token types (input/output/cache-write/cache-read) as an
always-on stacked series so the cause of the gap is visible. Hard dollars are an optional,
date-stamped readout only.

**Security: two design properties.** (1) Bind to `localhost` only. (2) Read only `usage` +
metadata; never log/persist/transmit message bodies (the JSONL holds full transcripts).

---

## Platform & portability

Claude Code runs **natively on Windows** (since late 2025) and on Mac/Linux/WSL. A Node app
using `os.homedir()` + `path.join()` is **one codebase, native on all of them** — Mac
support is not contingent on WSL. The only variable is *where the logs sit*: default to
`~/.claude/projects` in the launching home, also check `~/.config/claude/projects`, honor
`CLAUDE_PROJECTS_DIR`.

**Rule for students:** run the dashboard in the same environment where you run Claude Code.
**Don't force Ubuntu/WSL for this project** — introduce environment complexity only when a
project's payoff requires it (i.e. the first cloud-deployed project, not a local app).

---

## Data source

```
~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
```
- `<encoded-cwd>` = working dir, non-alphanumerics → `-` (the **project** axis; prettify).
- `<session-uuid>.jsonl` = one **conversation thread**.
- `type:"assistant"` records carry `usage` (`input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`), `model`, timestamp.
- Logs written regardless of plan. On Max, derived cost is estimated equivalent.

---

## Functional requirements
- Time series with hour/day/week toggle.
- By-thread (per file) and by-project (per folder, decoded).
- **Total ⇄ weighted token toggle**; four token types always shown as a stacked series.
- Filters: model, date range, project.

---

## Phased build (each phase independently runnable)

**Scaffolding in the student script tapers: Phases 0–2 heavily guided, 3–5 medium, 6–8 you-drive.**

### Phase 0 — Locate & inspect
`ls -la ~/.claude/projects/`; open one `.jsonl`. **Checkpoint:** point at a real `usage` object.

### Phase 1 — Parser
Stream one file → normalized `{timestamp, model, project, sessionId, input, output, cacheWrite, cacheRead}`.
**Checkpoint:** plausible numbers on one file.

### Phase 2 — Aggregations
Group by day/session/project; raw total **and** weighted total.
**Checkpoint:** can explain why raw total overstates real work.

### Phase 3 — Local server
`localhost`-bound Node server returns aggregated JSON; dir via `os.homedir()` + env override.
**Checkpoint:** URL returns valid JSON.

### Phase 4 — Dashboard UI
Chart.js (CDN): time series + granularity toggle, by-project, by-thread, total⇄weighted toggle,
stacked token-type series. **Checkpoint:** recognize your own week in the chart.

### Phase 5 — Polish
Decoded names, model + date filters, configurable dir, estimated-only labels.
**Checkpoint:** a friend on another OS clones, runs, sees their usage.

### Phase 6 — SQLite persistence
Ingest once; query; skip already-seen files. **Checkpoint:** faster second launch.

### Phase 7 — Claude Design visual pass (only after it runs)
Take the working dashboard into Claude Design; give it a deliberate visual identity.
**Checkpoint:** looks intentional, not framework-default.

### Phase 8 — HTML report export → PDF
Self-contained HTML with data inlined; print stylesheet (`@media print`, `break-inside: avoid`,
charts rendered before `window.print()`) → browser Print → Save as PDF. No PDF dependency.
**Checkpoint:** exported file opens offline and prints clean.

---

## Remaining micro-decisions
1. `CLAUDE_PROJECTS_DIR` as the override name (or match an existing convention).
2. Weighting ratios: hardcoded constants vs. a tiny editable config.
