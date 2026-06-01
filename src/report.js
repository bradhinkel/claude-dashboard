// Phase 8 — self-contained HTML report → print-to-PDF.
// `npm run report` reads the DB, builds the same /api/usage payload, and writes a
// SINGLE .html file with everything inlined: data, CSS, Chart.js, and the render
// layer. It opens offline (no server, no CDN) and carries a print stylesheet so
// the browser's "Save as PDF" produces a clean, page-broken document.
//
// No PDF dependency — the browser is the renderer (per the build plan).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, loadRecords } from "./db.js";
import { resolveProjectsDir } from "./projects.js";
import { buildPayload } from "./payload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUB = join(ROOT, "public");

// 1) data
const db = openDb();
const payload = buildPayload(loadRecords(db), { dir: resolveProjectsDir() });
db.close();

// 2) assets to inline
const css = readFileSync(join(PUB, "styles.css"), "utf8");
const appJs = readFileSync(join(PUB, "app.js"), "utf8");
const chartJs = readFileSync(join(PUB, "vendor", "chart.umd.min.js"), "utf8");
const indexHtml = readFileSync(join(PUB, "index.html"), "utf8");

// Reuse the live page's body markup (everything between <main>…</main>); the
// script tags live outside it, so we drop them and inline our own below.
const mainMarkup = indexHtml.match(/<main[\s\S]*?<\/main>/i)?.[0] || "";

// Make embedded JS/JSON safe inside <script> (no premature </script>, no JSON
// breaking out of the script context).
const safeJs = (s) => s.replace(/<\/script>/gi, "<\\/script>");
const safeJson = (o) => JSON.stringify(o).replace(/[<\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

// Print stylesheet: preserve the brand colors in the PDF, hide interactive
// chrome, and keep cards/rows from splitting across pages.
const PRINT_CSS = `
/* screen-only export affordance */
.report-print-btn {
  position: fixed; top: 18px; right: 18px; z-index: 9; cursor: pointer;
  font: 600 13px var(--sans); color: var(--card); background: var(--ink);
  border: none; border-radius: var(--r-md); padding: 10px 16px;
  box-shadow: 0 6px 18px -8px rgba(40,30,15,.6);
}
.report-print-btn:hover { background: #000; }

@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff; }
  /* keep terracotta bars, dots, swatches in the PDF */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .shell { max-width: 100%; padding: 0; }
  /* drop interactive-only chrome */
  .controls, #refresh, .report-print-btn { display: none !important; }
  .hero { box-shadow: none; }
  /* don't split a card / row / table row across pages */
  .card, .hero, .tile, .prow, .mrow, .threads-tbl tr, .row-2 > * { break-inside: avoid; }
  .tiles, .row-2 { break-inside: avoid; }
  .threads { break-before: auto; }
}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Claude Code · Token Usage — ${payload.meta.rangeStart} → ${payload.meta.rangeEnd}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
${css}
${PRINT_CSS}
</style>
</head>
<body>
<button class="report-print-btn" onclick="window.print()">⎙ Save as PDF</button>
${mainMarkup}
<script>${safeJs(chartJs)}</script>
<script>
// Inlined snapshot — opens with no server. Disable chart animation so the canvas
// is fully painted before the user prints.
window.USAGE_INLINE = ${safeJson(payload)};
if (window.Chart) Chart.defaults.animation = false;
</script>
<script>${safeJs(appJs)}</script>
</body>
</html>`;

const outDir = join(ROOT, "reports");
mkdirSync(outDir, { recursive: true });
const stamp = payload.meta.rangeEnd || "report";
const outFile = join(outDir, `token-usage-${stamp}.html`);
writeFileSync(outFile, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`wrote ${outFile}`);
console.log(`  ${kb} KB · ${payload.meta.messages.toLocaleString()} messages · ${payload.meta.rangeStart} → ${payload.meta.rangeEnd}`);
console.log(`  self-contained: open in a browser, then "Save as PDF".`);
