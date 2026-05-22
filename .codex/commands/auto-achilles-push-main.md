---
description: Dry-run or execute a guarded push after checks pass.
argument-hint: [--execute] [--skip-checks] [--skip-privacy-scan]
---

# auto-achilles-push-main

Dry-run by default:

```bash
node .tools/auto-achilles-push-main.mjs $ARGUMENTS
```

Pass `--execute` only after local checks and privacy scanning have passed.
