/**
 * Crescent Strike — unl-072-219 · Spell · Mind · 3 energy + [mind] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose a battlefield and an enemy unit there. Deal 4 to that unit and 1 to each other enemy
 *   unit there.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Only ONE thing is really chosen among units — an ENEMY unit AT A BATTLEFIELD. Friendly units,
 *     and enemy units in a base, are never legal; with no enemy unit at any battlefield the spell is
 *     unplayable (355.8).
 *  2. The 1-damage riders are NOT choices: they hit every OTHER ENEMY unit at THAT battlefield only —
 *     not friendlies there, not enemies at another battlefield or in base — and they ignore Deflect
 *     (809: a tax on being CHOSEN). Choosing the Deflect unit as the primary target does cost +1 power.
 *  3. Exact numbers: 4 kills a 4-Might unit, leaves a 5-Might one alive on 4; the splash kills
 *     1-Might units and only scratches bigger ones. A lone enemy takes 4 and nothing splashes.
 *  4. [Action] timing: own turn (Open) or with Focus in a showdown — including the combat showdown
 *     P1 opens by attacking, where the damage sticks into the combat that follows; never on the
 *     opponent's turn outside a showdown.
 *  5. Mistargeting (359.3.e.5/.9): if the chosen unit Flashes to base in response it takes nothing;
 *     the battlefield choice is still good, so the OTHER enemy units there should still take 1
 *     (engine drops the whole effect — flagged below).
 *  6. Cost: exactly 3 + [mind]; 3 energy with off-domain power only, or 2 + [mind], is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-072-219";
const POUTY_PORO = "ogn-013-298"; // Unit · 2 Might · [Deflect]
const FLASH = "ogs-011-024"; // Reaction · 2 · Move up to 2 friendly units to base.

/** P1 to act with 3 + [mind] (+1 spare rainbow). bf1: enemies Big(5), Four(4), Tiny(1). bf2: enemy Far(1). P2 base: Home(1). P1 base: Mine(1). */
function board(p1: { energy?: number; power?: Record<string, number> } = { energy: 3, power: { mind: 1, rainbow: 1 } }) {
  return scenario()
    .resources(P1, p1)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "bf1", { might: 1, name: "Tiny" }, "tiny")
    .unit(P1, "base", { might: 1, name: "Mine" }, "mine")
    .unit(P2, "bf2", { might: 1, name: "Far" }, "far")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .hand(P1, CARD, "cs");
}

