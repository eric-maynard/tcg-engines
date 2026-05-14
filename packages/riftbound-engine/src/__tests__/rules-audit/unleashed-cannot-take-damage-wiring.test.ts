/**
 * Rules Audit: Kayn, Unleashed — "I don't take damage" parser→engine wiring
 *
 * Tick 11 made the engine respect a `meta.cannotTakeDamage` flag (rule
 * 460.2.c.9 — "if a unit cannot be dealt damage, no amount of damage is
 * lethal"). This file verifies the *static-ability* path that actually sets
 * that flag from Kayn's parsed rules text:
 *
 *   "[Ganking] If I have moved twice this turn, I don't take damage."
 *     parsed → static ability
 *       { condition: { text: "If I have moved twice this turn", type: "custom" },
 *         effect:    { restriction: "no-damage", type: "restriction" } }
 *
 * The cards parser already produces this shape (see riftbound-cards
 * static-parser `ifDamageRestrictionMatch`); what was missing was the engine
 * side:
 *   - movement / gankingMove now bump `meta.movedThisTurnCount`
 *   - the Awaken phase resets it for every unit at turn start
 *   - `recalculateStaticEffects` understands the `restriction: "no-damage"`
 *     static effect and the `custom` "moved twice this turn" condition,
 *     setting/clearing `meta.cannotTakeDamage` accordingly.
 *
 * Rules covered: 460.2.c.9, 616-619/722 (move tracking), 567-570 (static
 * ability recalc), 515.1 (Awaken reset).
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardMeta,
  recalculateStatics,
} from "./helpers";
import type { CardId } from "../../types";

/** The static ability the cards parser emits for Kayn's second line. */
const NO_DAMAGE_WHEN_MOVED_TWICE = [
  {
    condition: { text: "If I have moved twice this turn", type: "custom" },
    effect: { restriction: "no-damage", type: "restriction" },
    type: "static",
  },
] as unknown as Parameters<typeof createCard>[2]["abilities"];

describe("Unleashed — Kayn 'I don't take damage' static (rule 460.2.c.9)", () => {
  it("does NOT flag cannotTakeDamage before the unit has moved twice", () => {
    const engine = createMinimalGameState();
    createCard(engine, "kayn" as CardId, {
      abilities: NO_DAMAGE_WHEN_MOVED_TWICE,
      cardType: "unit",
      keywords: ["Ganking"],
      meta: { movedThisTurnCount: 1 },
      might: 6,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    expect(getCardMeta(engine, "kayn" as CardId)?.cannotTakeDamage).not.toBe(true);
  });

  it("flags cannotTakeDamage once the unit has moved twice this turn", () => {
    const engine = createMinimalGameState();
    createCard(engine, "kayn" as CardId, {
      abilities: NO_DAMAGE_WHEN_MOVED_TWICE,
      cardType: "unit",
      keywords: ["Ganking"],
      meta: { movedThisTurnCount: 2 },
      might: 6,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    expect(getCardMeta(engine, "kayn" as CardId)?.cannotTakeDamage).toBe(true);
  });

  it("clears a stale cannotTakeDamage flag when the move count drops back below 2", () => {
    const engine = createMinimalGameState();
    createCard(engine, "kayn" as CardId, {
      abilities: NO_DAMAGE_WHEN_MOVED_TWICE,
      cardType: "unit",
      keywords: ["Ganking"],
      meta: { cannotTakeDamage: true, movedThisTurnCount: 0 },
      might: 6,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    // A static "no-damage" owner whose condition no longer holds loses the flag.
    expect(getCardMeta(engine, "kayn" as CardId)?.cannotTakeDamage).toBe(false);
  });

  it("does NOT clear cannotTakeDamage on a unit with no static no-damage ability", () => {
    const engine = createMinimalGameState();
    createCard(engine, "warded" as CardId, {
      cardType: "unit",
      meta: { cannotTakeDamage: true },
      might: 3,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    // Flag set by some other (one-shot / combat) effect must survive a recalc.
    expect(getCardMeta(engine, "warded" as CardId)?.cannotTakeDamage).toBe(true);
  });
});

describe("Unleashed — Kayn move tracking (rules 616-619 / 722)", () => {
  it("gankingMove bumps the unit's movedThisTurnCount", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P1 });
    createBattlefield(engine, "bf-3", { controller: P1 });
    createCard(engine, "kayn" as CardId, {
      abilities: NO_DAMAGE_WHEN_MOVED_TWICE,
      cardType: "unit",
      keywords: ["Ganking"],
      might: 6,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    // First move bf-1 → bf-2.
    const r1 = applyMove(engine, "gankingMove", {
      playerId: P1,
      toBattlefield: "bf-2",
      unitId: "kayn",
    });
    expect(r1.success).toBe(true);
    expect(getCardMeta(engine, "kayn" as CardId)?.movedThisTurnCount).toBe(1);
    // One move only — not yet exempt.
    expect(getCardMeta(engine, "kayn" as CardId)?.cannotTakeDamage).not.toBe(true);

    // Ganking exhausts the mover; ready it manually so the second move is legal.
    // `setFlag` stores under `meta.__flags`, so clear that (and the mirror).
    const internal = engine as unknown as {
      internalState: {
        cardMetas: Record<string, { exhausted?: boolean; __flags?: { exhausted?: boolean } }>;
      };
    };
    internal.internalState.cardMetas.kayn.exhausted = false;
    if (internal.internalState.cardMetas.kayn.__flags) {
      internal.internalState.cardMetas.kayn.__flags.exhausted = false;
    }

    // Second move bf-2 → bf-3.
    const r2 = applyMove(engine, "gankingMove", {
      playerId: P1,
      toBattlefield: "bf-3",
      unitId: "kayn",
    });
    expect(r2.success).toBe(true);
    expect(getCardMeta(engine, "kayn" as CardId)?.movedThisTurnCount).toBe(2);
    // After two moves the post-move cleanup recalc should have set the flag.
    expect(getCardMeta(engine, "kayn" as CardId)?.cannotTakeDamage).toBe(true);
  });
});
