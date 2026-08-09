/**
 * Kinkou Temple — ven-159-166 · Battlefield
 *
 *   Units here with [Tank] have +1 [Might].
 *
 * Rules: 364 / 522 (a battlefield passive is continuous — no chain item, no controller condition: it
 * works whoever controls the Temple, even uncontrolled, for BOTH players' units), "here" = at this
 * battlefield only (units in a base or at another battlefield read printed Might), 815 (Tank — the filter
 * is the KEYWORD, printed or granted: 722.1 keywords are characteristics), 464 (an attacker is "here" from
 * the moment it arrives, so the +1 is live in the showdown and the combat), 476 (layers: the +1 is plain
 * arithmetic that stacks with Shield's defender bonus and with a "this turn" grant), 124 / "this turn"
 * (a Tank granted for the turn takes the +1 with it when it expires).
 *
 * Head-judge corner cases covered here:
 *   1. Filter precision: Tank unit here +1 (either player), NON-Tank unit here +0, Tank unit elsewhere +0.
 *   2. Dynamic keyword: Block grants [Tank] this turn → the plain unit here jumps to +1 immediately and
 *      drops back at the next turn; the same Block on a unit in BASE grants Tank but no Might.
 *   3. Movement both ways: a Tank attacker reads +1 on arrival (showdown open); a Tank unit walking home
 *      loses it at once.
 *   4. Stacking on defence: Sunlit Guardian (3, Shield 1, Tank) defending here is 3+1+1 = 5 — a 4-Might
 *      raider dies and the Guardian lives; at an inert battlefield the same fight is 4 v 4 (trade).
 *   5. Exactly-lethal shifts by one: "deal 3" kills a printed-3 Tank at a plain field, not here.
 *   6. Uncontrolled Temple still applies (no "if you control" rider).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "ven-159-166";
const SUNLIT_GUARDIAN = "ogn-054-298"; // 3 might · [Shield] (+1 while defending) · [Tank]
const BLOCK = "ogn-057-298"; // 2 calm · [Action] · Give a unit [Shield 3] and [Tank] this turn
const HEXTECH_RAY = "ogn-009-298"; // 1 + [fury] · [Action] · deal 3 to a unit at a battlefield

describe("Kinkou Temple (ven-159-166)", () => {
  test("registry payload: ONE static modify-might +1 whose target is units HERE filtered by keyword Tank", async () => {
    await scenario().battlefield("temple", { controller: null, def: CARD, inert: false }).build();
    expect(getGlobalCardRegistry().get("temple")).toMatchObject({ cardType: "battlefield", name: "Kinkou Temple" });
    expect(getGlobalCardRegistry().getAbilities("temple")).toEqual([
      { effect: { amount: 1, target: { filter: { keyword: "Tank" }, location: "here", type: "unit" }, type: "modify-might" }, type: "static" },
    ] as never);
  });

  test("filter precision: Tank units HERE (mine and the enemy's) are +1; a non-Tank unit here, a Tank in base and a Tank at another battlefield read printed Might; nothing on the chain", async () => {
    const game = await scenario()
      .battlefield("temple", { controller: P1, def: CARD, inert: false })
      .battlefield("plain", { controller: P1 })
      .unit(P1, "temple", { keywords: ["Tank"], might: 2, name: "My Tank Here" }, "mineHere")
      .unit(P2, "temple", { keywords: ["Tank"], might: 2, name: "Their Tank Here" }, "theirsHere")
      .unit(P1, "temple", { might: 2, name: "Plain Here" }, "plainHere")
      .unit(P1, "base", { keywords: ["Tank"], might: 2, name: "Tank Home" }, "tankHome")
      .unit(P1, "plain", { keywords: ["Tank"], might: 2, name: "Tank Elsewhere" }, "tankElse")
      .build();
    expect(game.state("mineHere")).toMatchObject({ baseMight: 2, might: 3, staticMightBonus: 1 });
    expect(game.state("theirsHere")).toMatchObject({ baseMight: 2, might: 3 });
    expect(game.state("plainHere").might).toBe(2);
    expect(game.state("tankHome").might).toBe(2);
    expect(game.state("tankElse").might).toBe(2);
    expect(game.chain()).toEqual([]);
  });

  test("no control rider: at an UNCONTROLLED Temple the lone enemy Tank camping there is still +1", async () => {
    const game = await scenario().battlefield("temple", { controller: null, def: CARD, inert: false }).unit(P2, "temple", SUNLIT_GUARDIAN, "sun").build();
    expect(game.state("sun")).toMatchObject({ baseMight: 3, might: 4 });
  });

  test("dynamic keyword: Block gives the plain 2-Might unit here [Tank] this turn → it reads 3 at once; next turn Tank and the +1 are both gone", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("temple", { controller: P1, def: CARD, inert: false })
      .unit(P1, "temple", { might: 2, name: "Plain" }, "plain")
      .hand(P1, BLOCK, "block")
      .build();
    expect(game.state("plain").might).toBe(2);
    await game.p1.cast("block", { targets: "plain" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("plain").keywords).toEqual(expect.arrayContaining(["Tank", "Shield"]));
    expect(game.state("plain").might).toBe(3); // Shield 3 adds nothing outside of defending
    await game.advanceTurn();
    expect(game.state("plain").keywords).not.toContain("Tank");
    expect(game.state("plain").might).toBe(2);
  });

  test("negative space: the same Block on a unit in BASE grants Tank but no Might (not 'here')", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("temple", { controller: P1, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .hand(P1, BLOCK, "block")
      .build();
    await game.p1.cast("block", { targets: "home" });
    await game.settle();
    expect(game.state("home").keywords).toContain("Tank");
    expect(game.state("home").might).toBe(2);
  });

  test("arriving and leaving: Sunlit Guardian is 3 in base, 4 the moment it attacks into the Temple (showdown open), and 3 again as soon as it walks home", async () => {
    const game = await scenario()
      .battlefield("temple", { controller: P2, def: CARD, inert: false })
      .unit(P2, "temple", { might: 3, name: "Camper" }, "camper")
      .unit(P1, "base", SUNLIT_GUARDIAN, "sun")
      .build();
    expect(game.state("sun").might).toBe(3);
    await game.p1.move("sun", "temple");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.state("sun")).toMatchObject({ combatRole: "attacker", might: 4 }); // Shield is defender-only; Tank +1 here
    expect(game.state("camper").might).toBe(3); // no Tank: no bonus
    await game.settle(); // 4 v 3
    expect(game.zoneOf("camper")).toBe("trash");
    expect(game.locationOf("sun")).toBe("temple");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.state("sun").might).toBe(4);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1); // Awaken readies the Guardian
    expect(game.state("sun")).toMatchObject({ isExhausted: false, might: 4 });
    await game.p1.move("sun", "base");
    expect(game.state("sun").might).toBe(3);
  });

  test("stacking on defence (476): Sunlit Guardian defending HERE is 3 + Shield 1 + Temple 1 = 5 — a 4-Might raider dies and the Guardian holds; at an inert battlefield the same raid is a 4 v 4 trade", async () => {
    const here = await scenario()
      .active(P2)
      .battlefield("temple", { controller: P1, def: CARD, inert: false })
      .unit(P1, "temple", SUNLIT_GUARDIAN, "sun")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await here.p2.move("raider", "temple");
    expect(here.state("sun")).toMatchObject({ combatRole: "defender", might: 5 });
    await here.settle();
    expect(here.zoneOf("raider")).toBe("trash");
    expect(here.locationOf("sun")).toBe("temple");
    expect(here.gameState.battlefields.temple?.controller).toBe(P1);

    const plain = await scenario()
      .active(P2)
      .battlefield("field", { controller: P1 })
      .unit(P1, "field", SUNLIT_GUARDIAN, "sun")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await plain.p2.move("raider", "field");
    expect(plain.state("sun").might).toBe(4);
    await plain.settle();
    expect(plain.zoneOf("raider")).toBe("trash");
    expect(plain.zoneOf("sun")).toBe("trash");
  });

  test("exactly-lethal shifts by one: Hextech Ray's 3 damage kills a printed-3 Tank at a plain battlefield but leaves it alive (3 damage < 4) at the Temple", async () => {
    const atTemple = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("temple", { controller: P2, def: CARD, inert: false })
      .unit(P2, "temple", SUNLIT_GUARDIAN, "sun")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await atTemple.p1.cast("ray", { targets: "sun" });
    await atTemple.settle();
    expect(atTemple.zoneOf("sun")).toBe("battlefield-temple");
    expect(atTemple.state("sun")).toMatchObject({ damage: 3, might: 4 });

    const atPlain = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("field", { controller: P2 })
      .unit(P2, "field", SUNLIT_GUARDIAN, "sun")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await atPlain.p1.cast("ray", { targets: "sun" });
    await atPlain.settle();
    expect(atPlain.zoneOf("sun")).toBe("trash");
  });

  test("Tank still does its own job here: a 3-Might raider into {1-Might Squire, Sunlit Guardian} — all damage must go to the Tank (4 here) first, so the Squire survives and the raider dies", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("temple", { controller: P1, def: CARD, inert: false })
      .unit(P1, "temple", { might: 1, name: "Squire" }, "squire")
      .unit(P1, "temple", SUNLIT_GUARDIAN, "sun")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "temple");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // takes 1 + 5
    expect(game.locationOf("squire")).toBe("temple");
    expect(game.locationOf("sun")).toBe("temple");
    expect(game.violations()).toEqual([]);
  });
});
