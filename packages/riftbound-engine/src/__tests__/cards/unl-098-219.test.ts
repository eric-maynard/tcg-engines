/**
 * Targonian Visionary — unl-098-219 · Unit · Body · 6 energy · 6 Might
 *
 *   [Level 11][>] I have +4 [Might]. (While you have 11+ XP, get the effect.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - 824.1.b/c/d: a Dependent (passive) ability — active exactly while its CONTROLLER has ≥ 11 XP;
 *    no chain, no snapshot: crossing 10 → 11 mid-turn flips it on at once, dropping below flips it
 *    off "as soon as" the XP is gone (even while the ability that spent it is still on the chain).
 *  - Threshold edges: 10 XP = 6 Might, 11 XP = 10 Might, 20 XP still 10 (not per-level, not cumulative).
 *  - "you" = controller (824.1.c.1): the opponent's XP never counts; a Visionary P2 controls but P1
 *    owns reads P2's XP.
 *  - "I have": only this unit — no other unit (friendly or enemy) gets +4.
 *  - It is real Might in combat: at 11 XP it kills a 9-Might defender and survives 9 damage; at
 *    10 XP the same attack is suicide. Losing the level while carrying 7 damage is lethal (7 ≥ 6).
 * Partner cards: Demacian Diplomat unl-092-219 ("When you play me, gain 1 XP"), Fleetfeather...
 * [Hunt 3] unl-100-219 (conquer → +3 XP), Crowd Favorite unl-102-219 ("Spend 2 XP: Buff me").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-098-219";
const DIPLOMAT = "unl-092-219";
const HUNT3 = "unl-100-219";
const CROWD_FAVORITE = "unl-102-219";

async function mightAt(xp: number): Promise<number> {
  const game = await scenario().xp(P1, xp).unit(P1, "base", CARD, "vis").build();
  return game.state("vis").might;
}

describe("Targonian Visionary (unl-098-219)", () => {
  test("threshold: 0 / 10 XP → 6 Might; 11 XP → 10 Might (+4 as a static bonus, base stays 6); 20 XP → still 10", async () => {
    expect(await mightAt(0)).toBe(6);
    expect(await mightAt(10)).toBe(6);
    expect(await mightAt(11)).toBe(10);
    expect(await mightAt(20)).toBe(10);
    const game = await scenario().xp(P1, 11).unit(P1, "base", CARD, "vis").build();
    expect(game.state("vis")).toMatchObject({ baseMight: 6, might: 10, mightModifier: 0, staticMightBonus: 4 });
  });

  test("'I have': no other unit — friendly or enemy — gets the +4", async () => {
    const game = await scenario()
      .xp(P1, 11)
      .unit(P1, "base", CARD, "vis")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .build();
    expect(game.state("vis").might).toBe(10);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("foe").might).toBe(2);
  });

  test("'you' = controller: the opponent sitting on 11 XP does nothing for P1's Visionary", async () => {
    const game = await scenario().xp(P1, 0).xp(P2, 11).unit(P1, "base", CARD, "vis").build();
    expect(game.state("vis").might).toBe(6);
  });

  test("824.1.c.1: control, not ownership — a Visionary P1 owns but P2 controls must read P2's XP", async () => {
    const p2HasXp = await scenario()
      .xp(P1, 0)
      .xp(P2, 11)
      .card("vis", { controller: P2, def: CARD, owner: P1, zone: "base" })
      .build();
    expect(p2HasXp.state("vis").controller).toBe(P2);
    expect(p2HasXp.state("vis").might).toBe(10);
    const p1HasXp = await scenario()
      .xp(P1, 11)
      .xp(P2, 0)
      .card("vis", { controller: P2, def: CARD, owner: P1, zone: "base" })
      .build();
    expect(p1HasXp.state("vis").might).toBe(6);
  });

  test("no snapshot: playing Demacian Diplomat at 10 XP → the moment its trigger resolves (11 XP) the Visionary already on the board becomes 10", async () => {
    const game = await scenario().xp(P1, 10).resources(P1, { energy: 2 }).unit(P1, "base", CARD, "vis").hand(P1, DIPLOMAT, "dip").build();
    await game.p1.play("dip");
    expect(game.p1.xp()).toBe(10);
    expect(game.state("vis").might).toBe(6); // trigger still on the chain
    await game.settle();
    expect(game.p1.xp()).toBe(11);
    expect(game.state("vis").might).toBe(10);
  });

  test("levelling up through play: a [Hunt 3] ally conquering takes P1 from 8 to 11 XP and the Visionary in base to 10 Might", async () => {
    const game = await scenario()
      .xp(P1, 8)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", HUNT3, "hunter")
      .unit(P1, "base", CARD, "vis")
      .build();
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(11);
    expect(game.state("vis").might).toBe(10);
  });

  test("real Might in combat — at 11 XP it kills a 9-Might defender, survives the 9 damage and conquers", async () => {
    const game = await scenario().xp(P1, 11).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 9, name: "Giant" }, "giant").unit(P1, "base", CARD, "vis").build();
    await game.p1.move("vis", "bf1");
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.locationOf("vis")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space — one XP short (10): the same attack deals only 6, the Giant survives and the Visionary dies", async () => {
    const game = await scenario().xp(P1, 10).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 9, name: "Giant" }, "giant").unit(P1, "base", CARD, "vis").build();
    await game.p1.move("vis", "bf1");
    await game.settle();
    expect(game.zoneOf("vis")).toBe("trash");
    expect(game.locationOf("giant")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("losing the level while damaged is lethal: 7 damage on a 10-Might Visionary, then XP drops below 11 → 6 Might ≤ 7 damage → it dies", async () => {
    const game = await scenario()
      .xp(P1, 12)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CROWD_FAVORITE, "crowd")
      .unit(P1, "bf1", CARD, "vis", { damage: 7 })
      .build();
    expect(game.state("vis")).toMatchObject({ damage: 7, might: 10 });
    await game.p1.activate("crowd"); // Spend 2 XP: Buff me
    await game.settle();
    expect(game.p1.xp()).toBeLessThan(11);
    expect(game.zoneOf("vis")).toBe("trash");
  });

  test("spending XP with Crowd Favorite at 13 XP leaves 11 — the Visionary keeps its +4", async () => {
    const game = await scenario().xp(P1, 13).unit(P1, "base", CROWD_FAVORITE, "crowd").unit(P1, "base", CARD, "vis").build();
    await game.p1.activate("crowd");
    await game.settle();
    expect(game.state("crowd").isBuffed).toBe(true);
    expect(game.p1.xp()).toBe(11);
    expect(game.state("vis").might).toBe(10);
  });

  test("(824.1.d 'inactive as soon as'): once the Spend-XP cost is PAID (ability still on the chain) and XP < 11, the Visionary is already 6 — engine keeps showing 10 until the chain resolves", async () => {
    // Expected: passive re-evaluates continuously; XP is below 11 right after the cost → 6 Might while P2 holds priority.
    // Actual: staticMightBonus is only recomputed after resolution (reads 10 with XP already < 11).
    const game = await scenario().xp(P1, 12).unit(P1, "base", CROWD_FAVORITE, "crowd").unit(P1, "base", CARD, "vis").build();
    await game.p1.activate("crowd");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.xp()).toBeLessThan(11);
    expect(game.state("vis").might).toBe(6);
  });

  test("cost: 6 energy, no power; enters base exhausted; 6 Might below the level, 10 at it; 5 energy is not enough", async () => {
    const low = await scenario().resources(P1, { energy: 6 }).xp(P1, 3).hand(P1, CARD, "vis").build();
    await low.p1.play("vis");
    expect(low.p1.resources()).toEqual({ energy: 0, power: {} });
    await low.settle();
    expect(low.zoneOf("vis")).toBe("base");
    expect(low.state("vis")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6 });
    expect(low.chain()).toEqual([]);
    const high = await scenario().resources(P1, { energy: 6 }).xp(P1, 11).hand(P1, CARD, "vis").build();
    await high.p1.play("vis");
    await high.settle();
    expect(high.state("vis").might).toBe(10);
    expect((await scenario().resources(P1, { energy: 5 }).xp(P1, 11).hand(P1, CARD, "vis").build()).p1.can("play", "vis")).toBe(false);
  });

  test("parsed abilities: one static modify-might +4 gated by a while-level 11 condition (no trigger, no duration)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 6, might: 6, name: "Targonian Visionary" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; condition: unknown; effect: { type: string; amount: number; duration?: string }; trigger?: unknown };
    expect(ab).toMatchObject({ condition: { threshold: 11, type: "while-level" }, effect: { amount: 4, type: "modify-might" }, type: "static" });
    expect(ab.trigger).toBeUndefined();
    expect(ab.effect.duration).toBeUndefined();
  });
});
