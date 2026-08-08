/**
 * Trifarian War Camp — ogn-294-298 · Battlefield
 *
 *   Units here have +1 [Might]. (This includes attackers.)
 *
 * Rules: 364 / 522 (a passive/static ability applies continuously — no chain, no controller
 * condition: it works whoever controls the battlefield, even uncontrolled), 053.3 ("here" = units at
 * THIS battlefield, of every player), 464 (attackers are "here" from the moment they arrive, so the
 * bonus is live during the showdown and the combat), 476 (layers: the +1 is arithmetic and feeds
 * Might-dependent abilities such as [Mighty] checks — 476.3's Fiora example), 703 (stacks with a buff),
 * 437 (damage ≥ Might kills — so +1 Might here is one more damage to survive).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Both sides: the defender AND the arriving attacker read +1 in the showdown; a unit in a base or
 *     at another battlefield reads its printed Might.
 *  2. Observable payoff: a printed-3 unit here survives "deal 3" (Hextech Ray) — at a plain
 *     battlefield the same unit dies. Same for an attacker shot mid-showdown ("includes attackers").
 *  3. Leaving ends it immediately: a Ganking unit stepping from the Camp to another battlefield is
 *     back to printed Might mid-move and after.
 *  4. No control condition: attackers walking onto an UNCONTROLLED Camp already have +1; it stacks
 *     with a buff (2 printed + buff + camp = 4).
 *  5. Layer interplay (476.3): Fiora, Victorious (4) is [Mighty] here (5) and must gain Deflect /
 *     Ganking / Shield exactly as she does from a buff.
 *  6. Symmetric fights stay symmetric: 3 into 3 here is 4 v 4 — still a trade, nobody conquers.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-294-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: deal 3 to a unit at a battlefield
const FIORA_VICTORIOUS = "ogn-232-298"; // 4 Might · While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]

describe("Trifarian War Camp (ogn-294-298)", () => {
  test("units here — of BOTH players — have +1 Might; units in a base or at another battlefield do not", async () => {
    const game = await scenario()
      .battlefield("camp", { controller: P1, def: CARD, inert: false })
      .battlefield("plain", { controller: P2 })
      .unit(P1, "camp", { might: 2, name: "Mine Here" }, "mineHere")
      .unit(P2, "camp", { might: 3, name: "Theirs Here" }, "theirsHere")
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .unit(P2, "plain", { might: 3, name: "Elsewhere" }, "elsewhere")
      .build();
    expect(game.state("mineHere")).toMatchObject({ baseMight: 2, might: 3, staticMightBonus: 1 });
    expect(game.state("theirsHere")).toMatchObject({ baseMight: 3, might: 4 });
    expect(game.state("home").might).toBe(2);
    expect(game.state("elsewhere").might).toBe(3);
    expect(game.chain()).toEqual([]); // a static: nothing ever goes on the chain
  });

  test("'this includes attackers': a 3-Might attacker reads 4 the moment it arrives (showdown open), as does the 3-Might defender", async () => {
    const game = await scenario()
      .battlefield("camp", { controller: P2, def: CARD, inert: false })
      .unit(P2, "camp", { might: 3, name: "Defender" }, "def")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    expect(game.state("atk").might).toBe(3);
    await game.p1.move("atk", "camp");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("def")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle(); // 4 v 4: still a trade
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("payoff: a printed-3 unit HERE survives Hextech Ray's 3 damage (3 < 4); the same unit at a plain battlefield dies", async () => {
    const here = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("camp", { controller: P2, def: CARD, inert: false })
      .unit(P2, "camp", { might: 3, name: "Target" }, "t")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await here.p1.cast("ray", { targets: "t" });
    await here.settle();
    expect(here.zoneOf("t")).toBe("battlefield-camp");
    expect(here.state("t")).toMatchObject({ damage: 3, might: 4 });

    const plain = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("plain", { controller: P2 })
      .unit(P2, "plain", { might: 3, name: "Target" }, "t")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await plain.p1.cast("ray", { targets: "t" });
    await plain.settle();
    expect(plain.zoneOf("t")).toBe("trash");
  });

  test("attackers included, for real: the defender shoots the ATTACKER for 3 inside the showdown and it lives (printed 3, 4 here) to fight the combat", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("camp", { controller: P2, def: CARD, inert: false })
      .unit(P2, "camp", { might: 3, name: "Defender" }, "def")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p1.move("atk", "camp");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("ray", { targets: "atk" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["atk"] })]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ray resolves: 3 damage on a 4-Might attacker
    expect(game.zoneOf("atk")).toBe("battlefield-camp");
    expect(game.state("atk")).toMatchObject({ damage: 3, might: 4 });
    await game.settle(); // combat: 4 into a 4 (atk already carries 3) — both die, nobody conquers
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.camp?.controller).not.toBe(P1);
  });

  test("leaving ends the bonus at once: a Ganking unit stepping from the Camp to another battlefield is back to printed Might", async () => {
    const game = await scenario()
      .battlefield("camp", { controller: P1, def: CARD, inert: false })
      .battlefield("open", { controller: null })
      .unit(P1, "camp", { keywords: ["Ganking"], might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.state("raider").might).toBe(4);
    await game.p1.gank("raider", "open");
    expect(game.state("raider").might).toBe(3);
    await game.settle();
    expect(game.locationOf("raider")).toBe("open");
    expect(game.state("raider")).toMatchObject({ might: 3, staticMightBonus: 0 });
  });

  test("no control condition + stacks with a buff: a buffed printed-2 unit walking onto an UNCONTROLLED Camp reads 4 on arrival and after conquering", async () => {
    const game = await scenario()
      .battlefield("camp", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Veteran" }, "vet", { buffed: true })
      .build();
    expect(game.state("vet").might).toBe(3);
    await game.p1.move("vet", "camp");
    expect(game.state("vet").might).toBe(4);
    await game.settle();
    expect(game.gameState.battlefields.camp?.controller).toBe(P1);
    expect(game.state("vet")).toMatchObject({ baseMight: 2, isBuffed: true, might: 4 });
    expect(game.p1.points()).toBe(1);
  });

  test("the bonus persists across turns for as long as the unit stays (not a 'this turn' effect)", async () => {
    const game = await scenario()
      .battlefield("camp", { controller: P1, def: CARD, inert: false })
      .unit(P1, "camp", { might: 2, name: "Sentry" }, "sentry")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sentry").might).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sentry").might).toBe(3);
  });

  // BUG — expected (476.3, whose own example is Fiora): the Camp's +1 is applied in the arithmetic
  // layer, the ability layer is re-checked, and a printed-4 Fiora, Victorious here is [Mighty] (5) with
  // Deflect, Ganking and Shield — exactly what the engine already does when the +1 comes from a buff.
  // Actual: Might reads 5 but the "While I'm Mighty" keywords are never granted for a static Might source.
  test.failing("BUG: Fiora, Victorious at the Camp is Mighty (4+1) and must have Deflect/Ganking/Shield — she can gank away (476.3)", async () => {
    const game = await scenario()
      .battlefield("camp", { controller: P1, def: CARD, inert: false })
      .battlefield("open", { controller: null })
      .unit(P1, "camp", FIORA_VICTORIOUS, "fiora")
      .build();
    expect(game.state("fiora").might).toBe(5);
    expect([...game.state("fiora").keywords].sort()).toEqual(["Deflect", "Ganking", "Shield"]);
    expect(game.p1.can("gank", "fiora")).toBe(true);
  });

  test("control for the Fiora case: at a PLAIN battlefield an unbuffed Fiora (4) is not Mighty — no keywords, no gank", async () => {
    const game = await scenario()
      .battlefield("plain", { controller: P1 })
      .battlefield("open", { controller: null })
      .unit(P1, "plain", FIORA_VICTORIOUS, "fiora")
      .build();
    expect(game.state("fiora")).toMatchObject({ keywords: [], might: 4 });
    expect(game.p1.can("gank", "fiora")).toBe(false);
  });

  test("registry payload: a single unconditional static — +1 Might to units here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Trifarian War Camp" });
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, target: { location: "here", type: "unit" }, type: "modify-might" }, type: "static" },
    ]);
    expect((def?.abilities?.[0] as { condition?: unknown }).condition).toBeUndefined();
  });
});
