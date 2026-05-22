#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = findProjectRoot(process.cwd());
  const config = loadConfig(root, stringValue(args.config));
  const publish = config.publish || {};
  const remoteName = stringValue(args["remote-name"]) || publish.remoteName || "origin";
  const targetBranch = stringValue(args["target-branch"]) || publish.targetBranch || "main";
  const expectedRemote = stringValue(args["target-remote-url"]) || publish.targetRemoteUrl || "";
  const execute = Boolean(args.execute);

  validateRemote(root, remoteName, expectedRemote);
  validateIdentity(root, publish);
  validateBranch(root, targetBranch);
  validateCleanTree(root, args);

  const commands = [];
  if (!args["skip-checks"]) {
    for (const check of Array.isArray(config.checks) ? config.checks : []) {
      commands.push(["check", check]);
    }
  }
  if (!args["skip-privacy-scan"]) {
    commands.push(["privacy", `${process.execPath} .tools/auto-achilles-security-scan.mjs --root .`]);
  }
  commands.push(["push", `git push ${remoteName} ${targetBranch}`]);

  if (!execute) {
    console.log("Dry run. Planned guarded push:");
    for (const [kind, command] of commands) console.log(`[${kind}] ${command}`);
    console.log("Pass --execute to run these commands.");
    return;
  }

  for (const [kind, command] of commands) {
    if (kind === "push") {
      git(root, ["push", remoteName, targetBranch], { inherit: true });
    } else {
      runShell(root, command);
    }
  }
}

function validateRemote(root, remoteName, expectedRemote) {
  const actual = git(root, ["remote", "get-url", remoteName]).trim();
  if (!actual) fail(`Remote not found: ${remoteName}`);
  if (expectedRemote && actual !== expectedRemote) {
    fail(`Remote mismatch for ${remoteName}. Expected ${expectedRemote}, got ${actual}.`);
  }
}

function validateIdentity(root, publish) {
  const expectedName = publish.requiredIdentityName || "";
  const expectedEmail = publish.requiredIdentityEmail || "";
  if (expectedName) {
    const actualName = git(root, ["config", "user.name"]).trim();
    if (actualName !== expectedName) fail("Configured git user.name does not match the required publish identity.");
  }
  if (expectedEmail) {
    const actualEmail = git(root, ["config", "user.email"]).trim();
    if (actualEmail !== expectedEmail) fail("Configured git user.email does not match the required publish identity.");
  }
}

function validateBranch(root, targetBranch) {
  const branch = git(root, ["branch", "--show-current"]).trim();
  if (branch !== targetBranch) fail(`Current branch is ${branch || "(detached)"}, expected ${targetBranch}.`);
}

function validateCleanTree(root, args) {
  if (args["allow-dirty"]) return;
  const dirty = git(root, ["status", "--porcelain"]).trim();
  if (dirty) fail("Working tree is dirty. Commit or pass --allow-dirty intentionally.");
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
  const file = explicitPath ? path.resolve(root, explicitPath) : path.join(root, ".achilles-agent.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Invalid config JSON: ${error.message}`);
  }
}

function git(root, args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"]
    }) || "";
  } catch (error) {
    fail(error.stderr?.toString() || error.message);
  }
}

function runShell(root, command) {
  try {
    execFileSync(command, {
      cwd: root,
      shell: true,
      stdio: "inherit"
    });
  } catch (error) {
    fail(error.message);
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
    out[key] = rawValue ?? (args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true);
  }
  return out;
}

function stringValue(value) {
  if (typeof value === "string") return value;
  return "";
}

function fail(message) {
  console.error(String(message).trim());
  process.exit(1);
}
