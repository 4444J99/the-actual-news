# PR / Issue Evolution Report — `the-actual-news`

**Date:** 2026-11-17  
**Stream:** B (PR / Issue Evolution) of the Autonomous Ecosystem Retirement & Enrichment plan  
**Method:** full remote inventory via `gh` (all states), heuristic supersession detection, local git/oss evidence. Machine-readable evidence: `.opencode/plans/stream-b/2026-11-17-pr-issue-data.json`  
**Staging run:** `09_Engineering/custody-staging/run-20261117-104235-session-retirement/`

> Supersession links below are **evidence-backed candidates**, not licensed merges. No remote PR was closed and no history was rewritten by this pass. Destructive actions are listed as ready-to-run commands for the owner or the orchestration stream.

## 1. Repository state

| Field | Value |
|---|---|
| Local path | `/Volumes/Archive4T/Projects/the-actual-news` |
| GitHub remote | `4444J99/the-actual-news` |
| Upstream archived | no |
| Default branch (remote) | main |
| Local branch | `main` |
| Dirty files | 0 |
| Linked worktrees | 1 (canonical checkout) |
| Last commit | 2026-11-08T22:43:17 — fix(env): reject whitespace-only required environment values (#116) |
| Plan surfaces | none |

## 2. PR inventory

| Metric | Count |
|---|---|
| PRs (all states) | 112 |
| Merged | 43 |
| Open | 0 |
| Closed unmerged | 69 |

Closed-unmerged classification:

| Class | Count |
|---|---|
| closed without successor | 62 |
| superseded (rewrite series) | 6 |
| superseded (dependency retry) | 1 |

## 3. Evolution decisions (old → new)

| Old PR | Old title | Successor | Basis |
|---|---|---|---|
| #20 | build(deps): Bump next from 16.1.6 to 16.1.7 in the npm_and_yarn group a | #30 | superseded (rewrite series) |
| #34 | build(deps): Bump the npm_and_yarn group across 6 directories with 3 upd | #50 | superseded (rewrite series) |
| #54 | build(deps): Bump the github-actions-deps group across 1 directory with  | #119 | superseded (rewrite series) |
| #55 | build(deps): Bump the github-actions-deps group across 1 directory with  | #119 | superseded (rewrite series) |
| #56 | build(deps): Bump the github-actions-deps group across 1 directory with  | #119 | superseded (rewrite series) |
| #65 | build(deps-dev): Bump vitest from 4.1.0 to 4.1.11 in /services/simulatio | #118 | superseded (rewrite series) |
| #113 | build(deps-dev): Bump vitest from 4.1.8 to 4.1.11 in /services/ingestion | #118 | superseded (dependency retry) |

## 4. Items marked archived

- **43 merged PRs** — resolved, no action; history is the archive.
- **7 closed-unmerged PRs with a traced successor** — archived as superseded; each row in §3 is a complete old → new mapping.
- **62 PRs closed without a traced successor** — archived as abandoned. Titles are retained in the evidence file in case a later re-cut needs the original scope.

## 5. Open PR triage

_No open PRs._
## 6. Issues

| Metric | Count |
|---|---|
| Issues (all states) | 8 |
| Open | 5 |
| Open and idle > 45 days | 0 |

Most common labels on open issues: `activation-audit` (1), `enhancement` (3), `ship-soon` (1), `stale` (2).

## 7. Follow-up flags

- No open follow-ups: this repo is at lifecycle steady state.

## 8. Provenance and limits

- PR/issue inventory: `gh pr list`/`gh issue list --state all` for `4444J99/the-actual-news`, captured 2026-11-17.
- Supersession classes: explicit `supersedes #N` in title; dependency retry (same package + directory, newer bump merged); rewrite series (identical title stem, later PR merged); producer retirement (Limen/Jules branch, no successor); otherwise abandoned.
- Heuristic limit: a title-stem match can link two genuinely different changes. Treat §3 as a review queue, not as settled provenance.
- No remote mutation was performed: no PR closed, no issue closed, no branch deleted.
