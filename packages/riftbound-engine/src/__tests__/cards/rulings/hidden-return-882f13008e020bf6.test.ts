/**
 * Ruling 882f13008e020bf6 — (general Hidden/targeting; exercised with)
 *   Pack of Wonders (OGN-181 → ogn-181-298) · gear · "[Exhaust]: Return another friendly gear, unit, or facedown
 *     card to its owner's hand."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Can I return a hidden (facedown) card back to my hand?
 * A: Yes, but only with an effect that can actually name it: one that targets "a card" / "a facedown card". An
 *    effect that targets "a unit" or "gear" cannot — a facedown card is neither for targeting purposes. Once back
 *    in hand it is an ordinary card again: playable normally, or re-hideable later by paying [A] again. Losing
 *    control of the battlefield instead TRASHES it — that is not a return to hand.
 * Rules: 811.1.b / 811.5.a (Hidden vs. being facedown), 421.4 (a facedown card changing zones is revealed),
 *        355.5 (targets named as the effect is played), 323.7 (facedown card trashed with control of the battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PACK_OF_WONDERS = "ogn-181-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1 holds bf1 with a Sentry, a Hidden Blade facedown there, Pack of Wonders in play and a spare Blade in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 2, rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .gear(P1, PACK_OF_WONDERS, "pack")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, HIDDEN_BLADE, "blade2");
}

/** The targets Pack of Wonders' activated ability offers right now (chosen as it is activated, rule 402.2). */
function packTargets(game: Game): unknown[] {
  const field = game.p1.option("activateAbility", "pack")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).flat();
}

describe("Ruling 882f13008e020bf6 — a facedown card goes back to hand only via an effect that names facedown cards", () => {
  test("an effect that names 'facedown card' offers it: Pack of Wonders lists the facedown Blade among its targets", async () => {
    const game = await board().build();
    expect(packTargets(game)).toContain("blade");
    expect(packTargets(game)).toContain("holder");
  });

  test("picking it returns it to its owner's HAND (not the trash) and it is an ordinary hand card again — full cost, re-hideable", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "blade" });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.p1.hand()).toContain("blade");
    expect(game.state("blade").isHidden).toBe(false);
    // Re-hiding is possible — but bf1 already holds a facedown card, so hide the returned one after
    // the slot is free: the point is that Hide is available to it again as an ordinary hand card.
    expect(game.p1.can("hide", "blade")).toBe(true);
  });

  test("an effect that targets a UNIT cannot name it: Hidden Blade's 'kill a unit at a battlefield' offers the units, never the facedown card", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "blade2")?.fields.find((f) => f.name === "targets");
    const options = (targets?.options ?? []).flat();
    expect(options).toContain("holder");
    expect(options).toContain("wall");
    expect(options).not.toContain("blade"); // a facedown card is not a unit (nor gear)
  });

  test("contrast (323.7): losing control of the battlefield TRASHES the facedown card — that is not a return to hand", async () => {
    const game = await board().build();
    await game.p1.move("holder", "base"); // bf1 empties, control lapses at the Cleanup
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand()).not.toContain("blade");
    expect(game.violations()).toEqual([]);
  });
});
