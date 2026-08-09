/**
 * Vanguard Sergeant — ogn-219-298 · Unit · Order · 4 energy (no power) · 4 Might
 *
 *   (no rules text — a vanilla unit)
 *
 * Rules: 143.4 (units enter the board exhausted), 355.2.a (valid locations: your base or a
 * battlefield you control), 359.2 (a permanent leaves the chain and becomes a game object as it is
 * finalized — nothing lingers to respond to), 144 (standard move: exhaust as the cost; not during a
 * showdown / closed state), 465 (combat damage by Might), 317.2 (damage heals at end of turn).
 *
 * Head-judge notes — the "tricky" situations for a vanilla 4/4:
 *  1. Registry payload must carry NO abilities and no keywords (a stray parse would be a bug).
 *  2. Cost: exactly 4 energy, no power of any kind; 3 energy → not legal; power alone never helps.
 *  3. Location: base or a battlefield P1 controls — never an enemy/uncontrolled battlefield.
 *  4. Enters exhausted, so it cannot move the turn it is played; next turn it readies and can.
 *  5. Combat arithmetic: 4 Might trades exactly with a 4; kills a 3 and survives with 3 damage that
 *     heals at end of turn; loses to a 5. Conquering an enemy-held battlefield scores 1.
 *  6. Timing: not playable on the opponent's turn nor during a showdown (standard speed only).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-219-298";

function inHand(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Flag" }, "flag")
    .unit(P2, "bf2", { might: 1, name: "EnemyFlag" }, "eflag")
    .hand(P1, CARD, "sarge");
}

describe("Vanguard Sergeant (ogn-219-298)", () => {
  test("registry payload: a 4-cost, 4-Might Order unit with no abilities and no keywords", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, might: 4, name: "Vanguard Sergeant" });
    expect(def?.abilities ?? []).toEqual([]);
    expect(def?.keywords ?? []).toEqual([]);
    expect(def?.powerCost ?? []).toEqual([]);
  });

  test("cost: playing it deducts exactly 4 energy and no power; it lands in base exhausted with 4 Might (143.4)", async () => {
    const game = await inHand(6).resources(P1, { power: { order: 1 } }).build();
    await game.p1.play("sarge", { to: "base" });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    const s = game.state("sarge");
    expect(s).toMatchObject({ baseMight: 4, damage: 0, isExhausted: true, might: 4, owner: P1 });
    expect(s.keywords).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable: 3 energy is not enough, and Order power does not substitute for energy", async () => {
    const short = await inHand(3).build();
    expect(short.p1.can("play", "sarge")).toBe(false);
    const powerOnly = await inHand(0).resources(P1, { power: { order: 4 } }).build();
    expect(powerOnly.p1.can("play", "sarge")).toBe(false);
  });

  test("locations (355.2.a): offered base and the battlefield P1 controls, never the enemy battlefield", async () => {
    const game = await inHand().build();
    const to = game.p1.option("play", "sarge")?.fields.find((f) => f.arg === "to")?.options ?? [];
    const flat = to.map(String);
    expect(flat.some((z) => z.includes("base"))).toBe(true);
    expect(flat.some((z) => z.includes("bf1"))).toBe(true);
    expect(flat.some((z) => z.includes("bf2"))).toBe(false);
    const r = await game.p1.try((p) => p.play("sarge", { to: "bf2" }));
    expect(r.ok).toBe(false);
    await game.p1.play("sarge", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
  });

  test("enters exhausted so it cannot move this turn; after a full round it is ready and can move (144.2)", async () => {
    const game = await inHand().build();
    await game.p1.play("sarge", { to: "base" });
    await game.settle();
    const now = await game.p1.try((p) => p.move("sarge", "bf1"));
    expect(now.ok).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sarge").isReady).toBe(true);
    await game.p1.move("sarge", "bf1");
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").isExhausted).toBe(true);
  });

  test("combat: 4 Might kills a 3-Might defender, survives with 3 damage, conquers (+1 point); damage heals at end of turn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Def3" }, "def")
      .unit(P1, "base", CARD, "sarge")
      .build();
    await game.p1.move("sarge", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // Combat cleanup heals damage from surviving units (143.3.b.2).
    expect(game.state("sarge").damage).toBe(0);
  });

  test("combat: trades exactly with a 4-Might defender (both die, no conquer); loses outright to a 5", async () => {
    const trade = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Def4" }, "def")
      .unit(P1, "base", CARD, "sarge")
      .build();
    await trade.p1.move("sarge", "bf1");
    await trade.settle();
    expect(trade.zoneOf("sarge")).toBe("trash");
    expect(trade.zoneOf("def")).toBe("trash");
    // 323.6 — an emptied battlefield is controlled by nobody; P1 did not conquer it.
    expect(trade.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(trade.p1.points()).toBe(0);

    const lose = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Def5" }, "def")
      .unit(P1, "base", CARD, "sarge")
      .build();
    await lose.p1.move("sarge", "bf1");
    await lose.settle();
    expect(lose.zoneOf("sarge")).toBe("trash");
    expect(lose.zoneOf("def")).toBe("battlefield-bf1");
    expect(lose.state("def").damage).toBe(0); // healed in combat cleanup
    expect(lose.p2.points()).toBe(0); // defending successfully scores nothing by itself
  });

  test("as a defender: an enemy 3-Might attacker dies to it and P1 keeps the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sarge")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("timing: not playable on the opponent's turn, nor while a showdown is open", async () => {
    const opp = await inHand().active(P2).build();
    expect(opp.p1.can("play", "sarge")).toBe(false);

    const sd = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "def")
      .unit(P1, "base", { might: 2 }, "scout")
      .hand(P1, CARD, "sarge")
      .build();
    await sd.p1.move("scout", "bf1"); // opens a combat showdown, P1 has focus
    expect(sd.p1.can("play", "sarge")).toBe(false);
  });
});
