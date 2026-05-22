# Achilles Agent Commands

Portable agent command adapters for bounded autonomous coding workflows. The command namespace is `auto-achilles-*` and the implementation is intentionally project-neutral: no fixed repository name, remote URL, local path, account name, email, task history, or runtime state is embedded.

## Commands

| Command | Purpose |
| --- | --- |
| `auto-achilles` | Build a bounded execution brief for the next task. |
| `auto-achilles-self` | Prepare a single-agent self-loop with verification gates. |
| `auto-achilles-max` | Split work into independent lanes and define a merge gate. |
| `auto-achilles-tech-debt` | Scan for maintainability risks and stale work markers. |
| `auto-achilles-security` | Run privacy and secret scanning. |
| `auto-achilles-attack` | Produce an adversarial review checklist for a scope. |
| `auto-achilles-structure-update` | Refresh project guidance and command structure. |
| `auto-achilles-language` | Review user-facing copy, naming, and localization readiness. |
| `auto-achilles-market` | Create a product and competitor research brief. |
| `auto-achilles-pull-main` | Dry-run or execute a guarded pull from the configured main branch. |
| `auto-achilles-push-main` | Dry-run or execute a guarded push after checks pass. |

## Install In A Project

1. Copy `.tools/` and `.codex/commands/` into the target project.
2. Copy `.achilles-agent.example.json` to `.achilles-agent.json`.
3. Fill in only project-safe values, such as check commands and the expected remote URL.
4. Keep `.achilles-agent.json` local unless it contains only placeholders.
5. Run `npm test` and `npm run privacy:scan` before publishing changes.

## Configuration

`auto-achilles-*` commands read `.achilles-agent.json` when it exists. The config is optional; without it, commands use conservative defaults:

```json
{
  "taskFile": "TASKS.md",
  "stateDir": ".agent-state",
  "checks": [],
  "publish": {
    "remoteName": "origin",
    "targetBranch": "main",
    "targetRemoteUrl": "",
    "requiredIdentityName": "",
    "requiredIdentityEmail": ""
  },
  "privacy": {
    "exclude": [],
    "forbid": []
  }
}
```

## Safety Model

Commands default to writing local briefs or dry-run output. Publish and pull operations require `--execute` before they mutate a repository. Privacy scanning is included as a first-class gate so project-specific data can be blocked before command packs are shared.
