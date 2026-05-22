import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const scanner = path.join(root, ".tools", "auto-achilles-security-scan.mjs");

describe("privacy scanner", () => {
  it("passes placeholder configuration", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "achilles-safe-"));
    fs.writeFileSync(path.join(dir, "config.txt"), "api_key = <REPLACE_ME>\n", "utf8");
    execFileSync(process.execPath, [scanner, "--root", dir], { encoding: "utf8" });
  });

  it("blocks unsafe assignments and caller-provided forbidden strings", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "achilles-block-"));
    const unsafeLine = "api" + "Key = " + JSON.stringify("123456789012345") + "\n";
    fs.writeFileSync(path.join(dir, "unsafe.txt"), `${unsafeLine}release-channel-alpha\n`, "utf8");

    const result = spawnSync(process.execPath, [
      scanner,
      "--root",
      dir,
      "--forbid",
      "release-channel-alpha"
    ], { encoding: "utf8" });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /generic-secret-assignment|blocked-string/);
  });
});
