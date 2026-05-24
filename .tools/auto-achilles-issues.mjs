#!/usr/bin/env node
// auto-achilles-issues.mjs
// Bridge between GitHub issues and the Auto-Achilles task queue.
// Ported from the Hermes auto-hermes-issues.mjs helper, adapted to
// Achilles's config-driven repo target (.achilles-agent.json).
//
// Subcommands:
//   --list                              List open issues as JSON (default)
//   --list --task-format                Emit TASKS.md `## Active Tasks`-style blocks
//   --list --task-format --decompose    Split large issues into bounded sub-tasks
//   --close <N> --comment "..."         Close issue #N with an optional comment
//
// Repo target resolution order:
//   1. --repo OWNER/NAME (CLI flag)
//   2. .achilles-agent.json -> publish.targetRemoteUrl (parsed to OWNER/NAME)
//   3. `git remote get-url origin` (parsed)
//
// Requires `gh` CLI authenticated against the target repo. Exits 0 with
// `{ "skipped": true }` when gh is missing so the session checklist keeps
// moving rather than blocking. Real errors surface non-zero.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    list: false,
    taskFormat: false,
    decompose: false,
    close: null,
    comment: "",
    state: "open",
    limit: 50,
    repo: null,
    configPath: ".achilles-agent.json",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
    else if (a === "--task-format") args.taskFormat = true;
    else if (a === "--decompose") args.decompose = true;
    else if (a === "--close") args.close = parseInt(argv[++i], 10);
    else if (a === "--comment") args.comment = argv[++i] || "";
    else if (a === "--state") args.state = argv[++i] || "open";
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10) || 50;
    else if (a === "--repo") args.repo = argv[++i] || null;
    else if (a === "--config") args.configPath = argv[++i] || args.configPath;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: auto-achilles-issues.mjs [--list [--task-format [--decompose]]] [--close N --comment STR] [--repo OWNER/NAME] [--config PATH]\n"
      );
      process.exit(0);
    }
  }
  if (!args.list && args.close == null) args.list = true; // default
  return args;
}

function ghAvailable() {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gh(args, opts = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
}

// Parse "https://github.com/OWNER/REPO(.git)?" or "git@github.com:OWNER/REPO(.git)?" → "OWNER/REPO"
function parseRepoFromUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim().replace(/\.git$/i, "");
  const httpsMatch = trimmed.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+)$/i);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
  const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/([^/]+)$/i);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  return null;
}

function resolveRepo(args) {
  if (args.repo) return args.repo;

  // 2. From config file
  const configPath = resolve(process.cwd(), args.configPath);
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf8"));
      const fromConfig = parseRepoFromUrl(cfg?.publish?.targetRemoteUrl);
      if (fromConfig && !fromConfig.includes("OWNER/REPOSITORY")) return fromConfig;
    } catch {
      /* ignore malformed config */
    }
  }

  // 3. From git origin
  try {
    const originUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim();
    const fromOrigin = parseRepoFromUrl(originUrl);
    if (fromOrigin) return fromOrigin;
  } catch {
    /* ignore */
  }

  return null;
}

function fetchIssues(repo, { state, limit }) {
  const raw = gh([
    "issue", "list",
    "--repo", repo,
    "--state", state,
    "--limit", String(limit),
    "--json", "number,title,labels,body,url,author,createdAt,updatedAt",
  ]);
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`gh issue list returned non-JSON output: ${err.message}`);
  }
}

// Extract a Files: list by scanning backticked paths that look like real
// repo files (extension whitelist + existence check).
function extractFiles(body) {
  const matches = String(body || "").match(/`([^`\n]+\.(?:jsx?|tsx?|mjs|java|css|md|json|properties|ya?ml|sql))`/gi) || [];
  const files = new Set();
  for (const m of matches) {
    const path = m.replace(/`/g, "").trim();
    if (path && !path.includes(" ") && existsSync(path)) {
      files.add(path);
    }
  }
  return [...files];
}

// Pick a Verify command from the body if the author named a script,
// otherwise return a safe default based on which directories the files touch.
function deriveVerify(files) {
  if (!files.length) return "(no auto-derived verify — pick one before promoting)";
  const exts = new Set(files.map((f) => f.split(".").pop().toLowerCase()));
  if (exts.has("java")) return "./mvnw -q -DskipTests compile || mvn -q -DskipTests compile";
  if (exts.has("ts") || exts.has("tsx") || exts.has("mjs") || exts.has("js") || exts.has("jsx") || exts.has("css")) return "npm run lint && npm run build";
  return "(no auto-derived verify — pick one before promoting)";
}

