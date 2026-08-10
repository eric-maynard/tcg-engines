/**
 * Ruling e5f3d5bfa475ee1b — Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · Fury · 6 · 5 Might
 *     "When you play me, opponents can't play cards this turn."
 *   × Not So Fast (SFD-045 → sfd-045-221) · [Reaction] "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: Can Brynhir Thundersong be reacted to?
 * A: Not the unit herself — she resolves to the board immediately with no window. But her "When you play me" trigger goes on
 *    the chain and CAN be responded to (any Reaction, e.g. flipping a hidden card) before it resolves. Not So Fast cannot
 *    counter it (it targets no unit/gear). Once the trigger resolves the lock-out is absolute for the rest of the turn.
 * Rules: 339–340 (permanents resolve at once; play triggers chain), 336/811 (Reactions incl. from Hidden), NSF's target
 *        restriction, "can't play cards this turn".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";
const NOT_SO_FAST = "sfd-045-221";
const SPRITE_CALL = "ogn-094-298"; // a Hidden [Action] spell for P2's facedown card
/** A 1-cost [Reaction] "Deal 1 to a unit" — a generic reaction to observe the response window / the lock. */
const ZAP = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  timing: "reaction",
} as const;

/**
 * Turn 3, P1 active with [8]: Brynhir + a Zap in hand. P2 holds bf1 (Holder 3) with Sprite Call hidden there, and has
 * Not So Fast + two Zaps in hand with 4 + [calm].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 8 })
    .resources(P2, { energy: 4, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .facedown(P2, "bf1", SPRITE_CALL, "call")
    .hand(P1, BRYNHIR, "bryn")
    .hand(P1, ZAP, "p1zap")
    .hand(P2, NOT_SO_FAST, "nsf")
    .hand(P2, ZAP, "zap1")
    .hand(P2, ZAP, "zap2");
}

/** P1 plays Brynhir and passes → P2 holds priority with her play trigger on the chain. */
async function brynhirTriggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("bryn");
  return game;
}

describe("Ruling e5f3d5bfa475ee1b — Brynhir herself can't be responded to, her play trigger can (but not with Not So Fast)", () => {
  test("Step 1: the unit resolves IMMEDIATELY — Brynhir is in P1's base the moment she is played, and the only thing on the chain is her TRIGGER", async () => {
    const game = await brynhirTriggerOnChain();
    expect(game.zoneOf("bryn")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bryn", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("Steps 2–3: P2 gets priority against the trigger and MAY react — a Reaction spell and the hidden card are both legal — but Not So Fast is NOT (the trigger chooses no unit or gear)", async () => {
    const game = await brynhirTriggerOnChain();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "zap1")).toBe(true);
    expect(game.p2.can("reveal", "call")).toBe(true);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    // P2 reacts: Zap Brynhir. It resolves (LIFO) while her trigger still waits.
    await game.p2.cast("zap1", { targets: "bryn" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bryn", "zap1"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("zap1")).toBe("trash");
    expect(game.state("bryn")).toMatchObject({ damage: 1, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bryn", triggered: true })]);
  });

  test("Step 4: once the trigger resolves, P2 can't play cards for the rest of the turn — given priority later, neither the second Zap nor the hidden Sprite Call is legal", async () => {
    const game = await brynhirTriggerOnChain();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.cannotPlayCardsThisTurn?.[P2]).toBe(true);
    expect(game.gameState.cannotPlayCardsThisTurn?.[P1]).not.toBe(true); // "opponents" only
    // Give P2 a priority window: P1 casts a spell.
    await game.p1.cast("p1zap", { targets: "holder" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "zap2")).toBe(false);
    expect(game.p2.can("reveal", "call")).toBe(false);
    expect(game.p2.legal().map((o) => o.key).filter((k) => !k.startsWith("concede"))).toEqual(["passChainPriority:-"]);
    expect(game.violations()).toEqual([]);
  });

  test("…and it is 'this turn' only: on P2's own next turn Zap is castable again", async () => {
    const game = await brynhirTriggerOnChain();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("cast", "zap2")).toBe(true);
  });
});
