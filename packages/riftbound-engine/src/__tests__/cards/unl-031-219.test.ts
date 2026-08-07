/**
 * Combat Experience — unl-031-219 · Spell · Calm · 1 energy · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a unit +1 [Might] this turn.
 *   [Level 6][>] Give it +3 [Might] this turn instead. (While you have 6+ XP, get the effect.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. "instead" (824.1.b.1 + replacement wording): at 6+ XP the bonus is +3, NOT +1 and +3 = +4.
 *      Exactly 6 XP qualifies; 5 XP does not.
 *   2. Level is "WHILE you have 6+ XP" — a continuous gate on the card, so what matters is the XP
 *      total when the spell RESOLVES, not when it was put on the chain (XP gained in response counts).
 *   3. Reaction timing (813): castable in the opponent's combat showdown once Focus reaches you, and
 *      onto an open chain where it resolves FIRST (LIFO) — a +1 in response to a 3-damage spell on a
 *      3-Might unit saves it.
 *   4. "a unit" — any unit, friendly or enemy, base or battlefield; no unit anywhere → not castable.
 *   5. "this turn" — the bonus (either size) is gone after the turn ends; damage taken meanwhile is
 *      healed at end of turn too, so a unit that survived only thanks to the bonus is still alive.
 *   6. Cost: exactly 1 energy, no power; spell → trash after resolving.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-031-219";

/** Inline 3-damage Action spell for the opponent. */
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

function board(xp = 0, energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .xp(P1, xp)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "ce");
}

describe("Combat Experience (unl-031-219)", () => {
  test("registry payload: a Reaction spell with a +1 might/turn effect on a unit and a Level-6-gated +3 variant", async () => {
    await board().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 1, timing: "reaction" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.length).toBeGreaterThanOrEqual(1);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      type: "spell",
    });
    const gated = abilities.find((a) => (a.condition as { type?: string } | undefined)?.type === "while-level");
    expect(gated).toMatchObject({ condition: { threshold: 6, type: "while-level" }, effect: { amount: 3, duration: "turn", type: "modify-might" } });
  });

  test("below Level 6: costs 1 energy, gives the chosen unit +1 Might this turn, goes to trash; bonus gone next turn", async () => {
    const game = await board(0).build();
    await game.p1.cast("ce", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ce", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("ally").baseMight).toBe(2);
    expect(game.zoneOf("ce")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("5 XP is not Level 6: still only +1", async () => {
    const game = await board(5).build();
    await game.p1.cast("ce", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(3);
    expect(game.p1.xp()).toBe(5); // Level is a threshold, nothing is spent
  });

  test("exactly 6 XP should give +3 INSTEAD (2 → 5, not 3 and not 6); XP is not spent; bonus gone next turn (824.1)", async () => {
    // Expected: with 6 XP the Level-6 text replaces the +1 with +3 → Ally reads 5 this turn.
    // Actual: the level-gated ability never applies; the unit only gets the base +1 (reads 3).
    const game = await board(6).build();
    await game.p1.cast("ce", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    expect(game.p1.xp()).toBe(6);
    expect(game.zoneOf("ce")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("targets: any unit — the enemy unit at a battlefield is a legal choice and gets the bonus", async () => {
    const game = await board(0).build();
    const targets = game.p1.option("cast", "ce")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    expect(targets).toHaveLength(2);
    await game.p1.cast("ce", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(4);
    expect(game.state("ally").might).toBe(2); // only the chosen unit
  });

  test("not castable with 0 energy, and not castable with no unit on the board", async () => {
    const poor = await board(0, 0).build();
    expect(poor.p1.can("cast", "ce")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "ce").build();
    expect(empty.p1.can("cast", "ce")).toBe(false);
  });

  test("Reaction in the opponent's combat: P2's 3-Might raider attacks P1's 3-Might guard; +1 on the guard → raider dies, guard lives, bf1 held", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "ce")
      .build();
    expect(game.p1.can("cast", "ce")).toBe(false); // P2's open main phase: no window for P1 yet
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("ce", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("guard").might).toBe(4);
  });

  test("Level 6 in combat — 2-Might guard vs 4-Might raider: +3 (→5) should hold and kill; guard back to 2 and undamaged next turn", async () => {
    // Expected: guard 2+3 = 5 → takes 4 (< 5) and survives, deals 5 to the 4-Might raider (dies).
    // Actual: only +1 is granted (guard 3), so the guard dies and the raider conquers.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .xp(P1, 6)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "ce")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("ce", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").might).toBe(5);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("guard")).toMatchObject({ damage: 0, might: 2, zone: "battlefield-bf1" });
  });

  test("control for the combat tests: without the spell the 3-vs-3 fight trades both units", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
  });

  test("Reaction on a chain resolves first (LIFO): +1 in response to a 3-damage spell on a 3-Might unit saves it; end of turn heals it back to a plain 3", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P2, BOLT3, "bolt")
      .hand(P1, CARD, "ce")
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("ce", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt", "ce"]);
    await game.settle();
    expect(game.state("ally")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    await game.advanceTurn();
    expect(game.state("ally")).toMatchObject({ damage: 0, might: 3, zone: "base" });
  });

  test("negative space for the chain test: without the response the bolt kills the 3-Might unit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P2, BOLT3, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("Level is checked on resolution (824.1.b.1 'while') — cast at 5 XP, reach 6 XP before it resolves → should be +3", async () => {
    // Expected: the Level gate is continuous, so 6 XP at resolution yields the +3 text (Ally → 5).
    // Actual: the Level-6 branch is never applied at all (Ally → 3), same root cause as above.
    const game = await board(5).build();
    await game.p1.cast("ce", { targets: "ally" });
    expect(game.zoneOf("ce")).toBe("chain");
    await game.p1.do("gainXp", { amount: 1 });
    expect(game.p1.xp()).toBe(6);
    await game.settle();
    expect(game.state("ally").might).toBe(5);
  });
});
