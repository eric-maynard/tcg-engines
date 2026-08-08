/**
 * Mosstomper — unl-047-219 · Unit · Calm · 3 energy + [calm] · 3 Might
 *
 *   [Hunt 2] (When I conquer or hold, gain 2 XP.)
 *   [Level 3][>] I have +1 [Might] and [Deflect]. (While you have 3+ XP, get the effect. Opponents
 *   must pay [rainbow] to choose a [Deflect] unit with a spell or ability.)
 *
 * Rules: 823 (Hunt X = "When I conquer or hold, my controller gains X XP" — one ability that is both a
 * conquer and a hold effect; only units PRESENT at the scored battlefield trigger, 383.4.c/d), 824 +
 * 727.1.b (Level N: the dependent ability is active exactly WHILE the controller has N+ XP — a live,
 * continuous gate, checked against the CONTROLLER's XP, 824.1.c.1), 809 (Deflect: opponents' spells /
 * abilities that choose me cost 1 power of ANY domain more; my controller is never taxed).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Self-enabling: at 1 XP a plain 3-Might Mosstomper conquers → Hunt 2 resolves → 3 XP → it is NOW a
 *     4 with Deflect (727.1.c.2: passives start applying the moment the condition turns true) — but the
 *     combat that earned the XP was fought at 3 Might.
 *  2. Threshold edges: 2 XP = nothing; exactly 3 XP = both halves (+1 AND Deflect), not one of them.
 *  3. Whose XP: the CONTROLLER's. P2 sitting on 9 XP does nothing for P1's Mosstomper.
 *  4. Deflect only while levelled: at 2 XP an enemy Bolt with no power may choose it; at 3 XP it may
 *     not (unless it has a spare power of any domain, which is then spent). P1's own spells are free.
 *  5. Level is "while": losing XP (Crowd Favorite spends it) turns the bonus OFF again mid-turn.
 *  6. Hold half: parked on P1's battlefield through P1's Beginning Phase → trigger on the chain in the
 *     beginning phase, +1 point, +2 XP (1 → 3) and it walks into the main phase already a 4.
 *  7. Combat arithmetic: levelled (4) it kills a 3-Might defender and survives; unlevelled (3) the same
 *     fight is a trade and no conquer → no XP.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-047-219";
const CROWD_FAVORITE = "unl-102-219"; // Body 3 · [Hunt] · Spend 2 XP: Buff me.
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 4 to a unit.",
  timing: "action",
} as const;

const boltTargets = (g: { p2: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  g.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options;

describe("Mosstomper (unl-047-219)", () => {
  test("registry payload: 3+[calm] calm unit, 3 Might; Hunt 2 (conquer + hold gain-xp 2) and a Level-3 static giving +1 Might and Deflect", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, might: 3, name: "Mosstomper" });
    expect(def?.powerCost).toEqual(["calm"]);
    expect(def?.abilities).toHaveLength(4);
    expect(def?.abilities?.slice(0, 3)).toEqual([
      { keyword: "Hunt", type: "keyword", value: 2 },
      { effect: { amount: 2, type: "gain-xp" }, trigger: { event: "conquer", on: "self" }, type: "triggered" },
      { effect: { amount: 2, type: "gain-xp" }, trigger: { event: "hold", on: "self" }, type: "triggered" },
    ]);
    expect(def?.abilities?.[3]).toMatchObject({
      condition: { threshold: 3, type: "while-level" },
      effect: {
        effects: [
          { amount: 1, target: "self", type: "modify-might" },
          { keyword: "Deflect", type: "grant-keyword" },
        ],
        type: "sequence",
      },
      type: "static",
    });
  });

  test("cost: 3 energy + 1 calm; enters the base exhausted as a plain 3-Might Hunt unit with no play effect; 2 energy or no calm → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "moss").build();
    await game.p1.play("moss");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("moss")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3, zone: "base" });
    expect(game.state("moss").keywords).toEqual(["Hunt"]);
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 2 } }).hand(P1, CARD, "m").build()).p1.can("play", "m")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "m").build()).p1.can("play", "m")).toBe(false);
  });

  test("[Level 3] threshold: 0 and 2 XP → 3 Might, no Deflect; exactly 3 (and 5) XP → 4 Might AND Deflect; XP is never spent", async () => {
    for (const [xp, might, deflect] of [[0, 3, false], [2, 3, false], [3, 4, true], [5, 4, true]] as const) {
      const game = await scenario().xp(P1, xp).unit(P1, "base", CARD, "moss").build();
      expect(game.state("moss").might).toBe(might);
      expect(game.state("moss").baseMight).toBe(3);
      expect(game.state("moss").keywords.includes("Deflect")).toBe(deflect);
      expect(game.p1.xp()).toBe(xp);
    }
  });

  test("controller's XP only (824.1.c): the opponent's 9 XP does nothing for P1's Mosstomper", async () => {
    const game = await scenario().xp(P2, 9).xp(P1, 0).unit(P1, "base", CARD, "moss").build();
    expect(game.state("moss").might).toBe(3);
    expect(game.state("moss").keywords).not.toContain("Deflect");
  });

  test("[Hunt 2] on conquer is self-enabling: at 1 XP it walks onto an open battlefield as a 3, conquers (+1 point), gains exactly 2 XP → 3 XP → now a 4 with Deflect", async () => {
    const game = await scenario().xp(P1, 1).battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "moss").build();
    expect(game.state("moss").might).toBe(3);
    await game.p1.move("moss", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3); // 1 + 2, not 1 + 2 + 2 (keyword and trigger are one ability)
    expect(game.p2.xp()).toBe(0);
    expect(game.state("moss").might).toBe(4);
    expect(game.state("moss").keywords).toContain("Deflect");
    expect(game.violations()).toEqual([]);
  });

  test("[Hunt 2] on hold: through P1's Beginning Phase on P1's battlefield → hold trigger on the chain, then +1 point and 1 → 3 XP; it enters the main phase a 4", async () => {
    const game = await scenario().turn(2).active(P2).xp(P1, 1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "moss").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "moss", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(1); // nothing before the trigger resolves
    expect(game.state("moss").might).toBe(3);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("moss").might).toBe(4);
  });

  test("negative space — the opponent's Beginning Phase is not P1's hold, and a Mosstomper in BASE while a friend conquers gains nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "moss")
      .unit(P1, "base", CARD, "lazy")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(1); // scout conquered bf2
    expect(game.p1.xp()).toBe(0); // neither Mosstomper was there
    await game.advanceTurn(); // → P2's turn: P1 holds nothing now
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(0);
    await game.advanceTurn(); // → P1: moss holds bf1 (+2), scout holds bf2 (+0 XP)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(2);
    expect(game.state("moss").might).toBe(3); // 2 XP is one short of Level 3
  });

  test("combat, levelled vs not: at 3 XP (4 Might) it kills a 3-Might defender, survives and conquers (→ 5 XP); at 2 XP (3 Might) the same fight is a trade — no conquer, no XP", async () => {
    const strong = await scenario().xp(P1, 3).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Warden" }, "warden").unit(P1, "base", CARD, "moss").build();
    await strong.p1.move("moss", "bf1");
    await strong.settle();
    expect(strong.zoneOf("warden")).toBe("trash");
    expect(strong.zoneOf("moss")).toBe("battlefield-bf1");
    expect(strong.state("moss").damage).toBe(0);
    expect(strong.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(strong.p1.xp()).toBe(5);

    const weak = await scenario().xp(P1, 2).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Warden" }, "warden").unit(P1, "base", CARD, "moss").build();
    await weak.p1.move("moss", "bf1");
    await weak.settle();
    expect(weak.zoneOf("warden")).toBe("trash");
    expect(weak.zoneOf("moss")).toBe("trash");
    expect(weak.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(weak.p1.points()).toBe(0);
    expect(weak.p1.xp()).toBe(2);
  });

  test("[Deflect] only while levelled: at 2 XP an enemy Bolt with no power may choose (and kill) it; at 3 XP with no power it is not a legal choice (a plain ally still is)", async () => {
    const low = await scenario().active(P2).xp(P1, 2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "moss").unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P2, BOLT, "bolt").build();
    expect(boltTargets(low)).toEqual(expect.arrayContaining([["moss"], ["plain"]]));
    await low.p2.cast("bolt", { targets: "moss" });
    await low.settle();
    expect(low.zoneOf("moss")).toBe("trash");

    const high = await scenario().active(P2).xp(P1, 3).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "moss").unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P2, BOLT, "bolt").build();
    expect(boltTargets(high)).toEqual([["plain"]]);
    const r = await high.p2.try((p) => p.cast("bolt", { targets: "moss" }));
    expect(r.ok).toBe(false);
    expect(high.zoneOf("bolt")).toBe("hand");
    expect(high.p2.energy()).toBe(1);
  });

  test("[Deflect] is a tax, not immunity: at 3 XP an opponent with 1 power of ANY domain (fury) may choose it, pays that power, and exactly-lethal 4 into the 4-Might Mosstomper kills it", async () => {
    const game = await scenario().active(P2).xp(P1, 3).resources(P2, { energy: 1, power: { fury: 1 } }).unit(P1, "base", CARD, "moss").hand(P2, BOLT, "bolt").build();
    expect(game.state("moss").might).toBe(4);
    await game.p2.cast("bolt", { targets: "moss" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("moss")).toBe("trash");
  });

  test("[Deflect] never taxes the controller: at 3 XP P1's own Bolt chooses Mosstomper for exactly 1 energy and no power", async () => {
    const game = await scenario().xp(P1, 3).resources(P1, { energy: 1 }).unit(P1, "base", CARD, "moss").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "moss" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("moss")).toBe("trash"); // 4 into 4
  });

  test("Level is 'while' (727.1.b): spending XP below 3 mid-turn (Crowd Favorite) switches the +1 Might and Deflect OFF again", async () => {
    const game = await scenario().xp(P1, 3).unit(P1, "base", CARD, "moss").unit(P1, "base", CROWD_FAVORITE, "crowd").build();
    expect(game.state("moss").might).toBe(4);
    expect(game.state("moss").keywords).toContain("Deflect");
    await game.p1.activate("crowd");
    await game.settle();
    expect(game.p1.xp()).toBeLessThan(3); // the XP was spent as the cost
    expect(game.state("crowd").isBuffed).toBe(true);
    expect(game.state("moss").might).toBe(3);
    expect(game.state("moss").keywords).not.toContain("Deflect");
  });
});
