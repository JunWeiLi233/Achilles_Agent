---
description: Prepare a single-agent self-loop with verification gates.
argument-hint: [task or scope]
---

# auto-achilles-self

Run:

```bash
node .tools/auto-achilles.mjs self --write --task "$ARGUMENTS"
```

Execute one bounded loop only: inspect, edit, verify, record. Stop if the same blocker repeats or if publishing would require credentials.