// Pull a Done-when sentence from "Acceptance criteria" / "验收标准" / "Done when"
// sections. Falls back to a one-line restatement of the title.
function deriveDoneWhen(body, title) {
  const lines = String(body || "").split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^#+\s*(验收标准|acceptance criteria|done when)/i.test(l));
  if (startIdx >= 0) {
    const bullets = [];
    for (let i = startIdx + 1; i < lines.length && bullets.length < 4; i++) {
      const m = lines[i].match(/^[-*]\s+(.+?)\s*$/);
      if (m) bullets.push(m[1]);
      else if (/^#+/.test(lines[i]) && bullets.length) break;
    }
    if (bullets.length) return bullets.join(" AND ");
  }
  return title;
}

function toTaskBlock(issue, { decompose } = {}) {
  const files = extractFiles(issue.body);
  const verify = deriveVerify(files);
  const doneWhen = deriveDoneWhen(issue.body, issue.title);
  const filesLine = files.length ? files.join("||") : "(none extracted — fill in)";

  const header = `- [issue #${issue.number}] ${issue.title}`;
  const meta = [
    `  Files: ${filesLine}`,
    `  Context: ${issue.url} — ${issue.author?.login || "unknown"} opened ${issue.createdAt?.slice(0, 10) || ""}`,
    `  Done when: ${doneWhen}`,
    `  Verify: ${verify}`,
    `  Closes: #${issue.number}`,
  ];

  if (!decompose) return [header, ...meta].join("\n");

  // Decompose: if the body lists discrete items under a "Confirmed gaps" /
  // "Sub-tasks" / "已确认的缺口" section, emit one task per item.
  const lines = String(issue.body || "").split(/\r?\n/);
  const gapsIdx = lines.findIndex((l) => /^#+\s*(已确认的缺口|confirmed gaps|sub-tasks?|subtasks?)/i.test(l));
  if (gapsIdx < 0) return [header, ...meta].join("\n");

  const items = [];
  for (let i = gapsIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^[-*]\s+`?([^`\n]+?)`?\s*$/);
    if (m) items.push(m[1].trim());
    else if (/^#+/.test(lines[i]) && items.length) break;
  }
  if (items.length < 2) return [header, ...meta].join("\n");

  const subBlocks = items.map((item, idx) =>
    [
      `- [issue #${issue.number}.${idx + 1}] ${issue.title} — ${item}`,
      `  Files: ${filesLine}`,
      `  Context: ${issue.url} (decomposed item ${idx + 1}/${items.length}: ${item})`,
      `  Done when: ${item} is wired into the surface`,
      `  Verify: ${verify}`,
      `  Closes: #${issue.number}`,
    ].join("\n")
  );

  return [header, ...meta, "", ...subBlocks].join("\n");
}

function listIssues(args, repo) {
  if (!ghAvailable()) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: "gh CLI not on PATH" }) + "\n");
    return;
  }
  if (!repo) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: "Could not resolve repo target — pass --repo OWNER/NAME or set publish.targetRemoteUrl in .achilles-agent.json" }) + "\n");
    return;
  }
  const issues = fetchIssues(repo, { state: args.state, limit: args.limit });
  if (!args.taskFormat) {
    process.stdout.write(JSON.stringify({ repo, count: issues.length, issues }, null, 2) + "\n");
    return;
  }
  if (!issues.length) {
    process.stdout.write(`# No open issues on ${repo}\n`);
    return;
  }
  const blocks = issues.map((issue) => toTaskBlock(issue, { decompose: args.decompose }));
  process.stdout.write(blocks.join("\n\n") + "\n");
}

function closeIssue(args, repo) {
  if (!ghAvailable()) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: "gh CLI not on PATH" }) + "\n");
    return;
  }
  if (!repo) {
    process.stderr.write("auto-achilles-issues: could not resolve repo target — pass --repo OWNER/NAME or set publish.targetRemoteUrl in .achilles-agent.json\n");
    process.exit(2);
  }
  const n = args.close;
  if (!Number.isInteger(n) || n <= 0) {
    process.stderr.write("auto-achilles-issues: --close requires a positive integer issue number\n");
    process.exit(2);
  }
  const closeArgs = ["issue", "close", String(n), "--repo", repo];
  if (args.comment) closeArgs.push("--comment", args.comment);
  try {
    const out = gh(closeArgs);
    process.stdout.write(JSON.stringify({ closed: n, repo, comment: args.comment, output: out.trim() }) + "\n");
  } catch (err) {
    process.stderr.write(`auto-achilles-issues: failed to close #${n} on ${repo}: ${err.message}\n`);
    process.exit(3);
  }
}

const args = parseArgs(process.argv.slice(2));
const repo = resolveRepo(args);
if (args.close != null) closeIssue(args, repo);
else listIssues(args, repo);
