# Contributing to dot-whatsapp

Thank you for contributing. `dot-whatsapp` is a **contract-driven repository**: the workflow below is binding, not advisory. It follows the gentle-ecosystem contribution chain — issue → branch → work-unit commits → PR → review — with the gentle-ai review authority as the final gate.

Read these first:

- [`README.md`](README.md) — what the project is, its design principles, and how to run it
- [`PROMPT-continue-gaps.md`](PROMPT-continue-gaps.md) — current P0/P1 gaps and priorities
- [`CODE_OF_CONDUCT.md`](.github/CODE_OF_CONDUCT.md) — direct, technical, respectful, evidence-first

---

## Issue-first workflow

All planned work is tracked in **GitHub Issues** (this repo) and mirrored in **Linear** (team `BLA`, project *dot-whatsapp*) when the work is significant:

1. **Community reports** — file a GitHub issue using the [issue templates](.github/ISSUE_TEMPLATE/). Evidence is required; free-form ("blank") issues are disabled. Maintainers triage the report into Linear as `BLA-N`.
2. **Every PR references its Linear issue** as `BLA-N` in the PR description (commit footers may carry it too). If the PR resolves a GitHub community issue, also write `Closes #N`.
3. **Statuses update with proof**: `In Progress` must reference the working branch; `Done` requires the commit hash plus test evidence. "It works" is not evidence.
4. **Small, fully-understood work** may be handled inline without a Linear issue (per the `gentle-linear` contract). When in doubt, open one.

---

## Branch model

| Branch | Role | Protection |
|---|---|---|
| `main` | Stable, release branch | PR + 1 required review, dismiss stale reviews, **linear history**, no force push, no deletions, conversation resolution required |
| `dev` | Integration branch — all work PRs land here | PR required |

