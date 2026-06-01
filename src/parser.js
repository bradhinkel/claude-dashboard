// Phase 1 — Parser.
// Stream one JSONL session file and emit normalized usage records.
//
// SECURITY: we read ONLY usage + metadata. Message bodies (record.message.content)
// are never read, logged, persisted, or transmitted.
//
// Real record shape (verified against ~/.claude/projects on this machine):
//   record.type === "assistant"
//   record.timestamp                       (ISO string, top-level)
//   record.sessionId                       (top-level)
//   record.isSidechain                     (true for sub-agent / side threads)
//   record.message.model                   (e.g. "claude-opus-4-8")
//   record.message.usage = {
//     input_tokens, output_tokens,
//     cache_creation_input_tokens, cache_read_input_tokens,
//     cache_creation: { ephemeral_1h_input_tokens, ephemeral_5m_input_tokens }
//   }
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { basename } from "node:path";

// Turn one parsed JSONL object into our normalized shape, or null if it has no usage.
export function normalizeRecord(record, { project, sessionId }) {
  if (!record || record.type !== "assistant") return null;
  const usage = record.message?.usage;
  if (!usage) return null;

  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const split = usage.cache_creation || {};
  // Prefer the explicit 1h/5m split; fall back to treating all writes as 5m.
  const cacheWrite1h = split.ephemeral_1h_input_tokens || 0;
  const cacheWrite5m =
    split.ephemeral_5m_input_tokens != null
      ? split.ephemeral_5m_input_tokens
      : cacheWrite - cacheWrite1h;

  return {
    timestamp: record.timestamp || null,
    model: record.message?.model || "unknown",
    project,
    cwd: record.cwd || null, // authoritative working dir (beats lossy folder decode)
    sessionId: record.sessionId || sessionId,
    isSidechain: Boolean(record.isSidechain),
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheWrite,
    cacheWrite1h,
    cacheWrite5m,
    cacheRead: usage.cache_read_input_tokens || 0,
  };
}

// Stream a single .jsonl file → array of normalized records.
export async function parseFile(filePath, { project } = {}) {
  const sessionId = basename(filePath, ".jsonl");
  const out = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue; // skip malformed / partial lines
    }
    const norm = normalizeRecord(record, { project, sessionId });
    if (norm) out.push(norm);
  }
  return out;
}

// CLI: `npm run parse -- <file.jsonl>` prints a quick summary.
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node src/parser.js <session.jsonl>");
    process.exit(1);
  }
  const recs = await parseFile(file);
  const sum = recs.reduce(
    (a, r) => ({
      input: a.input + r.input,
      output: a.output + r.output,
      cacheWrite: a.cacheWrite + r.cacheWrite,
      cacheRead: a.cacheRead + r.cacheRead,
    }),
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  );
  console.log(`records with usage: ${recs.length}`);
  console.log("token totals:", sum);
  console.log("raw total:", sum.input + sum.output + sum.cacheWrite + sum.cacheRead);
  if (recs[0]) console.log("first record:", recs[0]);
}
