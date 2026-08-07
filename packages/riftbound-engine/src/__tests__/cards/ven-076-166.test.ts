/**
 * Repair Specialist — ven-076-166 · Unit · Body · 3 energy · 3 Might
 *
 *   I have [Assault] equal to the number of gear you control.
 *   (+1 [Might] while I'm an attacker for each instance of Assault.)
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The Assault VALUE is a live characteristic (807.1.c / 807.3): the count of GEAR YOU CONTROL —
 *     any gear anywhere on your board (tokens included), never the opponent's gear, never units.
 *     0 gear = Assault 0 = a plain 3 even while attacking; 2 gear = a 5-Might attacker.
 *  2. Assault only pays while it holds the Attacker designation (807.1.d): defending with a shed
 *     full of gear it is still a 3.
 *  3. Exactly-lethal vs one short: with 2 gear it trades into a 5-Might defender (both die); with the
 *     count broken it deals 3 and dies alone — the defender's fate is the tell.
 *  4. LIVE: a gear played earlier in the turn (Seal of Strength, 0 cost) is counted by the time it
 *     attacks; the value is not frozen when the Specialist entered.
 *  5. 807.2 — Assault from another source SUMS with its own: Cleave (+Assault 3) on a 0-gear
 *     Specialist attacks for 6; with 1 gear, 7.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-076-166";
const SEAL_OF_STRENGTH = "ogn-163-298"; // Gear · 0 energy + [body]
const CLEAVE = "ogn-004-298"; // Action · 1 · Give a unit [Assault 3] this turn.
const WRENCH = { cardType: "gear", energyCost: 1, name: "Test Wrench" } as const;

/** P1's ready Specialist in base with `gear` inline gear; P2 holds bf1 with one `wall`-Might defender. */
function shop(gear: number, wall = 5) {
  const b = scenario()
    .resources(P1, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "spec")
    .unit(P2, "bf1", { might: wall, name: "Wall" }, "wall");
  for (let i = 1; i <= gear; i++) {
    b.gear(P1, WRENCH, `g${i}`);
  }
  return b;
}

describe("Repair Specialist (ven-076-166)", () => {
  test("the static's Assault value is parsed as a count of `{type: unit}` instead of the gear you control", async () => {
    // Expected: value = count of friendly gear. Actual registry payload: value.count = { type: "unit" }.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 3, might: 3 });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        keyword: "Assault",
        target: "self",
        type: "grant-keyword",
        value: { count: { controller: "friendly", type: "gear" } },
      },
      type: "static",
    });
  });

  test("cost: 3 energy for a 3-Might unit that enters the base exhausted and carries the Assault keyword; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "spec").build();
    await game.p1.play("spec");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("spec")).toBe("base");
    expect(game.state("spec")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.state("spec").keywords).toContain("Assault");
    const poor = await scenario().resources(P1, { energy: 2, power: { body: 3 } }).hand(P1, CARD, "spec").build();
    expect(poor.p1.can("play", "spec")).toBe(false);
  });

  test("no gear: Assault 0 — it attacks as a plain 3, dies into a 5-Might Wall and the Wall survives with bf1 still P2's", async () => {
    const game = await shop(0).build();
    expect(game.state("spec").might).toBe(3);
    await game.p1.move("spec", "bf1");
    expect(game.state("spec").combatRole).toBe("attacker");
    expect(game.state("spec").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("spec")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("two gear you control → a 5-Might attacker (3 + Assault 2) during the combat showdown", async () => {
    // Expected 5 while attacking (807.1.c). Actual: the mis-parsed count is always 0 → stays 3.
    const game = await shop(2).build();
    expect(game.p1.gear()).toEqual(["g1", "g2"]);
    expect(game.state("spec").might).toBe(3); // at rest: no bonus
    await game.p1.move("spec", "bf1");
    expect(game.state("spec").combatRole).toBe("attacker");
    expect(game.state("spec").might).toBe(5);
    expect(game.state("wall").might).toBe(5); // the defender gets nothing
  });

  test("exactly lethal — with two gear it trades into the 5-Might Wall (both die); one short it would die alone", async () => {
    // Expected: 5 damage kills the Wall and 5 back kills the Specialist. Actual: deals 3, Wall lives.
    const game = await shop(2).build();
    await game.p1.move("spec", "bf1");
    await game.settle();
    expect(game.zoneOf("spec")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("DEFENDING with two gear in the shed: Assault does nothing — a 4-Might attacker kills the 3-Might Specialist and conquers (807.1.d)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "spec")
      .gear(P1, WRENCH, "g1")
      .gear(P1, WRENCH, "g2")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("spec").combatRole).toBe("defender");
    expect(game.state("spec").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("spec")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("only gear YOU control: three enemy gear and none of yours → still a 3-Might attacker that loses to the Wall", async () => {
    const game = await shop(0).gear(P2, WRENCH, "e1").gear(P2, WRENCH, "e2").gear(P2, WRENCH, "e3").build();
    expect(game.p2.gear()).toHaveLength(3);
    await game.p1.move("spec", "bf1");
    expect(game.state("spec").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("spec")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
  });

  test("friendly UNITS are not gear: two allies in base add nothing (guards against the unit-count mis-parse doing damage)", async () => {
    const game = await shop(0).unit(P1, "base", { might: 1, name: "Ally A" }, "a").unit(P1, "base", { might: 1, name: "Ally B" }, "b").build();
    await game.p1.move("spec", "bf1");
    expect(game.state("spec").might).toBe(3);
    for (const other of ["a", "b", "wall"]) {
      expect(game.state(other).keywords).not.toContain("Assault"); // the static never leaks
    }
  });

  test("LIVE count — a Seal of Strength played this turn (0 + [body]) is counted when it attacks afterwards: 3 + 1 = 4", async () => {
    // Expected: gear played mid-turn raises the value before the attack. Actual: value stuck at 0.
    const game = await shop(0, 4).hand(P1, SEAL_OF_STRENGTH, "seal").build();
    await game.p1.play("seal");
    await game.settle();
    expect(game.p1.gear()).toEqual(["seal"]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0 } });
    await game.p1.move("spec", "bf1");
    expect(game.state("spec").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 4 into a 4-Might Wall
  });

  test("807.2 summing, 0 gear: Cleave's Assault 3 on top of its own Assault 0 → attacks for 6, kills the 5-Might Wall and survives to conquer", async () => {
    const game = await shop(0).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "spec" });
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.state("spec").might).toBe(3); // not attacking yet
    await game.p1.move("spec", "bf1");
    expect(game.state("spec").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("spec")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("807.2 summing with 1 gear: own Assault 1 + Cleave's 3 → a 7-Might attacker", async () => {
    // Expected 3 + 1 + 3 = 7. Actual 6 (own value stuck at 0).
    const game = await shop(1, 7).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "spec" });
    await game.settle();
    await game.p1.move("spec", "bf1");
    expect(game.state("spec").might).toBe(7);
  });

  test("'while I'm an attacker' ends with the combat: after conquering with Cleave it is back to 3 at the battlefield, and 3 next turn", async () => {
    const game = await shop(0).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "spec" });
    await game.settle();
    await game.p1.move("spec", "bf1");
    await game.settle();
    expect(game.state("spec").combatRole).not.toBe("attacker");
    expect(game.state("spec").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("spec").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
