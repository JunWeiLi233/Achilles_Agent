import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const commandDir = path.join(root, ".codex", "commands");
const expected = [
  "auto-achilles.md",
  "auto-achilles-attack.md",
  "auto-achilles-language.md",
  "auto-achilles-market.md",
  "auto-achilles-max.md",
  "auto-achilles-pull-main.md",
  "auto-achilles-push-main.md",
  "auto-achilles-security.md",
  "auto-achilles-self.md",
  "auto-achilles-structure-update.md",
  "auto-achilles-tech-debt.md"
].sort();

describe("command surface", () => {
  it("ships only auto-achilles command adapters", () => {
    const actual = fs.readdirSync(commandDir).filter((file) => file.endsWith(".md")).sort();
    assert.deepEqual(actual, expected);
  });

  it("keeps legacy and personal strings out of committed content", () => {
    const blocked = [
      "auto-" + "hermes",
      "Her" + "mes",
      "520" + "HXC",
      "mcpe" + "junwei",
      "C:" + "\\Users",
      "D:/" + "Her" + "mes"
    ];
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, "utf8");
      for (const value of blocked) {
        assert.equal(text.includes(value), false, `${path.relative(root, file)} contains blocked text`);
      }
    }
  });
});

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".agent-state"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    if (entry.isFile()) out.push(full);
  }
  return out;
}
