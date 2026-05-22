---
description: Scan for maintainability risks and stale work markers.
argument-hint: [optional scope]
---

# auto-achilles-tech-debt

Run:

```bash
node .tools/auto-achilles.mjs tech-debt --write --task "$ARGUMENTS"
```

Prioritize concrete risks over cosmetic cleanup. Recommend small, verifiable fixes with file references.
