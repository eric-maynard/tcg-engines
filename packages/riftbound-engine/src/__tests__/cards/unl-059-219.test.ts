/**
 * Master Yi, Unstoppable — unl-059-219 · Champion Unit (Master Yi) · Calm · 12 energy + [calm][calm][calm] · 12 Might
 *
 *   [Level 3][>] I cost [2][calm] less. (While you have 3+ XP, get the effect.)
 *   [Level 6][>] I cost [4][calm][calm] less instead.
 *   [Level 11][>] I cost [6][calm][calm][calm] less instead.
 *   [Level 16][>] I can't be chosen by enemy spells and abilities.
 *
 * Rules: 824 / 727.1.b (Level N: dependent ability active WHILE the controller has N+ XP; XP is a
 * threshold, never spent), cost reductions reduce both the energy and the listed power pips of MY cost
 * wherever I am played from (hand or Champion Zone — it is still "playing me"), "instead" = the higher
 * tier REPLACES the lower one (not cumulative: 6 XP is −4/−2 pips, not −6/−3), the Level-16 line is a
 * separate ability that stacks WITH the Level-11 discount. "Can't be chosen" is absolute for ENEMY
 * spells/abilities (no Deflect-style buyout) and says nothing about my controller's own spells.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Price ladder by XP: 0–2 → 12+3 pips · 3–5 → 10+2 · 6–10 → 8+1 · 11+ → 6+0. Each tier must be
 *     checked from both sides (affordable at the tier price, NOT affordable one energy/pip short).
 *  2. "instead" trap: at 6 XP a pool of exactly 6 energy / 0 calm must NOT be enough (that would be the
 *     cumulative reading 2+4 / 1+2).
 *  3. 16+ XP: still costs 6 (Level 11 keeps applying) AND enemy spells cannot choose him at any price;
 *     at exactly 15 XP they still can; P1's own spells always can.
 *  4. Champion Zone: the same ladder applies to playFromChampionZone.
 *  5. Baseline body: 12-Might unit, enters exhausted, no triggers.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-059-219";
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 4 to a unit.",
  timing: "action",
} as const;

function inHand(xp: number, energy: number, calm: number) {
  return scenario().xp(P1, xp).resources(P1, { energy, power: { calm } }).hand(P1, CARD, "yi");
}

const boltTargets = (g: { p2: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  g.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options;

describe("Master Yi, Unstoppable (unl-059-219)", () => {
  test("registry payload: 12+[calm]×3 calm champion, 12 Might, Master Yi tag; three Level-gated self cost reductions (3 / 6 'instead' / 11 'instead')", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 12, isChampion: true, might: 12, name: "Master Yi, Unstoppable", tags: ["Master Yi"] });
    expect(def?.powerCost).toEqual(["calm", "calm", "calm"]);
    expect(def?.abilities).toHaveLength(4);
    expect(def?.abilities?.[0]).toMatchObject({ condition: { threshold: 3, type: "while-level" }, effect: { target: "self", type: "cost-reduction" }, type: "static" });
    expect(def?.abilities?.[1]).toMatchObject({ condition: { threshold: 6, type: "while-level" }, effect: { scope: "instead", target: "self", type: "cost-reduction" }, type: "static" });
    expect(def?.abilities?.[2]).toMatchObject({ condition: { threshold: 11, type: "while-level" }, effect: { scope: "instead", target: "self", type: "cost-reduction" }, type: "static" });
  });

  test("registry payload — the [Level 16] line is a STATIC 'can't be chosen by enemy spells and abilities' ability, but it parsed as type 'spell'", async () => {
    // Expected: { type: "static", condition: while-level 16, effect: untargetable-by-enemies on self }.
    // Actual: { type: "spell", condition: {threshold 16}, effect: grant-keyword Untargetable } — a unit has no "spell" ability.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities?.[3]).toMatchObject({ condition: { threshold: 16, type: "while-level" }, type: "static" });
  });

  test("below Level 3 (0 and 2 XP): full price 12 energy + 3 calm; enters the base exhausted as a 12-Might unit with no chain items; 11 energy or 2 calm → not playable", async () => {
    for (const xp of [0, 2]) {
      const game = await inHand(xp, 12, 3).build();
      await game.p1.play("yi");
      expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
      expect(game.chain()).toEqual([]);
      await game.settle();
      expect(game.state("yi")).toMatchObject({ baseMight: 12, isExhausted: true, might: 12, zone: "base" });
      expect(game.p1.xp()).toBe(xp);
    }
    expect((await inHand(0, 11, 3).build()).p1.can("play", "yi")).toBe(false);
    expect((await inHand(0, 12, 2).build()).p1.can("play", "yi")).toBe(false);
    expect((await inHand(2, 10, 2).build()).p1.can("play", "yi")).toBe(false); // one XP short of the first discount
  });

  test.failing("BUG: [Level 3] I cost [2][calm] less — at exactly 3 XP a pool of 10 energy + 2 calm plays him and is emptied; 9+2 or 10+1 is not enough", async () => {
    // Expected: cost 10 + [calm][calm] at 3–5 XP. Actual: the while-level cost-reduction statics are never
    // consulted by the cost calculator — 12 + 3 calm is demanded at every XP total.
    const game = await inHand(3, 10, 2).build();
    expect(game.p1.can("play", "yi")).toBe(true);
    await game.p1.play("yi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.p1.xp()).toBe(3); // a threshold, nothing spent
    expect((await inHand(5, 9, 2).build()).p1.can("play", "yi")).toBe(false);
    expect((await inHand(5, 10, 1).build()).p1.can("play", "yi")).toBe(false);
  });

  test.failing("BUG: [Level 6] I cost [4][calm][calm] less INSTEAD — at 6 (and 10) XP he costs exactly 8 energy + 1 calm", async () => {
    // Expected: 8 + [calm]. Actual: full 12 + 3 calm demanded (no Level cost reduction implemented).
    for (const xp of [6, 10]) {
      const game = await inHand(xp, 8, 1).build();
      expect(game.p1.can("play", "yi")).toBe(true);
      await game.p1.play("yi");
      expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    }
    expect((await inHand(6, 7, 1).build()).p1.can("play", "yi")).toBe(false);
    expect((await inHand(6, 8, 0).build()).p1.can("play", "yi")).toBe(false);
  });

  test("'instead' is not cumulative: at 6 XP a pool of 6 energy and no calm (the 2+4 / 1+2 stacked reading) is NOT enough", async () => {
    const game = await inHand(6, 6, 0).build();
    expect(game.p1.can("play", "yi")).toBe(false);
    const r = await game.p1.try((p) => p.play("yi"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("yi")).toBe("hand");
  });

  test.failing("BUG: [Level 11] I cost [6][calm][calm][calm] less INSTEAD — at 11 XP he is 6 energy and NO power; 5 energy is one short", async () => {
    // Expected: 6 + no pips. Actual: 12 + 3 calm demanded.
    const game = await inHand(11, 6, 0).build();
    expect(game.p1.can("play", "yi")).toBe(true);
    await game.p1.play("yi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("yi")).toMatchObject({ might: 12, zone: "base" });
    expect((await inHand(11, 5, 3).build()).p1.can("play", "yi")).toBe(false);
  });

  test.failing("BUG: at 16+ XP the Level-11 discount still applies (Level 16 is a separate line, not a replacement) — 6 energy, no power, with 4 calm left untouched", async () => {
    // Expected: pool 6 energy + 4 calm → after play {0, calm 4}. Actual: not playable at 6 energy at all.
    const game = await inHand(20, 6, 4).build();
    await game.p1.play("yi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 4 } });
  });

  test("from the Champion Zone below Level 3: playChampion charges the full 12 + 3 calm and he lands in base exhausted; 11 energy → not offered", async () => {
    const game = await scenario().resources(P1, { energy: 12, power: { calm: 3 } }).champion(P1, CARD, "yi").build();
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.state("yi")).toMatchObject({ isExhausted: true, might: 12 });
    expect((await scenario().resources(P1, { energy: 11, power: { calm: 3 } }).champion(P1, CARD, "yi").build()).p1.can("playChampion")).toBe(false);
  });

  test.failing("BUG: the Level ladder also prices the Champion-Zone play — at 11 XP playChampion is legal with 6 energy and no power", async () => {
    // Expected: offered and paid at 6. Actual: playFromChampionZone demands the printed 12 (+ pips).
    const game = await scenario().xp(P1, 11).resources(P1, { energy: 6 }).champion(P1, CARD, "yi").build();
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    expect(game.p1.resources().energy).toBe(0);
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
  });

  test("[Level 16] negative space: at exactly 15 XP an enemy Bolt may still choose him (he is offered beside a plain ally) and its 4 damage sticks", async () => {
    const game = await scenario().active(P2).xp(P1, 15).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "yi").unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P2, BOLT, "bolt").build();
    expect(boltTargets(game)).toEqual(expect.arrayContaining([["yi"], ["plain"]]));
    await game.p2.cast("bolt", { targets: "yi" });
    await game.settle();
    expect(game.state("yi")).toMatchObject({ damage: 4, zone: "base" });
  });

  test("[Level 16] at 16 XP he can't be chosen by ENEMY spells at any price — a Bolt with plenty of rainbow power is offered only the plain ally; forcing him is rejected", async () => {
    // Expected: targets = [["plain"]] only; cast at yi is illegal and nothing is spent. Actual: yi is offered
    // and hit — the Level-16 line parsed as a "spell"-type ability and is never applied to the unit.
    const game = await scenario().active(P2).xp(P1, 16).resources(P2, { energy: 1, power: { rainbow: 3 } }).unit(P1, "base", CARD, "yi").unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P2, BOLT, "bolt").build();
    expect(boltTargets(game)).toEqual([["plain"]]);
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "yi" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { rainbow: 3 } });
    expect(game.state("yi").damage).toBe(0);
  });

  test("[Level 16] restricts ENEMY choosers only: at 20 XP P1's own Bolt chooses him for exactly 1 energy and the 4 damage lands", async () => {
    const game = await scenario().xp(P1, 20).resources(P1, { energy: 1 }).unit(P1, "base", CARD, "yi").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "yi" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("yi")).toMatchObject({ damage: 4, might: 12, zone: "base" });
  });

  test("the body in combat: a 12-Might Yi attacking an 11-Might defender kills it, survives on 11 damage (healed at cleanup) and conquers", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 11, name: "Colossus" }, "col").unit(P1, "base", CARD, "yi").build();
    await game.p1.move("yi", "bf1");
    await game.settle();
    expect(game.zoneOf("col")).toBe("trash");
    expect(game.state("yi")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
