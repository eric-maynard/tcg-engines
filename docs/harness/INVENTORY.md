# Inventory — 2026-08-07 08:22 UTC (HEAD a181534)

## Engine test suite
- `bun test packages/riftbound-engine/src/__tests__/`: **5211 tests / 614 files / 0 fail** (working tree == HEAD).
- Test corpus: per-card **432** files · interactions **42** · official rulings (train) **58** · core-rules **17** · harness/points/leave-board unit tests.
- Still `test.failing` (open BUGs): **32**.

## Fix queue (.claude/fix-queue)
- done **1082** · open **212** (after requeue of 144 previously-failed) · failed **0** · 276 commits since checkpoint #1.
- Metrics: `bun .claude/fix-queue/fix-queue.ts report` (auto-sampled JSONL).

## Landed capabilities (cross-cutting)
- WP1 / G1 score & victory pipeline — `operations/points.ts` (awardPoints/markScored/checkVictory), `score` event.
- WP3 / G5 leaveBoard choke point + LKI — `operations/leave-board.ts`, `operations/damage-store.ts`.
- Agent harness (L0–L4) `src/harness/`, BrowserBackend `src/harness/browser/`, MCP server `packages/riftbound-mcp` (22 tools).
- Gap report: `docs/harness/ENGINE-CAPABILITY-GAPS.md` (G2 choice algebra, G4 cost model, G3 nested plays … still open).

## Machinery
- Workflows: riftbound-test (browser discovery → enqueue), riftbound-card-unit-tests (deep mode), riftbound-interaction-tests, riftbound-ruling-tests, riftbound-core-rules-tests, riftbound-fixer (12 workers, claude-opus-5-fast[1m], patch-gated `land-patch.sh` committing tested bytes from a side worktree).
- Primer: `.claude/fix-queue/FIXER-PRIMER.md`. Devbox app synced from verified HEAD; no bounce during browser passes.

## Remaining sweep
- 356 cards without a per-card test file (5 deep-mode batches pre-sliced); deep-interaction round; 10 train rulings (1 lane) outstanding.
