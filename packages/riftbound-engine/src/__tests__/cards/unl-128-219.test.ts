/**
 * Star-Crossed — unl-128-219 · Spell · Chaos · 3 energy + [chaos] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Return a friendly unit and an enemy unit to their owners' hands.
 *
 * Rules: 355.8 (BOTH targets must have a valid choice to put the spell on the chain — no friendly or
 * no enemy unit = not playable), 355.9.a.1 ("unit" = any unit on the board: base OR battlefield),
 * 359.3.e.5/.8 (each instruction resolves independently: if one target became illegal the other is
 * still returned), 359.3.e.4 (a target that left the board and came back is a NEW object), 108/740
 * ("friendly"/"enemy" are about CONTROL, "owner's hand" is about OWNERSHIP), 809 (choosing an enemy
 * Deflect unit costs 1 extra power of any domain), 316.5.b (Reaction still needs a window: not in the
 * opponent's Neutral Open State), 336 (LIFO: a Reaction resolves before what it answered).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Two mandatory targets: friendly-only or enemy-only boards make it uncastable; the roles are
 *     ordered (friendly first) and cannot be swapped.
 *  2. Location-agnostic: units in either base are as legal as units at battlefields (unlike Rebuke).
 *  3. Owner ≠ controller: a unit P1 stole from P2 is P1's FRIENDLY pick yet returns to P2's hand.
 *  4. As a combat Reaction: pulling one defender AND the big attacker mid-showdown changes the fight
 *     that then resolves with whoever is left.
 *  5. Answering removal: in response to Void Seeker on P1's unit, Star-Crossed resolves first, the unit
 *     is safe in hand, Void Seeker's damage fizzles but its unlinked "Draw 1" still happens.
 *  6. Mirror match / partial fizzle: P2 answers P1's Star-Crossed with their own, bouncing P1's ENEMY
 *     pick first — P1's copy still returns its friendly pick and does nothing else (no double bounce).
 *  7. Deflect on the enemy pick is a tax (needs a 2nd power) — on the friendly pick it is free.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-128-219";
const VOID_SEEKER = "ogn-024-298"; // Fury Action, 3+[fury]: Deal 4 to a unit at a battlefield. Draw 1.
const POUTY_PORO = "ogn-013-298"; // Fury unit, 2 Might, [Deflect]

const targetPairs = (g: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }, card = "sc") =>
  (g.p1.option("cast", card)?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally Home" }, "allyHome")
    .unit(P1, "bf1", { might: 2, name: "Ally Field" }, "allyField")
    .unit(P2, "bf1", { might: 4, name: "Foe Field" }, "foeField")
    .unit(P2, "base", { might: 3, name: "Foe Home" }, "foeHome")
    .hand(P1, CARD, "sc");
}

describe("Star-Crossed (unl-128-219)", () => {
  test("registry payload: 3+[chaos] Chaos Reaction spell whose single spell ability is a sequence of two return-to-hand steps — friendly unit first, enemy unit second", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 3, name: "Star-Crossed", timing: "reaction" });
    expect(def?.powerCost).toEqual(["chaos"]);
    expect(def?.abilities).toEqual([
      {
        effect: {
          effects: [
            { target: { controller: "friendly", type: "unit" }, type: "return-to-hand" },
            { target: { controller: "enemy", type: "unit" }, type: "return-to-hand" },
          ],
          type: "sequence",
        },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("returns the chosen friendly unit AND the chosen enemy unit to hand — from a base and a battlefield alike; pays 3 energy + 1 chaos; the other units stay; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("sc", { targets: ["allyHome", "foeField"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["allyHome"]);
    expect(game.p2.hand()).toEqual(["foeField"]);
    expect(game.zoneOf("allyField")).toBe("battlefield-bf1");
    expect(game.zoneOf("foeHome")).toBe("base");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("targets are ordered roles: the engine offers exactly the four (friendly, enemy) pairs over ALL board units (bases included); two friendlies or two enemies is never a legal pair", async () => {
    const game = await board().build();
    const pairs = targetPairs(game);
    expect(pairs).toHaveLength(4);
    expect(pairs).toEqual(expect.arrayContaining([["allyHome", "foeHome"], ["allyHome", "foeField"], ["allyField", "foeHome"], ["allyField", "foeField"]]));
    expect(pairs.every(([f, e]) => String(f).startsWith("ally") && String(e).startsWith("foe"))).toBe(true);
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["allyHome", "allyField"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["foeHome", "foeField"] }))).ok).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
  });

  test("355.8 — BOTH targets are mandatory: with only friendly units, or only enemy units, on the board the spell is not playable at all", async () => {
    const onlyMine = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "sc").build();
    expect(onlyMine.p1.can("cast", "sc")).toBe(false);
    const onlyTheirs = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).unit(P2, "base", { might: 2 }, "e").hand(P1, CARD, "sc").build();
    expect(onlyTheirs.p1.can("cast", "sc")).toBe(false);
  });

  test("cost edge cases: 2 energy + chaos, or 3 energy + a non-chaos power, cannot cast it", async () => {
    expect((await board().resources(P1, { energy: 2, power: { chaos: 1 } }).build()).p1.can("cast", "sc")).toBe(false);
    expect((await board().resources(P1, { energy: 3, power: { chaos: 0, fury: 1 } }).build()).p1.can("cast", "sc")).toBe(false);
  });

  test("'their OWNERS' hands' — a P2-owned unit that P1 controls is P1's FRIENDLY pick and goes back to P2's hand; the enemy pick goes to P2's hand too", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 3, name: "Borrowed" }, owner: P2, zone: "bf1" })
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CARD, "sc")
      .build();
    expect(targetPairs(game)).toEqual([["stolen", "foe"]]);
    await game.p1.cast("sc", { targets: ["stolen", "foe"] });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p2.hand().sort()).toEqual(["foe", "stolen"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("[Reaction] timing: no window in the opponent's Neutral Open State; once P2's Void Seeker (on P1's unit) is on the chain P1 answers, Star-Crossed resolves FIRST, the unit is safe in hand, the 4 damage fizzles and P2 still draws 1", async () => {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .hand(P2, VOID_SEEKER, "vs")
      .build();
    expect(game.p1.can("cast", "sc")).toBe(false);
    await game.p2.cast("vs", { targets: "allyField" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "sc")).toBe(true);
    await game.p1.cast("sc", { targets: ["allyField", "foeField"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vs", "sc"]);
    const p2HandBefore = game.p2.hand().length; // 0
    await game.settle();
    expect(game.zoneOf("allyField")).toBe("hand");
    expect(game.state("allyField").damage).toBe(0);
    expect(game.zoneOf("foeField")).toBe("hand");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2HandBefore + 2); // foeField bounced + Void Seeker's unlinked draw
    expect(game.p1.trash()).toEqual(["sc"]);
  });

  test("as a COMBAT reaction on the opponent's turn: P2 attacks Guard(2)+Buddy(2) with Raider(5)+Pal(1); P1 bounces Guard and Raider mid-showdown; Buddy then beats Pal and bf1 is held", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 1, name: "Pal" }, "pal")
      .hand(P1, CARD, "sc")
      .build();
    await game.p2.move(["raider", "pal"], "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    await game.p2.passFocus();
    await game.p1.cast("sc", { targets: ["guard", "raider"] });
    await game.settle();
    expect(game.p1.hand()).toEqual(["guard"]);
    expect(game.p2.hand()).toEqual(["raider"]);
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.state("buddy")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("mirror match (359.3.e.5/.8): P2 answers with their own Star-Crossed, bouncing P1's ENEMY pick (and another P1 unit) first — P1's copy still returns its friendly pick and nothing is bounced twice", async () => {
    const game = await board()
      .resources(P2, { energy: 3, power: { chaos: 1 } })
      .hand(P2, CARD, "sc2")
      .build();
    await game.p1.cast("sc", { targets: ["allyHome", "foeField"] });
    await game.p1.passPriority();
    await game.p2.cast("sc2", { targets: ["foeField", "allyField"] }); // P2's friendly = foeField, P2's enemy = allyField
    expect(game.chain().map((i) => i.cardId)).toEqual(["sc", "sc2"]);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["allyField", "allyHome"]);
    expect(game.p2.hand()).toEqual(["foeField"]);
    expect(game.zoneOf("foeHome")).toBe("base"); // never chosen by anyone
    expect(game.p1.trash()).toEqual(["sc"]);
    expect(game.p2.trash()).toEqual(["sc2"]);
    expect(game.violations()).toEqual([]);
  });

  test("[Deflect] on the ENEMY pick is a tax of one extra power (any domain): with exactly [chaos] the Poro is not offered; with a spare fury it is, and both powers are spent", async () => {
    const poor = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "ally").unit(P2, "base", POUTY_PORO, "poro").unit(P2, "base", { might: 1, name: "Plain" }, "plain").hand(P1, CARD, "sc").build();
    expect(targetPairs(poor)).toEqual([["ally", "plain"]]);
    const rich = await scenario().resources(P1, { energy: 3, power: { chaos: 1, fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").unit(P2, "base", POUTY_PORO, "poro").hand(P1, CARD, "sc").build();
    expect(targetPairs(rich)).toEqual([["ally", "poro"]]);
    await rich.p1.cast("sc", { targets: ["ally", "poro"] });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    await rich.settle();
    expect(rich.p2.hand()).toEqual(["poro"]);
    expect(rich.p1.hand()).toEqual(["ally"]);
  });

  test("[Deflect] on the FRIENDLY pick costs nothing extra (809: only opponents pay): P1's own Poro + a plain foe for exactly 3 + [chaos]", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).unit(P1, "base", POUTY_PORO, "poro").unit(P2, "base", { might: 1, name: "Plain" }, "plain").hand(P1, CARD, "sc").build();
    expect(targetPairs(game)).toEqual([["poro", "plain"]]);
    await game.p1.cast("sc", { targets: ["poro", "plain"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.p1.hand()).toEqual(["poro"]);
  });

  test("a bounced unit is a fresh card: exhausted + damaged ally returns to hand and can be replayed (for its cost) entering exhausted with no damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .unit(P1, "base", { energyCost: 2, might: 3, name: "Bruised" }, "bruised", { damage: 2, exhausted: true })
      .unit(P2, "base", { might: 1, name: "Plain" }, "plain")
      .hand(P1, CARD, "sc")
      .build();
    await game.p1.cast("sc", { targets: ["bruised", "plain"] });
    await game.settle();
    expect(game.zoneOf("bruised")).toBe("hand");
    await game.p1.play("bruised");
    await game.settle();
    expect(game.state("bruised")).toMatchObject({ damage: 0, isExhausted: true, might: 3, zone: "base" });
    expect(game.p1.energy()).toBe(0);
  });
});