- **Feature branches** are cut **from `dev`** and named `feat/BLA-N-<short>` or `fix/BLA-N-<short>` (e.g. `fix/BLA-31-rate-limit-retry`).
- **PRs target `dev`.** Never commit directly to `main` or `dev`.
- **Releases** flow `dev` → `main` through an automated release PR (see [Versioning](README.md#versioning)). Merging the release PR tags the version; the version bump is then merged back into `dev`.

---

## Commits — Conventional Commits in work-unit slices

Every commit title follows the Conventional Commits specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types (this repo):** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.
**Breaking changes:** append `!` to the type and add a `BREAKING CHANGE:` footer.

Rules:

- **One logical change per commit** — a commit is a reviewable work unit (~400 authored lines max per slice).
- **Tests and docs travel with the behavior** they cover — never a separate "add tests later" commit.
- **Never mix refactoring with feature work** in the same commit.
- **Every commit title is conventional — including merge commits** (see [Merging and commit rules](#merging-and-commit-rules)).

---

## Pull requests

- **Target `dev`** (the only PRs targeting `main` are the automated release PRs).
- **One work unit per PR** — ≤ ~400 authored lines. Bigger changes are split into **chained PRs**: PR 1 lands first, PR 2 builds on it, and every link in the chain is a complete, reviewable unit.
- **Fill in the [PR template](PULL_REQUEST_TEMPLATE.md)** — work-unit summary, conventional commit list, `BLA-N` link, evidence, changed-line count, roadmap phase.
- **Evidence is required**: paste the actual command output (`pnpm test`, `pnpm typecheck`). No evidence, no review.
- **Review expectations**: reviewers check the binding contracts first (delegate by named reason, spec by reference, no SDD artifacts, flat tree, no `any`), then the diff. Contributors respond to feedback and never self-approve.
- **Review authority chain**: the gentle-ai review is the review authority; maintainer approval gates every merge. The `cowork-verifier` role *invokes* the review authority — it never replaces it.
- **Conversations must be resolved** before merge (enforced on `main`; expected everywhere).

### Merging and commit rules

- The `validate-conventional-commits` workflow enforces **conventional-commit titles on all content commits** of a PR (merge commits are excluded from the automated check). GitHub's default merge subject (`Merge pull request #N from …`) is **not** conventional — this contract still requires editing it before merging.
- PRs merge with the **merge** method using a conventional merge-commit subject, for example:

  ```
  chore: merge PR #N — <type>: <summary>
  ```

- [`.github/CODEOWNERS`](.github/CODEOWNERS) designates `@ipproyectosysoluciones` as the **required code-owner reviewer for every PR**.

---

## Definition of done (before requesting review)

- [ ] `pnpm test` — the full suite passes (88/88 currently; E2E and rate-limit tests are opt-in)
- [ ] `pnpm typecheck` — clean (`tsc --noEmit` on `src/`)
- [ ] **No `any` anywhere** — this is strict TypeScript; use `unknown` and narrow
- [ ] **Spec by reference** — subagent-facing work references `odd/tasks/dot-whatsapp.md` by path. Never paraphrase a spec in an issue, PR description, or prompt — link the source document.

---

## Orchestration contracts (changes touching delegation)

These come from the gentle-ai ROADMAP and are non-negotiable in review:

- **Delegate by named reason, never by size.** Orchestration activates only when a valid delegation reason exists — never because a task "looks big".
- **Flat delegation tree.** Subagents never spawn sub-subagents.
- **No SDD artifacts.** A `TaskContract` is all a delegation carries — no formal proposal/spec/design documents.
- **Invisible to ODD.** Normal flows require no `/cowork` invocation; the `tool_call` hook intercepts only delegation that already has a named reason.

---

## Language boundary

All technical artifacts — issues, PRs, reviews, commits, code, code comments, and documentation — are written in **English**. Always.

---

## Security

Never paste secrets or API keys in issues, PRs, or patches. Report vulnerabilities privately — see [SECURITY.md](.github/SECURITY.md).

---

## License

By contributing, you agree your work is licensed under the repository's [MIT license](LICENSE).

---

## Project-specific notes

### ODD feature document

The single source of truth for this project is `odd/tasks/dot-whatsapp.md`. It contains:

- **Specs** (S1–S9): numbered, quoted verbatim from owner decisions
- **Tasks** (T1–T11 + P0/P1): one line each with ID, linked specs, route, commit
- **Log** (L1–L19): every owner decision, evidence, and correction verbatim

When you change a requirement, append its verbatim Log entry, rewrite only the affected `S#`, and reopen only its task.

### Current P0/P1 gaps

See `PROMPT-continue-gaps.md` for the ordered list:

| Task | Description | Status |
|---|---|---|
| P0-1 | E2E test `channel_notify` flow (docker-compose) | Done |
| P0-2 | Document Meta Cloud credentials | Done (README + RUNBOOK) |
| P0-3 | Upstream repo `Gentleman-Programming/dot-whatsapp` | Pending admin |
| P1-1 | Rate limit queue + exponential retry | Done (tests WIP) |
| P1-2 | Webhook HMAC verification audit | Done (14 tests) |

### RDD (Receipt-Driven Development)

This repo has RDD enabled via `gentle-ai`. After implementation:

1. Run `gentle_review` with `{"operation":"inspect"}` to check for unreviewed candidates
2. If a candidate exists, `gentle_review` with `{"operation":"start"}` with lenses chosen by consequence (risk, reliability, readability)
3. Complete the review or explicitly leave the candidate unreviewed with a documented decision

### Test expectations

- **Unit/integration tests** must cover the behavior they pin (exit code, exact stdout/stderr, rejected input leaves data unchanged)
- **E2E tests** (`pnpm test:e2e`) require docker-compose with engram + daemon + bridge
- **Rate-limit tests** are WIP (some timeouts); run with `pnpm test test/rate-limit.test.ts`
- **HMAC audit tests** (`pnpm test test/webhook-hmac-audit.test.ts`) — 14 tests passing
- **Protocol tests** cover parser/serializer for all message types including new `channel_notify`

---

## Gentle-ecosystem contracts reference

| Contract | Source |
|---|---|
| Gentle-AI RDD | `gentle-ai` package (`gentle_review` tool) |
| Gentle-AI Delegation | `gentle-ai` ROADMAP (`orchestrator-delegation.md`) |
| Gentle-AI Verification | `gentle-ai` (`orchestrator-verification.md`) |
| Gentle-Shell Commits | `gentle-shell` (`work-unit-commits` skill) |
| Gentle-Linear | `gentle-linear` skill (Linear tracking) |
| Gentle-Contributions | `gentle-contributions` skill (upstream chain) |

---

## Questions?

Open a GitHub issue with the [question template](.github/ISSUE_TEMPLATE/question.yml) or ping `@ipproyectosysoluciones` in an existing issue/PR.