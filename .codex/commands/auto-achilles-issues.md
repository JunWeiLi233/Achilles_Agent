---
description: List open GitHub issues, render them as TASKS.md blocks, or close one.
argument-hint: [--list | --task-format | --decompose | --close N --comment STR]
---

# auto-achilles-issues

Bridge between GitHub issues and the Auto-Achilles task queue. Run:

```bash
node .tools/auto-achilles-issues.mjs $ARGUMENTS
```

Repo target is resolved in order: `--repo OWNER/NAME` flag → `publish.targetRemoteUrl` in `.achilles-agent.json` → `git remote get-url origin`.

Examples:

```bash
# Session-start scan: open issues as JSON
node .tools/auto-achilles-issues.mjs --list

# Render every open issue as a TASKS.md ## Active Tasks block
node .tools/auto-achilles-issues.mjs --list --task-format

# Decompose large issues with a "Sub-tasks" / "Confirmed gaps" / "已确认的缺口" section
node .tools/auto-achilles-issues.mjs --list --task-format --decompose

# Close an issue after the fix lands
node .tools/auto-achilles-issues.mjs --close 42 --comment "Fixed by auto-achilles."
```

Exits 0 with `{"skipped": true}` when `gh` CLI is missing so a session-start checklist never hard-blocks. Real GitHub API errors surface non-zero.
