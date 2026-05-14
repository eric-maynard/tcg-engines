# Engine gaps surfaced by the engine↔UI binding (Phase B batch 13 sub-agent U)

These were spotted while writing `lib/engine-session.ts`, `lib/bot-driver.ts`, and the bot-vs-bot tests. None block the binding (we worked around all of them), but each is a paper-cut every UI client will hit. Filed for batch 14.

## 1. `RuleEngine.internalState` is private but UIs need it

`apps/riftbound-app/server.ts` already reaches into it via a `(engine as unknown as { internalState: … }).internalState` cast. `engine-session.ts` does the same to count cards per player. Should be exposed as a stable read-only getter — e.g. `engine.snapshot()` returning `{ zones, cards, cardMetas }` (deep-clone or readonly view).

**Fix sketch:** add `getInternalSnapshot()` (or just `snapshot()`) to `RuleEngine` in `packages/core/src/engine/rule-engine.ts`, document it as the canonical UI-facing zone/card read API, and migrate `server.ts` + `engine-session.ts` to use it.

## 2. Zones are global but card sizes are needed per-player

Riftbound zones (`hand`, `mainDeck`, `runeDeck`, `trash`, `runePool`, `base`, `legendZone`, `championZone`) are all single shared zones. Per-player counts (e.g. "how many cards in P1's hand?") have to be derived by scanning every card and grouping by `owner`+`zone`. Every UI client will rewrite this loop.

**Fix sketch:** add a helper on the riftbound engine — `getPlayerZoneCounts(playerId): Record<string, number>` or a richer `getPlayerView(playerId): { hand: CardId[], deck: CardId[], … }`. Lives next to `createPlayerView` in `packages/riftbound-engine/src/views/`.

## 3. `enumerateMoves` returns no move category

The bot driver had to hard-code a priority table by `moveId`, e.g. `playUnit` outranks `exhaustRune`. With ~30 move IDs that's brittle; new moves silently get `PRIORITY_DEFAULT` and behave randomly. Move definitions should self-classify (e.g. `category: "tempo" | "resource" | "combat" | "system" | "win-con"`) so bots / AIs / UIs can write rules like "prefer any tempo move over resource moves".

**Fix sketch:** extend `MoveDefinition` in `packages/core/src/moves/` with an optional `category` field; populate per-move in `game-definition/moves/*.ts`. Bot priority tables collapse to category-priorities.

## 4. No "what would my legal moves be next turn?" API

For planning (look-ahead AI, "should I end the turn?" heuristics), it would help to query the move-enumerator against a hypothetical state. Right now `engine.enumerateMoves` operates on the live state only.

**Fix sketch:** add `engine.enumerateMovesFor(state, playerId)` that takes an arbitrary state. Pure function, no side effects.

## 5. Synthetic-card setup throws no clear error if registry is empty

The bot-vs-bot test uses synthetic card IDs like `player-1-card-0` that aren't in the card registry. The engine accepts these and the game runs (good for smoke testing), but several enumerator paths must be quietly bailing out — only `endTurn`/`exhaustRune`/`concede` come back. There's no log or hint that registry lookups failed. A small debug-mode warning ("X enumerator skipped move M because card definition Y not found") would shorten the next debug session.

## 6. `transitionToPlay` skips the rollForFirst / chooseFirst / mulligan flow

This is fine for testing (we want a quick playing-state game) but the move is currently a system move with no documented "for tests only" tag. Either:

- explicitly mark it `testing: true` so prod UIs avoid it, OR
- document the supported "skip pregame" entry points.

The session adapter exposes `autoStartPlaying` which calls it — works, but the abstraction leaks if someone later wants the full pregame flow.

## 7. `RuleEngine.executeMove` never throws — failure goes through `result.success`

The session adapter wraps in try/catch anyway in case the engine's internal validators throw. So far they don't, but the API doesn't promise it. Should be documented: "executeMove always returns a `MoveExecutionResult` and never throws for validation failures; thrown errors indicate engine bugs."
