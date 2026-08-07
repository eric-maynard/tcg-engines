/**
 * Sacred Protector — ven-129-166 · Unit · Order · 4 energy + [order] · 6 Might
 *
 *   I don't deal combat damage unless I'm at a battlefield with exactly one other unit you control.
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. "exactly one OTHER unit YOU control" at ITS battlefield: alone → 0 combat damage; with one
 *     friendly companion → full 6; with two companions → 0 again. Enemy units there never count;
 *     friendly units at OTHER locations never count. A friendly token unit is a unit and counts.
 *  2. It only withholds the damage it DEALS: it is still assigned and dealt damage normally, still
 *     needs 6 to die, and still counts as an attacker/defender for combat structure (so a lone
 *     Protector that kills nothing is recalled home as a surviving attacker, 466.1.a.2).
 *  3. The condition is read when combat damage is calculated (465.2, "current"): a companion killed
 *     during the showdown (reaction spell) turns the Protector's damage OFF before blows land.
 *  4. Only COMBAT damage: "deal damage equal to Might" spells (Challenge) use its full 6 even alone
 *     and even from base (417.6.b.3).
 *  5. Applies on defense too: a lone defending Protector deals nothing to the attacker (who is then
 *     recalled if it can't kill a 6), but with exactly one co-defender it hits back for 6.
 *  6. Cost: 4 energy AND one order power; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-129-166";
const CHALLENGE = "ogn-128-298"; // [Action] 2 + [body]: a friendly and an enemy unit deal damage equal to their Mights to each other
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Zap",
  timing: "reaction",
} as const;

/** P1 attacks: Protector + two 1-Might friends in base, P2's 3-Might Wall on bf1. */
function attackBoard() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", CARD, "sp")
    .unit(P1, "base", { might: 1, name: "Buddy" }, "buddy")
    .unit(P1, "base", { might: 1, name: "Extra" }, "extra")
    .unit(P1, "bf2", { might: 2, name: "Faraway" }, "faraway")
    .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
    .hand(P2, ZAP, "zap");
}

/** P2 attacks P1's bf1 where the Protector defends (optionally with friends). */
function defendBoard(coDefenders: number) {
  const b = scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "sp");
  for (let i = 0; i < coDefenders; i++) {
    b.unit(P1, "bf1", { might: 1, name: `Page${i}` }, `page${i}`);
  }
  return b.unit(P2, "base", { might: 2, name: "Raider" }, "raider");
}

