/**
 * Rules Audit: Replacement Effects (rules 571-575)
 *
 * Replacement effects intercept a game event before it happens and
 * substitute an alternative outcome. They are identified by the word
 * "instead" on a card, and may be either passive or triggered (rule 572).
 *
 * Wave 3F scope — 9 indexed rules:
 *   - 572 (.1/.2): Replacement effects can be passive or triggered abilities
 *   - 573 (.1):    Replacement effects intercede during execution of another effect
 *   - 574:         Replacement effects can alter the flow of play
 *   - 575 (.1/.2): Owner of affected object chooses resolution order
 *
 * Engine-specific behavior additionally tested here:
 *   - `"next"` duration replacements fire ONCE and are then consumed
 *     (tracked in `draft.consumedNextReplacements`).
 *   - `"turn"` duration replacements fire multiple times in a turn.
 *   - `consumedNextReplacements` is cleared at end of turn.
 *   - The recently-added `enters-ready` and `deals-bonus-damage` replacement
 *     events are matched by `checkReplacement()`.
 *
 * The replacement tests drive `checkReplacement()` + `markReplacementConsumed()`
 * directly via `buildReplacementContext()` on the audit engine. This bypasses
 * move validation so the tests focus on the replacement-effect machinery
 * from first principles (the engine's own state-based checks and effect
 * executor just delegate into these same primitives).
 */

import { describe, expect, it } from "bun:test";
import {
  checkReplacement,
  clearConsumedReplacements,
  markReplacementConsumed,
} from "../../abilities/replacement-effects";
import type { ReplacementContext } from "../../abilities/replacement-effects";
import {
  P1,
  P2,
  advancePhase,
  buildReplacementContext,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getConsumedNextReplacements,
} from "./helpers";

// -----------------------------------------------------------------------------
// Ability shapes used across tests.
// -----------------------------------------------------------------------------

/** Zhonya-style: prevent a friendly unit's death (one-shot, turn-scoped). */
const preventFriendlyDeath = (duration: "next" | "turn" | "static" = "static") => ({
  duration,
  replacement: "prevent" as const,
  replaces: "die" as const,
  target: { controller: "friendly" as const, type: "unit" as const },
  type: "replacement" as const,
});

/** Prevent damage to a friendly unit (enemy spell can't damage). */
const preventFriendlyDamage = (duration: "next" | "turn" | "static" = "static") => ({
  duration,
  replacement: "prevent" as const,
  replaces: "take-damage" as const,
  target: { controller: "friendly" as const, type: "unit" as const },
  type: "replacement" as const,
});

/** A "kill an enemy instead of dying" replacement (owner=friendly). */
const killEnemyInsteadOfDying = (duration: "next" | "turn" | "static" = "static") => ({
  duration,
  replaces: "die" as const,
  // Replacement effect payload (engine executor would read and run this)
  replacement: {
    target: { controller: "enemy" as const, type: "unit" as const },
    type: "kill" as const,
  },
  target: { controller: "friendly" as const, type: "unit" as const },
  type: "replacement" as const,
});

/** "The next unit you play enters ready." */
const entersReadyNext = () => ({
  duration: "next" as const,
  replacement: { type: "enter-ready" as const },
  replaces: "enters-ready" as const,
  target: { controller: "friendly" as const, type: "unit" as const },
  type: "replacement" as const,
});

/** "The next spell you play deals 1 bonus damage." */
const bonusDamageNextSpell = () => ({
  duration: "next" as const,
  replacement: { amount: 1, type: "bonus-damage" as const },
  replaces: "deals-bonus-damage" as const,
  target: { controller: "friendly" as const, type: "unit" as const },
  type: "replacement" as const,
});

// -----------------------------------------------------------------------------
// Rule 572: Replacement effects can be passive or triggered abilities.
// -----------------------------------------------------------------------------

