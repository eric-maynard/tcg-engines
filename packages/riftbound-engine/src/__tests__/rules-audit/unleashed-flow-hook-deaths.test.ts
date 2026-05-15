/**
 * Rules Audit: Deaths caused by flow phase hooks (Unleashed CR 2026-03-30)
 *
 * The engine-wide post-move cleanup hook (`withPostMoveCleanup`) runs state-
 * based checks (rules 518-526) + `die`/Deathknell triggers (rule 540.x / 813)
 * after every *move*. It does NOT run after a flow phase-transition hook.
 * Two phase hooks can kill a Unit:
 *   - The Beginning phase trashes the Turn Player's Temporary permanents
 *     (rule 728.1.b) — leaving the Board is "dying", so Deathknell must fire.
 *   - The Cleanup phase runs end-of-turn state-based checks (rules 518-526).
 * `runFlowCleanup` in the flow definition closes that gap.
 *
 * Methodology: minimal state -> run one phase hook -> assert the rules-correct
 * side effect (the unit is trashed AND its Deathknell ran). Cites rule numbers.
 */

import { describe, expect, it } from "bun:test";
import type { RiftboundCardMeta } from "../../types";
import {
  P1,
  createCard,
  createMinimalGameState,
  getCardMeta,
  getCardsInZone,
  runPhaseHook,
} from "./helpers";

/**
 * Total marked damage on a card — combat / move code writes `meta.damage`,
 * the counter system writes `meta.__counters.damage`; flow-hook-fired effects
 * use the latter. `performCleanup` reads `max(meta.damage, __counters.damage)`,
 * so reading the same max here mirrors the engine.
 */
function markedDamage(meta: (Partial<RiftboundCardMeta> & { __counters?: Record<string, number> }) | undefined): number {
  return Math.max(meta?.damage ?? 0, meta?.__counters?.damage ?? 0);
}

// A Deathknell that deals 1 damage to the dying unit itself — observable on
// The trashed card's `damage` meta (same fixture style as the death-triggers
// Audit). If the Deathknell did NOT fire, `damage` stays 0.
const DEATHKNELL_SELF_DAMAGE = {
  effect: { amount: 1, target: { type: "self" }, type: "damage" },
  keyword: "Deathknell",
  type: "keyword" as const,
};

describe("Rule 728.1.b + 813: Temporary permanents trashed at Beginning fire Deathknell", () => {
  it("a Temporary unit with [Deathknell] is trashed AND its Deathknell runs", () => {
    const engine = createMinimalGameState({ phase: "awaken" });
    // P1 is the turn player (createMinimalGameState seeds turn 1 -> player-1).
    createCard(engine, "ephemeral", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      keywords: ["Temporary"],
      might: 2,
      owner: P1,
      zone: "base", // Permanents live in the controller's base
    });

    // Beginning phase onBegin: kill Temporary permanents before scoring, then
    // Run state-based checks + die triggers (rule 728.1.b -> 540.x / 813).
    runPhaseHook(engine, "beginning", "onBegin");

    // The Temporary unit left the Board -> in P1's trash.
    expect(getCardsInZone(engine, "trash", P1)).toContain("ephemeral");
    expect(getCardsInZone(engine, "base", P1)).not.toContain("ephemeral");
    // Its Deathknell fired: "deal 1 to self" landed on the trashed card.
    expect(markedDamage(getCardMeta(engine, "ephemeral"))).toBe(1);
  });

  it("a non-Temporary unit at base is NOT trashed by the Beginning hook", () => {
    const engine = createMinimalGameState({ phase: "awaken" });
    createCard(engine, "permanent-unit", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    runPhaseHook(engine, "beginning", "onBegin");

    expect(getCardsInZone(engine, "base", P1)).toContain("permanent-unit");
    expect(markedDamage(getCardMeta(engine, "permanent-unit"))).toBe(0);
  });
});

describe("Rules 518-526: the Cleanup phase runs end-of-turn state-based checks", () => {
  it("a lethally-damaged unit lingering on the Board is reaped by the Cleanup hook + fires Deathknell", () => {
    const engine = createMinimalGameState({ phase: "ending" });
    // Simulate a unit that ended the turn with lethal marked damage that no
    // Move reaped (e.g. damage applied by an Ending-phase effect): Might 2,
    // 2 damage marked.
    createCard(engine, "doomed", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      meta: { damage: 2 },
      might: 2,
      owner: P1,
      zone: "base",
    });

    // The Cleanup phase onBegin runs state-based checks (rules 518-526).
    runPhaseHook(engine, "cleanup", "onBegin");

    expect(getCardsInZone(engine, "trash", P1)).toContain("doomed");
    // Deathknell fired on the now-trashed unit (its damage was reset to 0 on
    // Death, then the Deathknell's "deal 1 to self" re-marked 1).
    expect(markedDamage(getCardMeta(engine, "doomed"))).toBe(1);
  });

  it("a sub-lethal unit on the Board survives the Cleanup hook", () => {
    const engine = createMinimalGameState({ phase: "ending" });
    createCard(engine, "scratched", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      meta: { damage: 1 },
      might: 3,
      owner: P1,
      zone: "base",
    });

    runPhaseHook(engine, "cleanup", "onBegin");

    expect(getCardsInZone(engine, "base", P1)).toContain("scratched");
  });
});
