/**
 * Unsung Hero — sfd-167-221 · Unit · Order · 2 energy (no power) · 2 Might
 *
 *   [Deathknell] — If I was [Mighty], draw 2. (When I die, get the effect. I'm Mighty while I have
 *   5+ [Might].)
 *
 * Rules: 808 (Deathknell = "When I die, …" — a triggered ability put on the chain as the unit is
 * killed; 808.1.d.3 its attributes are NOTED before it moves to the trash, so "was Mighty" reads the
 * Might it had on the board at the moment of death, not its printed 2 in the trash — 711 does not
 * apply); 708/710 (Mighty = effective Might ≥ 5: buffs, "+N this turn", Equipment and Assault-while-
 * attacking all count; damage never lowers Might); 807.1.d.1 + 466.7.a (an attacker keeps Assault
 * until designations are removed at the very end of combat — i.e. AFTER combat deaths); 383 (the
 * trigger's controller is the unit's controller, whoever's turn it is).
 *
 * Head-judge corner cases covered below:
 *   1. Vanilla death at 2 Might → NO cards. One short (4) → NO cards. Exactly 5 → 2 cards.
 *   2. "was" is the moment of death, not "ever this game": pumped to 5 this turn but killed NEXT turn
 *      (back to 2) → nothing.
 *   3. Lethal damage on a 5-Might Hero: damage does not reduce Might → still Mighty → draws.
 *   4. Dies ATTACKING with Cleave's [Assault 3] (2+3 = 5 while an attacker) into a 6-Might wall →
 *      it was Mighty when it died → draws 2.
 *   5. Killed on the OPPONENT's turn by their spell → the trigger is P1's chain item and P1 draws.
 *   6. Real partner: Back to Back (+2 to two friendly units) on a buffed Hero (3) makes 5; an enemy
 *      kill in the same turn pays out.
 *   7. Cost: 2 energy, enters the base exhausted; 1 energy → not playable.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-167-221";
const CLEAVE = "ogn-004-298"; // Action, 1: Give a unit [Assault 3] this turn.
const BACK_TO_BACK = "ogn-206-298"; // Reaction, 3: Give two friendly units each +2 Might this turn.
const DORANS_BLADE = "sfd-095-221"; // Equipment, +2 Might while attached

/** 0-cost spell "Deal 6 to a unit." at the given timing. */
const zap = (timing: "action" | "reaction" = "action") => ({
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: timing === "action" ? "Zap" : "Quick Zap",
  timing,
});

/** P1's turn; Hero in base with optional meta; P1 holds a Zap to kill it; hand otherwise empty. */
function heroBoard(meta?: Record<string, unknown>) {
  return scenario().unit(P1, "base", CARD, "hero", meta).hand(P1, zap(), "zap");
}