describe("Rule 572: A replacement effect alters the application of another effect", () => {
  it("572.1: a passive replacement effect on a card in play matches the event", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "zhonyas", {
      abilities: [preventFriendlyDeath("static")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });
    createCard(engine, "friendly-unit", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "friendly-unit", owner: P1, type: "die" }, ctx);

    expect(matched).not.toBeNull();
    expect(matched?.sourceCardId).toBe("zhonyas");
    expect(matched?.replacement).toBe("prevent");
  });

  it("572: a replacement effect does NOT match events of a different type", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "zhonyas", {
      abilities: [preventFriendlyDeath("static")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });
    createCard(engine, "friendly-unit", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    // "die" is the only replacement registered; a "take-damage" event should miss.
    const matched = checkReplacement(
      { amount: 2, cardId: "friendly-unit", owner: P1, type: "take-damage" },
      ctx,
    );

    expect(matched).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Rule 573: Replacement effects intercede during execution of a game effect.
// -----------------------------------------------------------------------------

describe("Rule 573: Replacement effects intercede in event execution", () => {
  it("573.1: 'instead' death replacement for a friendly unit returns a non-null match", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "guardian", {
      abilities: [killEnemyInsteadOfDying("static")],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "friendly-victim", owner: P1, type: "die" }, ctx);

    expect(matched).not.toBeNull();
    expect(matched?.replacement).toMatchObject({ type: "kill" });
  });

  it("573: a replacement targeting 'friendly' does NOT fire for an enemy-owned affected object", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "zhonyas", {
      abilities: [preventFriendlyDeath("static")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    // The would-die owner is P2 (enemy to zhonyas' controller P1).
    const matched = checkReplacement({ cardId: "enemy-unit", owner: P2, type: "die" }, ctx);

    expect(matched).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Rule 574: Replacement effects can alter the flow of play.
// -----------------------------------------------------------------------------

describe("Rule 574: Replacement effects alter the typical flow of play", () => {
  it("matches the recently-added 'enters-ready' replacement event", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "rally-banner", {
      abilities: [entersReadyNext()],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "new-unit", owner: P1, type: "enters-ready" }, ctx);

    expect(matched).not.toBeNull();
    expect(matched?.duration).toBe("next");
  });

  it("matches the recently-added 'deals-bonus-damage' replacement event", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "focus-lens", {
      abilities: [bonusDamageNextSpell()],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement(
      { cardId: "next-spell", owner: P1, type: "deals-bonus-damage" },
      ctx,
    );

    expect(matched).not.toBeNull();
    expect(matched?.replacement).toMatchObject({ amount: 1, type: "bonus-damage" });
  });
});

// -----------------------------------------------------------------------------
// Rule 575: Owner of the affected object chooses order when multiple apply.
// -----------------------------------------------------------------------------

describe("Rule 575: Multiple replacement effects — owner chooses order", () => {
  it("575: when two death-replacements are eligible, one is returned per call", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "zhonyas-A", {
      abilities: [preventFriendlyDeath("static")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });
    createCard(engine, "zhonyas-B", {
      abilities: [killEnemyInsteadOfDying("static")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "friendly-unit", owner: P1, type: "die" }, ctx);

    // At least one of the two registered replacements fires.
    // Engine returns the first match; rule 575 lets the owner choose which —
    // Both should be eligible, confirming only one is selected per call.
    expect(matched).not.toBeNull();
    expect(["zhonyas-A", "zhonyas-B"]).toContain(matched?.sourceCardId);
  });

  it.todo(
    "Rule 575.1: when the affected object is a player, that player chooses order — " +
      "engine currently returns first-found; owner-selection UI not wired through checkReplacement.",
  );

  it.todo(
    "Rule 575.2: when the affected object is an uncontrolled battlefield, the active " +
      "turn player chooses order — engine currently returns first-found.",
  );
});

// -----------------------------------------------------------------------------
// "next" duration consumption — one-shot bookkeeping layer.
// -----------------------------------------------------------------------------

describe("Replacement duration: 'next' duration is one-shot", () => {
  it("a 'next' replacement fires ONCE and is then consumed", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "tactical-retreat", {
      abilities: [preventFriendlyDeath("next")],
      cardType: "spell",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;

    // First call: match returned.
    const first = checkReplacement({ cardId: "unit-A", owner: P1, type: "die" }, ctx);
    expect(first).not.toBeNull();
    expect(first?.duration).toBe("next");

    // Consume the match (engine does this at the call site).
    if (first) {
      markReplacementConsumed(ctx.draft, first);
    }

    // Second call for an unrelated would-die event: the replacement should NOT fire again.
    const second = checkReplacement({ cardId: "unit-B", owner: P1, type: "die" }, ctx);
    expect(second).toBeNull();
  });

  it("marking a 'next' replacement consumed records a key in consumedNextReplacements", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "highlander", {
      abilities: [preventFriendlyDeath("next")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "unit-A", owner: P1, type: "die" }, ctx);
    expect(matched).not.toBeNull();
    if (matched) {
      markReplacementConsumed(ctx.draft, matched);
    }

    // The consumed key uses the form `${sourceCardId}|${abilityIndex}`.
    const consumed = getConsumedNextReplacements(engine);
    expect(consumed["highlander|0"]).toBe(true);
  });

  it("markReplacementConsumed is a no-op for non-'next' durations", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "aegis", {
      abilities: [preventFriendlyDeath("turn")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "unit-A", owner: P1, type: "die" }, ctx);
    expect(matched).not.toBeNull();
    if (matched) {
      markReplacementConsumed(ctx.draft, matched);
    }

    // Turn-duration replacements are NOT tracked in consumedNextReplacements.
    const consumed = getConsumedNextReplacements(engine);
    expect(Object.keys(consumed)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// "turn" duration — fires multiple times within the turn.
// -----------------------------------------------------------------------------

describe("Replacement duration: 'turn' duration fires repeatedly within the turn", () => {
  it("a 'turn' duration replacement fires multiple times in a row", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "aegis", {
      abilities: [preventFriendlyDamage("turn")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;

    const first = checkReplacement(
      { amount: 2, cardId: "unit-A", owner: P1, type: "take-damage" },
      ctx,
    );
    expect(first).not.toBeNull();
    if (first) {
      markReplacementConsumed(ctx.draft, first);
    }

    // The same replacement fires a second time on a different event.
    const second = checkReplacement(
      { amount: 1, cardId: "unit-B", owner: P1, type: "take-damage" },
      ctx,
    );
    expect(second).not.toBeNull();
    expect(second?.sourceCardId).toBe("aegis");
  });
});

// -----------------------------------------------------------------------------
// End-of-turn cleanup — consumedNextReplacements cleared.
// -----------------------------------------------------------------------------

describe("Replacement cleanup: consumedNextReplacements clears at end of turn", () => {
  it("clearConsumedReplacements wipes the set", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "tactical-retreat", {
      abilities: [preventFriendlyDeath("next")],
      cardType: "spell",
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "unit-A", owner: P1, type: "die" }, ctx);
    if (matched) {
      markReplacementConsumed(ctx.draft, matched);
    }

    expect(Object.keys(getConsumedNextReplacements(engine))).toHaveLength(1);

    clearConsumedReplacements(ctx.draft);
    expect(Object.keys(getConsumedNextReplacements(engine))).toHaveLength(0);
  });

  it("the ending phase 'onEnd' hook clears consumedNextReplacements (rule 517)", () => {
    // Start in the ending phase so we exercise the end-of-turn hook directly.
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "ending" });
    createCard(engine, "tactical-retreat", {
      abilities: [preventFriendlyDeath("next")],
      cardType: "spell",
      owner: P1,
      zone: "base",
    });

    // Seed a consumed marker as if a "next" replacement had fired earlier.
    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "unit-A", owner: P1, type: "die" }, ctx);
    if (matched) {
      markReplacementConsumed(ctx.draft, matched);
    }
    expect(Object.keys(getConsumedNextReplacements(engine))).toHaveLength(1);

    // Advance to awaken — this runs ending.onEnd, which is where clearing lives.
    advancePhase(engine, "awaken");

    expect(Object.keys(getConsumedNextReplacements(engine))).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Replacement events on specific actions.
// -----------------------------------------------------------------------------

describe("Replacement events: 'die' prevents removal by state-based checks", () => {
  it("a die replacement intercepts a would-die event — the engine should not execute the original kill", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "zhonyas", {
      abilities: [preventFriendlyDeath("static")],
      cardType: "gear",
      owner: P1,
      zone: "base",
    });
    // Friendly unit that would die.
    createCard(engine, "doomed-unit", {
      cardType: "unit",
      meta: { damage: 3 },
      might: 3,
      owner: P1,
      zone: "base",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "doomed-unit", owner: P1, type: "die" }, ctx);

    // When a match is returned, the caller (state-based checks) skips the normal kill.
    // This is the contract that rules 571-574 require: the "instead" clause
    // Replaces the default outcome rather than adding to it.
    expect(matched).not.toBeNull();
    expect(matched?.sourceCardId).toBe("zhonyas");
  });
});

describe("Replacement events: on-board scanning", () => {
  it("scans cards on battlefield zones, not just base", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "zhonyas-bf", {
      abilities: [preventFriendlyDeath("static")],
      cardType: "gear",
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "friendly-unit", owner: P1, type: "die" }, ctx);

    expect(matched).not.toBeNull();
    expect(matched?.sourceCardId).toBe("zhonyas-bf");
  });

  it("does NOT pick up replacement abilities on cards in hand/trash (only on-board sources apply)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "zhonyas-hand", {
      abilities: [preventFriendlyDeath("static")],
      cardType: "gear",
      owner: P1,
      zone: "hand",
    });

    const ctx = buildReplacementContext(engine) as unknown as ReplacementContext;
    const matched = checkReplacement({ cardId: "friendly-unit", owner: P1, type: "die" }, ctx);

    expect(matched).toBeNull();
  });
});
