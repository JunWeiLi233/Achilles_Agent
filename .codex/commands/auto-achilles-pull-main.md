---
description: Dry-run or execute a guarded pull from the configured main branch.
argument-hint: [--execute] [--target-branch branch] [--target-remote-url url]
---

# auto-achilles-pull-main

Dry-run by default:

```bash
node .tools/auto-achilles-pull-main.mjs $ARGUMENTS
```

Pass `--execute` only after confirming the target branch and remote are correct.