function targetsOf(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  return (game.p1.option("cast", "cs")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
}

describe("Crescent Strike (unl-072-219)", () => {
  test("cost: exactly 3 energy + 1 mind is deducted on cast; the spell resolves to the trash", async () => {
    const game = await board({ energy: 3, power: { mind: 1 } }).build();
    await game.p1.cast("cs", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cs", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("cs")).toBe("trash");
  });

  test("cost negative space: 3 energy with only fury power, or 2 energy + mind, cannot cast", async () => {
    const offDomain = await board({ energy: 3, power: { fury: 2 } }).build();
    expect(offDomain.p1.can("cast", "cs")).toBe(false);
    const short = await board({ energy: 2, power: { mind: 1 } }).build();
    expect(short.p1.can("cast", "cs")).toBe(false);
  });

  test("legal choices are ENEMY units AT A BATTLEFIELD only: Big/Four/Tiny/Far — never a friendly unit at a battlefield nor the enemy Home in base", async () => {
    const game = await board().battlefield("bf3", { controller: P1 }).unit(P1, "bf3", { might: 2, name: "Ally" }, "ally").build();
    const offered = targetsOf(game);
    expect(offered).toHaveLength(4);
    expect(offered).toEqual(expect.arrayContaining([["big"], ["four"], ["tiny"], ["far"]]));
    for (const illegal of ["ally", "mine", "home"]) {
      const r = await game.p1.try((p) => p.cast("cs", { targets: illegal }));
      expect(r.ok).toBe(false);
    }
    expect(game.zoneOf("cs")).toBe("hand");
    const none = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "base", { might: 1 }, "home").unit(P1, "bf1", { might: 1 }, "mine").hand(P1, CARD, "cs").build();
    expect(none.p1.can("cast", "cs")).toBe(false);
  });

  test("4 to the chosen unit, 1 to each OTHER ENEMY unit THERE: Big takes 4 (lives), Four 1, Tiny dies; Far (other bf), Home (enemy base) and Mine (own base) untouched", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { targets: "big" });
    await game.settle();
    expect(game.state("big").damage).toBe(4);
    expect(game.zoneOf("big")).toBe("battlefield-bf1"); // 4 < 5
    expect(game.state("four").damage).toBe(1);
    expect(game.zoneOf("tiny")).toBe("trash"); // 1 into 1 Might
    expect(game.state("mine").damage).toBe(0);
    expect(game.state("far").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("friendly units sharing the chosen battlefield are not 'enemy units there': in a showdown at bf1 the attacking Raider takes no splash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P2, "bf1", { might: 9, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 1, name: "Raider" }, "raider")
      .unit(P1, "base", { might: 1, name: "Buddy" }, "buddy")
      .hand(P1, CARD, "cs")
      .build();
    await game.p1.move(["raider", "buddy"], "bf1");
    await game.p1.cast("cs", { targets: "wall" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // spell resolves; the showdown is still open
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.state("wall").damage).toBe(4);
    expect(game.state("guard").damage).toBe(1);
    expect(game.state("raider").damage).toBe(0);
    expect(game.state("buddy").damage).toBe(0);
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("exactly lethal on the primary: choosing Four (4 Might) kills it; Big and Tiny each take just 1 (Tiny dies, Big lives on 1)", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.state("big").damage).toBe(1);
    expect(game.zoneOf("tiny")).toBe("trash");
  });

  test("a lone enemy at the chosen battlefield takes 4 and nothing else anywhere is touched", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { targets: "far" });
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    for (const id of ["big", "four", "tiny", "mine", "home"]) {
      expect(game.state(id).damage).toBe(0);
    }
  });

  test("Deflect interplay: splashing a Pouty Poro costs nothing extra (not chosen); choosing the Poro as the primary target costs +1 power of any domain, and is impossible without it", async () => {
    const splash = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, CARD, "cs")
      .build();
    await splash.p1.cast("cs", { targets: "big" });
    expect(splash.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await splash.settle();
    expect(splash.state("poro").damage).toBe(1);
    expect(splash.state("big").damage).toBe(4);

    const noSpare = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, CARD, "cs")
      .build();
    const r = await noSpare.p1.try((p) => p.cast("cs", { targets: "poro" }));
    expect(r.ok).toBe(false);

    const paid = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1, fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, CARD, "cs")
      .build();
    await paid.p1.cast("cs", { targets: "poro" });
    expect(paid.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await paid.settle();
    expect(paid.zoneOf("poro")).toBe("trash");
    expect(paid.state("big").damage).toBe(1);
  });

  test("[Action] in P1's own combat showdown: strike the defenders with Focus, then the softened 3-Might defender dies to a 2-Might attacker's combat damage on top of the splash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "cs")
      .build();
    await game.p1.move("raider", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "cs")).toBe(true);
    await game.p1.cast("cs", { targets: "wall" });
    await game.settle(); // spell resolves (Wall dies, Guard on 1), both pass focus, combat: 4 into Guard (1+4 ≥ 3), 3 back into Raider (lives)
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Action] timing negative space: not castable on the opponent's turn in their open Main Phase, nor in response on a chain (it is not a Reaction)", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "cs")).toBe(false);
    const onChain = await board({ energy: 6, power: { mind: 2 } }).hand(P1, CARD, "cs2").build();
    await onChain.p1.cast("cs", { targets: "big" });
    expect((onChain.decision() as ActionDecision).context).toBe("chain");
    expect(onChain.p1.can("cast", "cs2")).toBe(false);
  });

  test("the opponent may respond: Flash pulls the chosen unit to base → it takes nothing (359.3.e.9)", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, FLASH, "flash").build();
    await game.p1.cast("cs", { targets: "big" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["big"] });
    await game.settle();
    expect(game.locationOf("big")).toBe("base");
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("cs")).toBe("trash");
  });

  // BUG — expected (359.3.e.5 / 359.3.e.8): the battlefield was chosen separately from the unit, so
  // when only the UNIT mistargets (Flashed to base) the "1 to each other enemy unit there" rider
  // still lands on Four and Tiny at bf1. Actual: the engine derives "there" from the primary
  // target's current zone, so once Big is in base nobody at bf1 is damaged.
  test("when the chosen unit leaves in response, the other enemy units at the chosen battlefield should still take 1", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, FLASH, "flash").build();
    await game.p1.cast("cs", { targets: "big" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["big"] });
    await game.settle();
    expect(game.state("big").damage).toBe(0);
    expect(game.state("four").damage).toBe(1);
    expect(game.zoneOf("tiny")).toBe("trash");
  });

  test("registry payload matches the printed text: Action spell, 3 + [mind], damage 4 to an enemy unit at a battlefield with splashOthers 1", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 3, name: "Crescent Strike", powerCost: ["mind"], timing: "action" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 4, splashOthers: 1, target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "damage" },
        timing: "action",
        type: "spell",
      },
    ]);
  });
});
