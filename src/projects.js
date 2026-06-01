// Locate the Claude Code projects directory and enumerate session files.
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

// Resolve the projects dir. Priority: env override → ~/.claude/projects →
// ~/.config/claude/projects. Returns null if none exist.
export function resolveProjectsDir() {
  const candidates = [
    process.env.CLAUDE_PROJECTS_DIR,
    join(homedir(), ".claude", "projects"),
    join(homedir(), ".config", "claude", "projects"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(dir) && statSync(dir).isDirectory()) return dir;
  }
  return null;
}

// Pretty project label from an authoritative cwd path.
// Group by the TOP-LEVEL directory under the user's home, so subfolders you happen
// to run Claude in roll up to one project:
//   ~/weather-station            → "weather-station"
//   ~/Praxium                    → "Praxium"
//   ~/Praxium/praxium/src        → "Praxium"   (not "src")
//   ~/pdf_tts/frontend           → "pdf_tts"   (not "frontend")
// Heuristic note: assumes projects live directly under home. A cwd outside home
// (or home itself) falls back to its last path segment.
export function prettyProject(cwd) {
  if (!cwd) return null;
  const norm = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const home = homedir().replace(/\\/g, "/").replace(/\/+$/, "");
  const last = (p) => {
    const parts = p.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : p;
  };
  if (norm === home) return last(home);
  if (norm.startsWith(home + "/")) {
    const first = norm.slice(home.length + 1).split("/")[0];
    return first || last(home);
  }
  return last(norm); // outside home: best-effort last segment
}

// Decode an <encoded-cwd> folder name back to a readable project path.
// Folders encode the cwd with non-alphanumerics collapsed to "-", which is
// lossy (we can't perfectly recover "/"), so we present a best-effort label.
export function decodeProjectName(encoded) {
  // Leading "-" means an absolute path; turn separators back into "/".
  let s = encoded.replace(/^-/, "/").replace(/-/g, "/");
  return s;
}

// List { project, encoded, files: [absolutePaths] } for every project dir.
// Only *.jsonl at the top level of each project (skips memory/ subfolders).
export function listSessions(projectsDir) {
  const out = [];
  for (const encoded of readdirSync(projectsDir)) {
    const dir = join(projectsDir, encoded);
    let st;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f));
    if (files.length) {
      out.push({ project: decodeProjectName(encoded), encoded, files });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolveProjectsDir();
  console.log("projects dir:", dir);
  if (dir) {
    for (const p of listSessions(dir)) {
      console.log(`  ${p.project}  (${p.files.length} session${p.files.length > 1 ? "s" : ""})`);
    }
  }
}
