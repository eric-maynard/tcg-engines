/**
 * Mutated Mouser — unl-036-219 · Unit · Calm · 2 energy · 1 Might
 *
 *   [Shield 2] (+2 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *
 * Rules: 814.1.c (Shield X = "+X Might while I am a defender"), 814.2 (Shield from several sources
 * SUMS), 815.1.b (Tank: lethal damage must be assigned to me before any same-controller non-Tank
 * unit — on EITHER side of the combat), 143.4 (units enter exhausted), 143.3.b.2 (damage heals in
 * the combat cleanup).
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. The printed Might is 1. Outside combat (state, "Mighty" checks, spells) it is a 1-Might unit;
 *     the +2 exists ONLY while it holds the Defender designation. As an ATTACKER it is a 1.
 *  2. Exactly-lethal vs one-short as a defender: 2 damage does not kill it (3 effective), 3 does —
 *     and it hits back for 3, so a 3-Might attacker trades with it.
 *  3. Tank + Shield together: an attacker must sink 3 (not 1) into the Mouser before ANY damage may
 *     reach a squishier friend — a 3-Might attacker kills only the Mouser, a 2-Might one kills nobody.
 *  4. Tank also binds while ATTACKING (same-controller rule, not "while defending"): a Mouser sent in
 *     alongside a bigger ally soaks the first lethal point (1, no Shield) and dies first.
 *  5. Partner — Block (ogn-057-298, "[Shield 3] and [Tank] this turn"): 814.2 sums to Shield 5 → a
 *     6-Might wall as a defender.
 *  6. Defender status is about the COMBAT role, not whose turn it is: P1's Mouser parked on P1's
 *     battlefield and attacked on P2's turn is the defender and gets the +2.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-036-219";
const BLOCK = "ogn-057-298"; // [Action] Give a unit [Shield 3] and [Tank] this turn.

describe("Mutated Mouser (unl-036-219)", () => {
  test("registry payload: 2-cost calm 1-Might unit whose abilities are exactly [Shield 2, Tank]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 2, might: 1, name: "Mutated Mouser" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Shield", type: "keyword", value: 2 },
      { keyword: "Tank", type: "keyword" },
    ]);
  });

  test("cost: 2 energy, no power; enters the base EXHAUSTED as a 1-Might unit with Shield + Tank; 1 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "mouser").build();
    await game.p1.play("mouser");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("base");
    expect(game.state("mouser")).toMatchObject({ baseMight: 1, isExhausted: true, might: 1 });
    expect(game.state("mouser").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    const poor = await scenario().resources(P1, { energy: 1, power: { calm: 3 } }).hand(P1, CARD, "mouser").build();
    expect(poor.p1.can("play", "mouser")).toBe(false);
  });

  test("[Shield 2] as defender — one short: a 2-Might attacker deals 2 < 3, dies to the 3 coming back; Mouser heals to 0 and P2 keeps the field", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", CARD, "mouser")
      .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    await game.p1.move("poker", "bf1");
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("mouser")).toBe("battlefield-bf1");
    expect(game.state("mouser").damage).toBe(0);
    expect(game.state("mouser").might).toBe(1); // defender designation gone → back to printed 1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("[Shield 2] as defender — exactly lethal: a 3-Might attacker trades (3 ≥ 1+2 kills the Mouser, the Mouser's 3 kills it); nobody conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", CARD, "mouser")
      .unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("Shield does NOT apply while attacking: Mouser (1) into a 1-Might defender → both die; into a 2-Might defender → only the Mouser dies", async () => {
    const trade = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "mouser")
      .unit(P2, "bf1", { might: 1, name: "Twig" }, "twig")
      .build();
    await trade.p1.move("mouser", "bf1");
    await trade.settle();
    expect(trade.zoneOf("twig")).toBe("trash");
    expect(trade.zoneOf("mouser")).toBe("trash");

    const bounce = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "mouser")
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .build();
    await bounce.p1.move("mouser", "bf1");
    await bounce.settle();
    expect(bounce.zoneOf("mouser")).toBe("trash");
    expect(bounce.zoneOf("guard")).toBe("battlefield-bf1");
    expect(bounce.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Tank]+[Shield 2] defending beside a 1-Might friend: a 3-Might attacker must put all 3 into the Mouser (lethal = 3) — Mouser dies, the friend is untouched, attacker dies to 3+1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Kitten" }, "kitten")
      .unit(P2, "bf1", CARD, "mouser")
      .unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("trash");
    expect(game.zoneOf("kitten")).toBe("battlefield-bf1");
    expect(game.state("kitten").damage).toBe(0);
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Tank] one short: a 2-Might attacker cannot get lethal on the 3-Might Tank, so NOTHING may spill onto the 1-Might friend — both defenders live", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Kitten" }, "kitten")
      .unit(P2, "bf1", CARD, "mouser")
      .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    await game.p1.move("poker", "bf1");
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("battlefield-bf1");
    expect(game.zoneOf("kitten")).toBe("battlefield-bf1");
    expect(game.zoneOf("poker")).toBe("trash"); // 3 + 1 back
    expect(game.p2.units("bf1").sort()).toEqual(["kitten", "mouser"]);
  });

  test("[Tank] binds while ATTACKING too (815.1.b is per controller): Mouser + a 3-Might ally into a 3-Might defender → Mouser (1, no Shield) soaks first and dies, ally survives on 2, defender dies, P1 conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "mouser")
      .unit(P1, "base", { might: 3, name: "Partner" }, "partner")
      .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
      .build();
    await game.p1.move(["partner", "mouser"], "bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash"); // took 3 + 1
    expect(game.zoneOf("mouser")).toBe("trash"); // first lethal point (1) had to go here
    expect(game.zoneOf("partner")).toBe("battlefield-bf1"); // 2 < 3, healed
    expect(game.state("partner").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("defender on the OPPONENT's turn: P2 attacks P1's Mouser with 4 → Mouser (3) dies, attacker survives on 3 damage and conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "mouser")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("partner — Block in the showdown: Shield 2 + Shield 3 sum to 5 (814.2) → a 6-Might defender; a 5-Might attacker bounces off and dies", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "mouser")
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .hand(P1, BLOCK, "block")
      .build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("block", { targets: "mouser" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("block")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash"); // took 1 + 2 + 3 = 6 ≥ 5
    expect(game.zoneOf("mouser")).toBe("battlefield-bf1"); // took 5 < 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // "this turn": after the turn passes the grant is gone and the printed keywords remain.
    await game.advanceTurn();
    expect(game.state("mouser").grantedKeywords).toEqual([]);
    expect(game.state("mouser").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
  });

  test("negative space: without Block the same 5-Might attacker kills the lone Mouser (5 ≥ 3) and survives (3 < 5)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "mouser")
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
  });
});
