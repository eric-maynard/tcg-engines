/**
 * Consuming Curse — ven-010-166 · Spell · Fury · 2 energy (no power) · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 2 to a unit at a battlefield. This deals 1 Bonus Damage for each card with this name
 *   in your trash.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. The copy being resolved is ON THE CHAIN, not in the trash (a spell is trashed only after it
 *      resolves) — the first Curse of the game deals exactly 2, the second 3, the third 4.
 *   2. "in YOUR trash": copies in the opponent's trash, and differently-named cards in yours, add
 *      nothing. The count is independent of how many units are on the board.
 *   3. Bonus Damage (712-715) is added to the single Deal → one 3-damage packet, so a 3-Might unit
 *      dies to the second Curse (exactly lethal) but survives the first with 2 marked (one short).
 *   4. "a unit at a battlefield": units in either base are never legal; friendly battlefield units
 *      are (no "enemy" restriction). No unit at any battlefield → the spell cannot be played (355.8).
 *   5. [Action] timing (155): own turn in the open state, or while holding Focus in a showdown — even
 *      on the opponent's turn as the defender; never in the opponent's neutral open state and never
 *      as a response on a closed chain (it is not a Reaction).
 *   6. Registry: amount must be a flat 2 plus a same-name-in-trash bonus — NOT "2 × number of units".
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-010-166";
const OTHER_SPELL = "ogn-004-298"; // Cleave — a differently-named Fury spell for trash padding

/** P1's turn, 2 energy, enemy units of 3 and 6 Might at bf1 plus one in P2's base, a friendly 2 at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: 6, name: "Six" }, "six")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "curse");
}

describe("Consuming Curse (ven-010-166)", () => {
  // Expected: a damage effect on "a unit at a battlefield" whose amount is 2 + (Consuming Curses in
  // your trash). Actual: amount parsed as { count: all units, multiplier: 2 } — "2 per unit on the board".
  test("registry payload — Action spell, 2 energy, damage to a battlefield unit with a flat base of 2 (not a unit count ×2)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "fury", energyCost: 2, name: "Consuming Curse", timing: "action" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; timing: string; effect: { type: string; target: unknown; amount: unknown } };
    expect(ability).toMatchObject({ effect: { target: { location: "battlefield", type: "unit" }, type: "damage" }, timing: "action", type: "spell" });
    expect(ability.effect.amount).not.toMatchObject({ count: { type: "unit" } });
    expect(JSON.stringify(ability.effect)).toMatch(/trash/i); // the bonus is keyed on your trash
  });

  test("costs exactly 2 energy; goes on the chain as P1's non-triggered item; nothing is dealt before it resolves; → trash after", async () => {
    const game = await board().build();
    await game.p1.cast("curse", { targets: "six" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "curse", controller: P1, triggered: false })]);
    expect(game.state("six").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("curse")).toBe("trash");
    const poor = await board().resources(P1, { energy: 1, power: { fury: 3 } }).build();
    expect(poor.p1.can("cast", "curse")).toBe(false);
  });

  // Expected: empty trash → exactly 2 to Six (4 units on the board must not matter). Actual: 8 (2 × 4 units)
  // — the 6-Might Six is killed outright (verified with a 20-Might target: 8 marked).
  test("with no Consuming Curse in your trash it deals exactly 2, regardless of how many units are on the board", async () => {
    const game = await board().build();
    await game.p1.cast("curse", { targets: "six" });
    await game.settle();
    expect(game.state("six").damage).toBe(2);
    expect(game.zoneOf("six")).toBe("battlefield-bf1");
    expect(game.state("three").damage).toBe(0); // single target
    expect(game.state("mine").damage).toBe(0);
  });

  // Expected: one same-name card in trash → 2 + 1 Bonus = 3. Actual: unit-count based amount.
  test("one Consuming Curse already in your trash → 3 damage (1 Bonus Damage, 715.1)", async () => {
    const game = await board().trash(P1, CARD, "old1").build();
    await game.p1.cast("curse", { targets: "six" });
    await game.settle();
    expect(game.state("six").damage).toBe(3);
  });

  // Expected: two in trash → 4; the differently-named Cleave and the copy in P2's trash add nothing.
  test("two copies in YOUR trash → 4; other names in your trash and copies in the OPPONENT's trash don't count", async () => {
    const game = await board().trash(P1, CARD, "old1").trash(P1, CARD, "old2").trash(P1, OTHER_SPELL, "cleave").trash(P2, CARD, "theirs").build();
    await game.p1.cast("curse", { targets: "six" });
    await game.settle();
    expect(game.state("six").damage).toBe(4);
    expect(game.zoneOf("six")).toBe("battlefield-bf1"); // 4 < 6
  });

  // Expected: only the opponent has Curses in the trash → still a flat 2. Actual: unit-count amount.
  test("copies only in the opponent's trash → still exactly 2", async () => {
    const game = await board().trash(P2, CARD, "theirs1").trash(P2, CARD, "theirs2").build();
    await game.p1.cast("curse", { targets: "six" });
    await game.settle();
    expect(game.state("six").damage).toBe(2);
  });

  // Expected: first Curse leaves Three on 2 damage (one short); it then sits in the trash, so the second
  // Curse deals 3 — exactly lethal (143.2.a). Actual: the first cast already over-kills.
  test("chained casts — the first Curse (2) leaves a 3-Might unit alive, the second (now 1 in trash → 3) kills it", async () => {
    const game = await board().resources(P1, { energy: 4 }).hand(P1, CARD, "curse2").build();
    await game.p1.cast("curse", { targets: "three" });
    await game.settle();
    expect(game.zoneOf("curse")).toBe("trash");
    expect(game.state("three").damage).toBe(2);
    expect(game.zoneOf("three")).toBe("battlefield-bf1");
    await game.p1.cast("curse2", { targets: "three" });
    await game.settle();
    expect(game.zoneOf("three")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  test("targets: units AT A BATTLEFIELD only (either side's) — the base unit is not offered and naming it is illegal", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "curse")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["three"], ["six"], ["mine"]]));
    const r = await game.p1.try((p) => p.cast("curse", { targets: "home" }));
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
    expect(game.zoneOf("curse")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("no unit at any battlefield → not playable at all (355.8), even with energy to spare", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).battlefield("bf1", { controller: P2 }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "curse").build();
    expect(game.p1.can("cast", "curse")).toBe(false);
  });

  test("[Action] timing: not in the opponent's neutral open state; not as a response on a chain (it is no Reaction)", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "curse")).toBe(false);
    const game = await board().resources(P1, { energy: 4 }).hand(P1, CARD, "curse2").build();
    await game.p1.cast("curse", { targets: "six" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "curse2")).toBe(false); // closed state
    await game.settle();
    expect(game.p1.can("cast", "curse2")).toBe(true); // open again
  });

  test("[Action] in a showdown on the OPPONENT's turn: as the defender with Focus, curse the attacker mid-combat", async () => {
    // P2 attacks P1's bf1 (held by a 2-Might unit) with a 3-Might attacker. P1 gets Focus after P2 passes,
    // curses the attacker (≥2 damage), then combat: attacker 3 vs defender 2 → defender dies either way,
    // but the attacker has ≥2 marked and takes 2 from the defender → 3-Might attacker dies too → no conquer.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "curse")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("cast", "curse")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "curse")).toBe(true);
    await game.p1.cast("curse", { targets: "raider" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("curse")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.p2.points()).toBe(0);
  });
});