describe("Sacred Protector (ven-129-166)", () => {
  test("registry payload — 4 energy + [order], 6 Might, and ONE static modelling the conditional 'no combat damage unless exactly one other friendly unit here'; the ability list is empty", async () => {
    // Expected: a static ability carrying the combat-damage restriction and its "exactly one other" condition.
    // Actual: parseSuccess=false → abilities undefined; the unit is a vanilla 6.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, might: 6, name: "Sacred Protector", powerCost: ["order"] });
    expect(def?.abilities ?? []).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({ type: "static" });
    expect(JSON.stringify(def?.abilities?.[0])).toMatch(/combat/i);
  });

  test("printed stats + cost: 4 energy + 1 order deducted, enters base exhausted at 6 Might; 3 energy or no order power → not playable", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, might: 6, powerCost: ["order"] });
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "sp").build();
    await game.p1.play("sp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("sp")).toBe("base");
    expect(game.state("sp")).toMatchObject({ isExhausted: true, might: 6 });
    expect((await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "sp").build()).p1.can("play", "sp")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "sp").build()).p1.can("play", "sp")).toBe(false);
  });

  test("attacking ALONE into a 3-Might Wall it deals no combat damage — Wall lives, the Protector eats 3 (survives) and is recalled to base, bf1 stays P2's, no point", async () => {
    // Expected (465.2 + this static): attacker total 0 → Wall undamaged; 3 < 6 so sp survives → 466.1.a.2 recall.
    // Actual: no static exists, sp deals 6, kills the Wall and conquers.
    const game = await attackBoard().build();
    await game.p1.move("sp", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("sp")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("with EXACTLY ONE other friendly unit alongside (Buddy) it fights normally: 6+1 into the Wall kills it and P1 conquers bf1", async () => {
    const game = await attackBoard().build();
    await game.p1.move(["sp", "buddy"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("sp")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("a friendly TOKEN unit is 'a unit you control': Protector + one Recruit token also fights at full strength", async () => {
    const game = await attackBoard().card("token-recruit", { def: { cardType: "unit", might: 1, name: "Recruit" }, owner: P1, zone: "base" }).build();
    expect(game.state("token-recruit").isToken).toBe(true);
    await game.p1.move(["sp", "token-recruit"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("with TWO other friendly units alongside (Buddy + Extra) it is silent again — 1+1 can't kill the 3-Might Wall, which survives and keeps bf1", async () => {
    // Expected: attackers deal 0+1+1 = 2 < 3 → Wall lives; P2 holds bf1; no point for P1.
    // Actual: sp contributes 6, the Wall dies, P1 conquers.
    const game = await attackBoard().build();
    await game.p1.move(["sp", "buddy", "extra"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("friendly units ELSEWHERE don't count — Faraway sits at bf2 while the Protector attacks bf1 alone: still no combat damage, Wall survives", async () => {
    // Expected: "at a battlefield with exactly one other unit" is about ITS battlefield; bf2's Faraway is irrelevant.
    // Actual: sp deals 6 regardless.
    const game = await attackBoard().build();
    expect(game.locationOf("faraway")).toBe("bf2");
    await game.p1.move("sp", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
  });

  test("the count is read at combat-damage time (465.2) — P2 Zaps Buddy dead during the showdown, the Protector is alone when blows land and the Wall survives", async () => {
    // Expected: buddy dies to the reaction; at damage calc sp has 0 companions → deals 0 → Wall lives, sp recalled.
    // Actual: sp deals 6 and conquers.
    const game = await attackBoard().build();
    await game.p1.move(["sp", "buddy"], "bf1");
    await game.p1.passFocus();
    await game.p2.cast("zap", { targets: "buddy" });
    await game.settle();
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("sp")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("only COMBAT damage is withheld (417.6.b.3): a lone Protector in base chosen for Challenge still deals its full 6 — the 3-Might Wall dies, sp takes 3", async () => {
    const game = await attackBoard().resources(P1, { energy: 2, power: { body: 1 } }).hand(P1, CHALLENGE, "challenge").build();
    await game.p1.cast("challenge", { targets: ["sp", "wall"] });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("sp")).toBe("base");
    expect(game.state("sp").damage).toBe(3);
  });

  test("defending ALONE it deals nothing back — a 2-Might Raider attacking it survives (2 < 6 so sp lives too), the Raider is recalled and bf1 stays P1's", async () => {
    // Expected: defender total 0 → Raider undamaged; both sides remain → 466.1.a.2 recalls the attacker.
    // Actual: sp deals 6 and the Raider dies.
    const game = await defendBoard(0).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("sp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("defending with EXACTLY ONE co-defender it hits back: the 2-Might Raider dies, P1 keeps bf1", async () => {
    const game = await defendBoard(1).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("defending with TWO co-defenders (1+1) it is silent — against a 3-Might raider the defenders deal only 2, so the raider survives and is recalled while sp keeps bf1", async () => {
    // Expected: defenders deal 0+1+1 = 2 < 3 → the Raider lives; its 3 damage kills at most the pages; sp remains → recall.
    // Actual: sp adds 6, the Raider dies.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sp")
      .unit(P1, "bf1", { might: 1, name: "PageA" }, "pageA")
      .unit(P1, "bf1", { might: 1, name: "PageB" }, "pageB")
      .unit(P2, "base", { might: 3, name: "Big Raider" }, "raider3")
      .build();
    await game.p2.move("raider3", "bf1");
    await game.settle();
    expect(game.zoneOf("raider3")).toBe("base");
    expect(game.zoneOf("sp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
