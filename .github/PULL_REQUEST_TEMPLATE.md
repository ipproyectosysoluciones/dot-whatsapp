---
name: Pull Request
about: Submit a work unit for review
title: "<type>(<scope>): <description>"
labels: ""
assignees: ""
---

## Work-unit summary

One sentence: what this PR does and why.

## Related issue / Linear task

- **Linear**: `BLA-N` (or "N/A" for small inline work)
- **GitHub issue**: `Closes #N` or "N/A"

## Changes

| File | Change |
|---|---|
| | |

## Evidence

**Tests**:

```bash
pnpm test
# paste output
```

**Typecheck**:

```bash
pnpm typecheck
# paste output
```

**E2E (if applicable)**:

```bash
pnpm test:e2e
# paste output
```

## Conventional commits

List the commit titles in this PR (should be ≤ 400 lines each):

```
<type>(<scope>): <description>
```

## Risk assessment

| Risk item | Applies? | Mitigation |
|---|---|---|
| 1. Data/irreversible effects | | |
| 2. Security (auth, secrets, guards) | | |
| 3. Contracts others consume | | |
| 4. Concurrency | | |
| 5. Delivery/environment | | |
| 6. No test would catch regression | | |

If any item applies, explain in **Risk details** below.

## Risk details

<explain any checked items>

## Checklist

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] No `any` in new/changed code
- [ ] Tests and docs travel with the behavior
- [ ] Spec by reference (`odd/tasks/dot-whatsapp.md` path, not paraphrased)
- [ ] `odd/tasks/dot-whatsapp.md` updated (specs/tasks/log) if requirements changed
- [ ] PR targets `dev` branch
- [ ] Commit titles are conventional (including merge commit if applicable)