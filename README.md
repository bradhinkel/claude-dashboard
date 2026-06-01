# Claude Code Token Dashboard

A local web app that reads Claude Code's on-disk session logs
(`~/.claude/projects/**/*.jsonl`) and visualizes token usage over time, by project,
by thread, and by model — with a **raw ⇄ weighted** cost toggle that makes the
cache-read inflation visible.

Everything runs locally: a small Node server reads the JSONL and serves aggregated
JSON; the browser at `localhost` is the UI. No data leaves your machine — the server
reads only token `usage` + metadata, never message bodies, and binds to localhost.

## Prior art & acknowledgment

[**phuryn/claude-usage**](https://github.com/phuryn/claude-usage) got here first. It's a
mature, full-featured Claude Code usage dashboard (with subscription progress bars and
session history) that was already complete and widely used by the time this project's
plan was being written — we only discovered it partway through, having arrived at the same
idea independently. **phuryn has priority on the concept.** This repository is a
from-scratch learning/reference build, not a competitor; if you want a polished tool to
actually use, start with phuryn's project.

## Quick start

```bash
# Node ≥ 22 required (uses the built-in node:sqlite — zero npm dependencies)
npm start            # → http://localhost:4317
```

On first launch it ingests your logs into a local SQLite cache (`data/usage.db`);
later launches skip unchanged files and start fast.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Launch the dashboard server (incremental-ingests, then serves). |
| `npm run ingest` | Run the ETL into SQLite without starting the server. |
| `npm run report` | Write a self-contained `reports/token-usage-<date>.html` — opens offline, print to PDF. |
| `npm run parse -- <file.jsonl>` | Inspect one session file. |
| `npm run aggregate` | Print aggregate totals to the console. |

## Configuration

- `CLAUDE_PROJECTS_DIR` — override where logs are read from (defaults to
  `~/.claude/projects`, then `~/.config/claude/projects`).
- `CLAUDE_DASHBOARD_DB` — override the SQLite cache path.
- `HOST` / `PORT` — bind address (default `127.0.0.1:4317`; set `HOST=0.0.0.0` under
  WSL to reach it from a Windows browser).
- Weighting ratios live in [`src/weights.js`](src/weights.js).

## How it's built

Built in phases — parser → aggregations → localhost server → Chart.js UI → polish →
SQLite ETL → visual redesign → offline HTML/PDF export. The reference plan is in
[`praxium-token-dashboard-plan.md`](praxium-token-dashboard-plan.md); the Phase 7
visual identity handoff is in [`claude-dashboard-design/`](claude-dashboard-design/).

## Cost basis

Token counts are shown two ways. **Raw** counts every token equally and is dominated
by cache reads. **Weighted** scales each token type to its input-equivalent cost
(output ~5×, cache writes 1.25–2×, cache reads ~0.1×) — the gap between the two is the
point. Numbers are **estimated**, relative to input tokens, not billed dollars.
