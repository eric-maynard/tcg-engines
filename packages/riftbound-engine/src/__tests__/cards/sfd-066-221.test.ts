/**
 * Frigid Touch — sfd-066-221 · Spell · Mind · 2 energy · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Give a unit -2 [Might] this turn.
 *
 * Rules: 813 (Reaction = Action permissions + Closed states on ANY player's turn — but not an
 * opponent's Open state), 820 (Repeat: optional additional cost paid as you play; the
 * instruction executes one extra time on resolution; 820.2.a choices for the extra execution
 * may differ), 143.2.a (NONZERO damage ≥ Might kills), 143.2.b (Might below 0 is treated as
 * 0), 143.3.b.2 (damage heals at combat cleanup), 340 (chain resolves last-in-first-out),
 * 317.2.c ("this turn" effects expire with the turn they were created in).
 *
 * Head-judge corner cases considered:
 *   1. Timing: legal as a response on the opponent's chain and inside a showdown; illegal in the
 *      opponent's Open main phase.
 *   2. State-based death: a 3-Might unit carrying 1 damage drops to 1 Might → killed; an
 *      undamaged 2-Might unit at 0 Might survives (damage must be nonzero).
 *   3. Might floor: a 1-Might unit reads 0, never negative (143.2.b).
 *   4. Repeat: 2 + 2 energy, one chain item, -4 total; unaffordable repeat → only the base cast;
 *      820.2.a lets the second execution pick a different unit (engine: not offered → BUG).
 *   5. Cast on the opponent's turn, the penalty expires when THAT turn ends.
 *   6. Real combat: shrinking a 4-Might attacker to 2 in the showdown flips the fight.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-066-221";

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
    .hand(P1, CARD, "ft");
}

describe("Frigid Touch (sfd-066-221)", () => {
  test("parsed abilities: a Reaction spell with Repeat [2] whose effect is -2 Might (turn) to a unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 2, timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: -2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      repeat: { energy: 2 },
      timing: "reaction",
      type: "spell",
    });
  });

  test("costs 2 energy; any unit (friendly or enemy) is a legal target; -2 Might; spell goes to trash", async () => {
    const game = await board(3).build();
    const targets = game.p1.option("cast", "ft")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    await game.p1.cast("ft", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("foe")).toMatchObject({ baseMight: 4, might: 2, mightModifier: -2 });
    expect(game.state("ally").might).toBe(3);
    expect(game.zoneOf("ft")).toBe("trash");
  });

  test("not castable with 1 energy, and not castable with no unit on the board", async () => {
    const poor = await board(1).build();
    expect(poor.p1.can("cast", "ft")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "ft").build();
    expect(empty.p1.can("cast", "ft")).toBe(false);
  });

  test("'this turn': the -2 wears off when the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("ft", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("foe")).toMatchObject({ might: 4, mightModifier: 0 });
  });

  test("143.2.a: a damaged unit whose Might drops to its damage dies; an undamaged unit at 0 Might survives", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P2, "base", { might: 3, name: "Wounded" }, "wounded", { damage: 1 })
      .unit(P2, "base", { might: 2, name: "Fresh" }, "fresh")
      .hand(P1, CARD, "ft")
      .hand(P1, CARD, "ft2")
      .build();
    await game.p1.cast("ft", { targets: "wounded" });
    await game.settle();
    expect(game.zoneOf("wounded")).toBe("trash"); // 1 damage ≥ 1 Might
    await game.p1.cast("ft2", { targets: "fresh" });
    await game.settle();
    expect(game.zoneOf("fresh")).toBe("base"); // 0 damage is not "nonzero damage"
    expect(game.state("fresh").might).toBe(0);
  });

  test("143.2.b: Might never reads below 0 — a 1-Might unit given -2 is treated as 0", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 1, name: "Tiny" }, "tiny").hand(P1, CARD, "ft").build();
    await game.p1.cast("ft", { targets: "tiny" });
    await game.settle();
    expect(game.zoneOf("tiny")).toBe("base");
    expect(game.state("tiny").might).toBe(0);
    expect(game.state("tiny").might).not.toBeLessThan(0);
  });

  test("[Repeat] [2]: paying 4 total executes twice on the same unit (-4), still a single chain item", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).unit(P2, "base", { might: 5, name: "Brute" }, "brute").hand(P1, CARD, "ft").build();
    await game.p1.cast("ft", { repeat: 1, targets: "brute" });
    expect(game.p1.energy()).toBe(1); // 2 + 2
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("brute")).toMatchObject({ might: 1, mightModifier: -4 });
    await game.advanceTurn();
    expect(game.state("brute").might).toBe(5);
  });

  test("[Repeat] is optional and must be affordable: with 3 energy only the un-repeated cast is legal", async () => {
    const game = await board(3).build();
    const repeatField = game.p1.option("cast", "ft")?.fields.find((f) => f.arg === "repeat");
    expect(repeatField?.options ?? []).not.toContain(1);
    const r = await game.p1.try((p) => p.cast("ft", { repeat: 1, targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ft")).toBe("hand");
    await game.p1.cast("ft", { targets: "foe" });
    expect(game.p1.energy()).toBe(1);
  });

  test("[Repeat] 820.2.a — the extra execution may choose a DIFFERENT unit (-2 to each of two units)", async () => {
    // Expected: with the Repeat cost paid the caster makes choices for each execution separately, so
    // "foe" and "ally" can each take -2. Actual: only single-target variants are enumerated; the
    // repeated execution is forced onto the same unit.
    const game = await board(4).build();
    await game.p1.cast("ft", { repeat: 1, targets: ["foe", "ally"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("foe").might).toBe(2);
    expect(game.state("ally").might).toBe(1);
  });

  test("[Reaction] on the opponent's turn: illegal in their Open state, legal once their spell is on the chain; resolves first (LIFO)", async () => {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 2 })
      .hand(P2, CARD, "theirs")
      .build();
    expect(game.p1.can("cast", "ft")).toBe(false); // P2's open main phase
    await game.p2.cast("theirs", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "ft")).toBe(true);
    await game.p1.cast("ft", { targets: "foe" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["theirs", "ft"]);
    // Both pass → the top item (ours) resolves first: Foe already shrunk while theirs is still pending.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("foe").might).toBe(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["theirs"]);
    await game.settle();
    expect(game.state("ally").might).toBe(1);
    // Cast during P2's turn → the penalty ends with P2's turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("foe").might).toBe(4);
    expect(game.state("ally").might).toBe(3);
  });

  test("in a showdown as the defender: shrinking the 4-Might attacker to 2 makes it lose to a 3-Might defender", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "ft")
      .build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "ft")).toBe(true);
    await game.p1.cast("ft", { targets: "raider" });
    await game.settle(); // spell resolves, both pass focus, combat: 2 vs 3
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1");
    expect(game.state("sentinel").damage).toBe(0); // took 2 (< 3), healed at combat cleanup (143.3.b.2)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("negative space: without the spell the same 4-vs-3 attack kills the defender and conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
