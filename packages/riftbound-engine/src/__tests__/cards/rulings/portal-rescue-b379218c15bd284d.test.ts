/**
 * Ruling b379218c15bd284d — Portal Rescue (OGN-102 → ogn-102-298) · Action [3][mind]
 *   "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *
 * Q: Where are "Board Zones" defined in the rules, and does the banish zone count as one?
 * A (riftjudge): board zones are defined in rule 106 and the Banishment IS a board zone — "with implications
 *    for cards like Portal Rescue".
 * Engine/CR: rule 106 does group the Play Area into The Board (107: Bases, Battlefield Zone, Facedown Zones,
 *    Legend Zone) and Non-Board Zones (108) — and 108.6 / 056.1 place Banishment squarely among the NON-Board
 *    zones. Every observable consequence follows from that: a token banished ceases to exist (186.1) and a
 *    unit that round-trips through Banishment comes back as a new object with its damage cleared (124.1).
 * Rules: 106, 107, 108.6, 056.1, 124.1, 186.1, 427.1.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";

const SOLDIER = { cardType: "unit", energyCost: 4, might: 4, name: "Soldier" } as const;
const RECRUIT_TOKEN = { cardType: "unit", energyCost: 0, isToken: true, might: 1, name: "Recruit" } as const;

/** P1's turn with exactly [3][mind] — enough for Portal Rescue and nothing else. */
function board() {
  return scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, PORTAL_RESCUE, "pr");
}

describe("Ruling b379218c15bd284d — what the Banishment is, as Portal Rescue exercises it", () => {
  test("the harness/engine models Banishment as its own zone, distinct from the board and from the trash", async () => {
    const game = await board().banishment(P1, SOLDIER, "stored").unit(P1, "base", SOLDIER, "onboard").build();
    expect(game.zoneOf("stored")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["stored"]);
    expect(game.p1.base()).toContain("onboard");
    expect(game.p1.trash()).not.toContain("stored");
  });

  test("Portal Rescue really does route the unit through Banishment and back — it returns to base, cost ignored", async () => {
    const game = await board().unit(P1, "base", SOLDIER, "sol").build();
    await game.p1.cast("pr", { targets: "sol" });
    await game.settle();
    expect(game.zoneOf("sol")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // only Portal Rescue's own [3][mind]
  });

  // RULING-CONFLICT: riftjudge b379218c15bd284d says the Banishment is a Board Zone; CR 106/107/108.6 and
  // 056.1 ("Non-Board zones … include … Banishment") say it is a NON-Board zone — engine follows CR.
  // Observable consequence (186.1): a token put into any Non-Board zone but the chain ceases to exist, so
  // Portal Rescue destroys a token instead of rescuing it.
  test("a token rescued by Portal Rescue ceases to exist — Banishment behaves as a NON-Board zone", async () => {
    const game = await board().unit(P1, "base", RECRUIT_TOKEN, "tok").build();
    expect(game.state("tok").isToken).toBe(true);
    await game.p1.cast("pr", { targets: "tok" });
    await game.settle();
    expect(game.zoneOf("tok")).toBe("gone");
    expect(game.has("tok")).toBe(false);
    expect(game.p1.base()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
  });

  // Same conflict, second consequence (124.1): a Non-Board round trip makes it a new object, so temporary
  // modifications — damage among them — are not tracked any more.
  test("a damaged unit comes back from the rescue with its damage cleared (a new object after the round trip)", async () => {
    const game = await board()
      .unit(P1, "base", SOLDIER, "sol", { damage: 3 })
      .build();
    expect(game.state("sol").damage).toBe(3);
    await game.p1.cast("pr", { targets: "sol" });
    await game.settle();
    expect(game.zoneOf("sol")).toBe("base");
    expect(game.state("sol").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
