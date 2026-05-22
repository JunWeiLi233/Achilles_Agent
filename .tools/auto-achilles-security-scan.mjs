#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".agent-state",
  "dist",
  "build",
  "coverage",
  ".next",
  "target",
  "vendor",
  ".venv"
]);

const secretAssignmentPattern = new RegExp(
  `\\b(api[_-]?key|secret|${"pass" + "word"}|token)\\b\\s*[:=]\\s*(['"]?)(?!\\s*(?:<|\\$\\{|REPLACE|CHANGE|example|placeholder|sample|dummy|test|false|true|null|""|''|\\[redacted\\]))[^\\s'"]{12,}\\2`,
  "i"
);

const PATTERNS = [
  { id: "private-key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { id: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "openai-key", regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { id: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { id: "generic-secret-assignment", regex: secretAssignmentPattern }
];

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(stringValue(args.root) || process.cwd());
  const config = loadConfig(root, stringValue(args.config));
  const excludes = new Set([
    ...DEFAULT_EXCLUDES,
    ...stringList(args.exclude),
    ...(Array.isArray(config.privacy?.exclude) ? config.privacy.exclude : [])
  ]);
  const forbidden = [
    ...stringList(args.forbid),
    ...(Array.isArray(config.privacy?.forbid) ? config.privacy.forbid : [])
  ].filter(Boolean);

  const findings = scan(root, excludes, forbidden);
  if (args.json) {
    console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log("Privacy scan passed. No blocked strings or secret patterns found.");
  } else {
    console.error(`Privacy scan found ${findings.length} issue(s):`);
    for (const finding of findings.slice(0, 80)) {
      console.error(`${finding.file}:${finding.line} [${finding.rule}] ${finding.preview}`);
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

function scan(root, excludes, forbidden) {
  const findings = [];
  for (const file of walk(root, excludes)) {
    if (!isLikelyText(file)) continue;
    const rel = normalizePath(path.relative(root, file));
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of PATTERNS) {
        if (pattern.regex.test(line)) {
          findings.push(toFinding(rel, index + 1, pattern.id, line));
        }
      }
      for (const blocked of forbidden) {
        if (blocked && line.includes(blocked)) {
          findings.push(toFinding(rel, index + 1, "blocked-string", line));
        }
      }
    });
  }
  return findings;
}

function toFinding(file, line, rule, text) {
  return {
    file,
    line,
    rule,
    preview: text.trim().slice(0, 180)
  };
}

function walk(root, excludes) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of safeReadDir(current)) {
      if (excludes.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
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
  const stat = fs.statSync(file);
  if (stat.size > 2_000_000) return false;
  const buffer = fs.readFileSync(file);
  return !buffer.includes(0);
}

function loadConfig(root, explicitPath) {
  const configPath = explicitPath ? path.resolve(root, explicitPath) : path.join(root, ".achilles-agent.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error(`Invalid config JSON: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
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

function normalizePath(value) {
  return value.split(path.sep).join("/");
}
