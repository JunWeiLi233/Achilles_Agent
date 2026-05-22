#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const MODES = new Set([
  "run",
  "self",
  "max",
  "tech-debt",
  "attack",
  "structure-update",
  "language",
  "market"
]);

const DEFAULT_CONFIG = {
  taskFile: "TASKS.md",
  stateDir: ".agent-state",
  checks: [],
  publish: {
    remoteName: "origin",
    targetBranch: "main",
    targetRemoteUrl: "",
    requiredIdentityName: "",
    requiredIdentityEmail: ""
  },
  privacy: {
    exclude: [],
    forbid: []
  }
};

main();

function main() {
  const argv = parseArgs(process.argv.slice(2));
  const mode = normalizeMode(argv._[0] || argv.mode || "run");
  if (!MODES.has(mode)) {
    fail(`Unknown mode: ${mode}`);
  }

  const root = findProjectRoot(process.cwd());
  const config = loadConfig(root, stringValue(argv.config));
  const task = resolveTask(root, config, argv);
  const changedFiles = listChangedFiles(root);
  const scopedFiles = stringList(argv.file || argv.files);
  const files = scopedFiles.length > 0 ? scopedFiles : changedFiles;
  const report = buildReport({ mode, root, config, task, files });

  if (argv.write) {
    const written = writeReport(root, config, mode, report);
    console.log(`Wrote ${path.relative(root, written.markdown)}`);
    console.log(`Wrote ${path.relative(root, written.json)}`);
    return;
  }

  if (argv.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(renderMarkdown(report));
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const trimmed = arg.slice(2);
    const equalIndex = trimmed.indexOf("=");
    const key = equalIndex === -1 ? trimmed : trimmed.slice(0, equalIndex);
    const rawValue = equalIndex === -1 ? undefined : trimmed.slice(equalIndex + 1);
    const value = rawValue ?? (args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true);
    if (Object.hasOwn(out, key)) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

function normalizeMode(mode) {
  if (mode === "plan") return "run";
  return String(mode);
}

function findProjectRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function loadConfig(root, explicitPath) {
  const configPath = explicitPath
    ? path.resolve(root, explicitPath)
    : path.join(root, ".achilles-agent.json");
  const loaded = readJsonIfExists(configPath);
  return {
    ...DEFAULT_CONFIG,
    ...loaded,
    publish: { ...DEFAULT_CONFIG.publish, ...(loaded.publish || {}) },
    privacy: { ...DEFAULT_CONFIG.privacy, ...(loaded.privacy || {}) }
  };
}

function resolveTask(root, config, argv) {
  const direct = stringValue(argv.task) || argv._.slice(1).join(" ").trim();
  if (direct) return direct;

  const taskPath = path.resolve(root, config.taskFile || DEFAULT_CONFIG.taskFile);
  const taskFile = readTextIfExists(taskPath);
  if (!taskFile) return "No task provided. Inspect repository context and define a bounded objective.";

  const firstUnchecked = taskFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^[-*]\s+\[\s\]\s+/.test(line));
  return firstUnchecked ? firstUnchecked.replace(/^[-*]\s+\[\s\]\s+/, "") : "No unchecked task found.";
}

function listChangedFiles(root) {
  const porcelain = runGit(root, ["status", "--short"]);
  return porcelain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^..?\s+/, ""))
    .slice(0, 80);
}

function buildReport(input) {
  const builders = {
    run: buildRunReport,
    self: buildSelfReport,
    max: buildMaxReport,
    "tech-debt": buildTechDebtReport,
    attack: buildAttackReport,
    "structure-update": buildStructureReport,
    language: buildLanguageReport,
    market: buildMarketReport
  };
  return builders[input.mode](input);
}

function baseReport({ mode, root, config, task, files }) {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    projectRoot: root,
    task,
    files,
    stateDir: config.stateDir,
    checks: Array.isArray(config.checks) ? config.checks : [],
    sections: []
  };
}

function buildRunReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Execution Brief";
  report.sections.push(
    section("Objective", [input.task]),
    section("Operating Rules", [
      "Use the smallest change that satisfies the objective.",
      "Preserve existing routing, data wiring, and public behavior unless the task explicitly changes them.",
      "Do not publish local state, credentials, account data, or machine-specific paths."
    ]),
    section("Execution Steps", [
      "Inspect task context and owning project guidance.",
      "Read only the files needed for the active change.",
      "Edit in small increments.",
      "Run focused verification and record exact command output.",
      "Leave blockers explicit if verification cannot complete."
    ]),
    verificationSection(input.config)
  );
  return report;
}

function buildSelfReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Self Loop";
  report.sections.push(
    section("Loop Contract", [
      "Complete one bounded inspect-edit-verify-record loop.",
      "Stop if the same blocker repeats or if external credentials are required.",
      "Do not convert helper state into proof of runtime success."
    ]),
    section("Task", [input.task]),
    verificationSection(input.config)
  );
  return report;
}

function buildMaxReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Max Plan";
  report.sections.push(
    section("Lane Split", inferLanes(input.files)),
    section("Merge Gate", [
      "Every lane must report changed files, checks run, and unresolved risk.",
      "Resolve overlapping edits before final verification.",
      "Run the configured checks and privacy scan after lane integration."
    ]),
    verificationSection(input.config)
  );
  return report;
}

function buildTechDebtReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Tech Debt Scan";
  const markers = scanMarkers(input.root, input.config);
  report.findings = markers;
  report.sections.push(
    section("Priority Rules", [
      "Prefer risks with clear user, reliability, security, or maintenance impact.",
      "Avoid broad rewrites unless a small containment fix cannot work.",
      "Attach each recommendation to a file and a verification step."
    ]),
    section("Marker Summary", summarizeMarkers(markers)),
    verificationSection(input.config)
  );
  return report;
}

function buildAttackReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Attack Review";
  report.sections.push(
    section("Review Targets", [
      "Unsafe defaults and missing confirmation gates.",
      "Assumptions that depend on a local machine, account, or private state.",
      "Inputs that can bypass validation or leak data.",
      "Build, test, or publish paths that claim success without proof."
    ]),
    section("Scope", [input.task]),
    verificationSection(input.config)
  );
  return report;
}

function buildStructureReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Structure Update";
  report.sections.push(
    section("Authority Order", [
      "Prefer current tool output over durable docs.",
      "Prefer deeper project guidance over parent guidance.",
      "Update the smallest authoritative file that owns the rule."
    ]),
    section("Checklist", [
      "Remove duplicated or stale workflow text.",
      "Keep project-specific values in config.",
      "Keep local state ignored by git.",
      "Document verification gates next to the command that requires them."
    ]),
    verificationSection(input.config)
  );
  return report;
}

function buildLanguageReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Language Review";
  report.sections.push(
    section("Copy Checks", [
      "Use concrete labels that explain what the user can do next.",
      "Keep terminology consistent across commands, docs, and UI surfaces.",
      "Flag text that needs localization or accessibility review.",
      "Avoid exposing internal account, path, or environment details."
    ]),
    section("Scope", [input.task]),
    verificationSection(input.config)
  );
  return report;
}

function buildMarketReport(input) {
  const report = baseReport(input);
  report.title = "Auto Achilles Market Brief";
  report.sections.push(
    section("Research Rules", [
      "Separate sourced facts from assumptions.",
      "Record dates for time-sensitive information.",
      "Do not store private customer or account data in the repo.",
      "Convert findings into testable product or messaging hypotheses."
    ]),
    section("Scope", [input.task]),
    verificationSection(input.config)
  );
  return report;
}

function verificationSection(config) {
  const checks = Array.isArray(config.checks) && config.checks.length > 0
    ? config.checks
    : ["No project checks configured. Add checks to .achilles-agent.json."];
  return section("Verification", [
    ...checks.map((check) => `Run: ${check}`),
    "Run: node .tools/auto-achilles-security-scan.mjs --root ."
  ]);
}

function inferLanes(files) {
  if (!files.length) {
    return [
      "Lane 1: inspect task and project guidance.",
      "Lane 2: identify files likely to change.",
      "Lane 3: define verification and merge risk."
    ];
  }

  const groups = new Map();
  for (const file of files) {
    const key = file.split(/[\\/]/)[0] || "root";
    groups.set(key, [...(groups.get(key) || []), file]);
  }
  return [...groups.entries()].slice(0, 8).map(([key, group], index) => (
    `Lane ${index + 1}: ${key} (${group.slice(0, 5).join(", ")})`
  ));
}

function scanMarkers(root, config) {
  const excludes = new Set([
    ".git",
    "node_modules",
    ".agent-state",
    "dist",
    "build",
    "coverage",
    ...(Array.isArray(config.privacy?.exclude) ? config.privacy.exclude : [])
  ]);
  const findings = [];
  for (const file of walk(root, excludes)) {
    const rel = path.relative(root, file);
    if (!isLikelyText(file)) continue;
    const lines = readTextIfExists(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
        findings.push({ file: rel, line: index + 1, text: line.trim().slice(0, 160) });
      }
    });
    const stat = fs.statSync(file);
    if (stat.size > 250_000) {
      findings.push({ file: rel, line: 1, text: `Large text file: ${stat.size} bytes` });
    }
  }
  return findings.slice(0, 200);
}

function summarizeMarkers(markers) {
  if (!markers.length) return ["No stale work markers found in scanned text files."];
  return markers.slice(0, 30).map((item) => `${item.file}:${item.line} ${item.text}`);
}

function section(title, items) {
  return { title, items };
}

function renderMarkdown(report) {
  const lines = [`# ${report.title}`, "", `Generated: ${report.generatedAt}`, "", `Task: ${report.task}`, ""];
  for (const sectionEntry of report.sections) {
    lines.push(`## ${sectionEntry.title}`, "");
    for (const item of sectionEntry.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  if (report.files.length) {
    lines.push("## Files In Scope", "");
    for (const file of report.files.slice(0, 80)) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function writeReport(root, config, mode, report) {
  const stateDir = path.resolve(root, config.stateDir || DEFAULT_CONFIG.stateDir);
  fs.mkdirSync(stateDir, { recursive: true });
  const baseName = `AUTO_ACHILLES_${mode.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const markdown = path.join(stateDir, `${baseName}.md`);
  const json = path.join(stateDir, `${baseName}.json`);
  fs.writeFileSync(markdown, renderMarkdown(report), "utf8");
  fs.writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdown, json };
}

function walk(root, excludes) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = safeReadDir(current);
    for (const entry of entries) {
      if (excludes.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isLikelyText(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) return false;
  return buffer.length < 1_500_000;
}

function readJsonIfExists(file) {
  const text = readTextIfExists(file);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Invalid JSON in ${file}: ${error.message}`);
  }
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function runGit(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

function stringValue(value) {
  if (Array.isArray(value)) return String(value[value.length - 1]);
  if (typeof value === "string") return value;
  return "";
}

function stringList(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
