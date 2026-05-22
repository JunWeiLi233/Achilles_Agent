---
description: Split work into independent lanes and define a merge gate.
argument-hint: [task or scope]
---

# auto-achilles-max

Run:

```bash
node .tools/auto-achilles.mjs max --write --task "$ARGUMENTS"
```

Use the report to separate independent work lanes. Merge only after each lane has verification evidence and the combined diff passes the configured gates.