describe("Unsung Hero (sfd-167-221)", () => {
  test("plays for exactly 2 energy to base, exhausted, as a 2-Might unit; 1 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "hero").build();
    await game.p1.play("hero");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("base");
    expect(game.state("hero")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2 });
    expect(game.state("hero").keywords).toContain("Deathknell");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "hero").build();
    expect(poor.p1.can("play", "hero")).toBe(false);
  });

  test("dies while Mighty (2 + 3 this turn = exactly 5): a triggered item controlled by P1 goes on the chain, then P1 draws 2; Hero ends in the trash", async () => {
    const game = await heroBoard({ mightModifier: 3 }).build();
    expect(game.state("hero").might).toBe(5);
    const deck = game.p1.deck().length;
    await game.p1.cast("zap", { targets: "hero" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Zap resolves → lethal → Deathknell pending
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hero", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(0); // nothing drawn before it resolves
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(deck - 2);
    expect(game.p2.hand()).toHaveLength(0);
  });

  // BUG — expected: a vanilla 2-Might Hero was not Mighty, so its Deathknell draws nothing.
  // Actual: the `while-mighty` condition on the trigger is not evaluated and P1 draws 2 anyway.
  test("dying at 2 Might must NOT draw (condition 'if I was Mighty' — 708); engine draws 2 unconditionally", async () => {
    const game = await heroBoard().build();
    expect(game.state("hero").might).toBe(2);
    await game.p1.cast("zap", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
  });

  // BUG — same root cause, exactly-one-short edge: buffed (+1) and +1 this turn = 4 Might is not Mighty.
  test("dying at 4 Might (one short of Mighty) must NOT draw; engine draws 2", async () => {
    const game = await heroBoard({ buffed: true, mightModifier: 1 }).build();
    expect(game.state("hero").might).toBe(4);
    await game.p1.cast("zap", { targets: "hero" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(0);
  });

  // BUG — "was Mighty" is read at the moment of death (808.1.d.3), not "at any time": the +3 expired
  // at end of turn, so a kill on the NEXT turn finds a 2-Might Hero. Engine still draws 2.
  test("Mighty earlier but back to 2 when killed next turn must NOT draw; engine draws 2", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "hero", { mightModifier: 3 })
      .hand(P2, zap(), "zap")
      .build();
    expect(game.state("hero").might).toBe(5);
    await game.advanceTurn(); // → P2's turn; "this turn" pump gone
    expect(game.state("hero").might).toBe(2);
    const handBefore = game.p1.hand().length;
    await game.p2.cast("zap", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore);
  });

  test("damage never lowers Might: a 5-Might Hero already carrying 3 damage that takes lethal is still Mighty → draws 2", async () => {
    const game = await heroBoard({ damage: 3, mightModifier: 3 }).build();
    expect(game.state("hero")).toMatchObject({ damage: 3, might: 5 });
    await game.p1.cast("zap", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("Equipment counts (710): Doran's Blade (+2) on a buffed Hero (3) = 5 → killed → draws 2", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "hero", { buffed: true, equippedWith: ["blade"] })
      .gear(P1, DORANS_BLADE, "blade", { attachedTo: "hero" })
      .hand(P1, zap(), "zap")
      .build();
    expect(game.state("hero").might).toBe(5);
    await game.p1.cast("zap", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("killed on the OPPONENT's turn by their spell: the Deathknell is still P1's trigger and P1 (not P2) draws 2", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", CARD, "hero", { mightModifier: 3 })
      .hand(P2, zap(), "zap")
      .build();
    await game.p2.cast("zap", { targets: "hero" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hero", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("dies ATTACKING with Cleave's [Assault 3]: 2+3 = 5 while an attacker (807.1.d.1) trades with a 5-Might defender → it was Mighty when it died → draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "hero")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "hero" });
    await game.settle();
    expect(game.state("hero").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("hero").might).toBe(2); // Assault is dormant outside combat
    await game.p1.move("hero", "bf1");
    await game.settle(); // showdown passes → combat: 5 into Wall kills it (proves Might 5), 5 back kills Hero → Deathknell
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // nobody left to conquer
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("real partner — Back to Back: buffed Hero (3) + 2 = 5 (Mighty, 710); P1's Zap in RESPONSE resolves first (LIFO) would be too early, so cast it after B2B lands → Hero dies Mighty → draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "hero", { buffed: true })
      .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
      .hand(P1, BACK_TO_BACK, "b2b")
      .hand(P1, zap(), "zap")
      .build();
    expect(game.state("hero").might).toBe(3);
    await game.p1.cast("b2b", { targets: ["hero", "pal"] });
    await game.settle();
    expect(game.state("hero")).toMatchObject({ isBuffed: true, might: 5 });
    await game.p1.cast("zap", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("pal").might).toBe(3); // the other B2B target keeps its +2
  });

  // BUG — LIFO timing trap: P2's Reaction kill stacked ON TOP of Back to Back resolves first, so the
  // Hero dies at 3 Might (B2B has not landed yet) and must draw nothing. Engine draws 2 (condition
  // ignored).
  test("killed in response BEFORE the pump resolves (dies at 3) must NOT draw; engine draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "hero", { buffed: true })
      .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
      .hand(P1, BACK_TO_BACK, "b2b")
      .hand(P2, zap("reaction"), "qzap")
      .build();
    await game.p1.cast("b2b", { targets: ["hero", "pal"] });
    await game.p1.passPriority();
    await game.p2.cast("qzap", { targets: "hero" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["b2b", "qzap"]);
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.state("pal").might).toBe(3); // B2B still resolved on the surviving target (359.3.e.8)
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("negative space: 'When I die' — killing ANOTHER friendly (even Mighty) unit puts nothing on the chain and draws nothing; Hero stays", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "hero", { mightModifier: 3 })
      .unit(P1, "base", { might: 5, name: "Other" }, "other")
      .hand(P1, zap(), "zap")
      .build();
    await game.p1.cast("zap", { targets: "other" });
    await game.settle();
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.zoneOf("hero")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("parsed abilities: a Deathknell (die/self trigger) whose draw-2 effect is gated on a Mighty condition; unit 2/2, Order, no power", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Unsung Hero" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.find((a) => a.keyword === "Deathknell")).toBeDefined();
    const triggered = abilities.filter((a) => a.type === "triggered");
    expect(triggered).toHaveLength(1); // exactly one trigger — it must not fire twice
    expect(triggered[0]).toMatchObject({
      condition: { type: "while-mighty" },
      effect: { amount: 2, type: "draw" },
      trigger: { event: "die", on: "self" },
    });
  });
});
