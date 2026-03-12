## Prompt:

```
Run Architecture Lint Mode.

Read:
- docs/ai/AGENT_PROTOCOL.md
- docs/ai/REPOSITORY_AI_CONTEXT.md
- docs/ai/ARCHITECTURE_LINT_RULES.md

Then:

1. inspect the repository against these rules
2. run available architectural lint commands if possible
3. report findings grouped by severity
4. separate:
   - confirmed violations
   - suspicious patterns needing review
   - acceptable exceptions
5. do not redesign anything
6. do not implement fixes

Use this response shape:

1. Objective
2. Lint Results
3. Confirmed Violations
4. Suspicious Patterns
5. Acceptable Exceptions
6. Recommended Next Action
```

## Jak tego używać w praktyce

Masz 3 główne zastosowania.

1. Przed większym refactorem

Uruchamiasz:

pnpm arch:lint

potem Architecture Guard w Lint Mode

2. Po implementacji większego feature

Sprawdzasz, czy nic nie rozwaliło boundary.

3. W PR review

To jest najlepsze zastosowanie.

Co jeszcze można dodać później

Jak będziesz chciał poziom wyżej, można dołożyć:

dependency-cruiser z formalnymi regułami importów

custom ESLint rules dla warstw

GitHub Action odpalającą pnpm arch:lint

osobny Safe Refactor Workflow
