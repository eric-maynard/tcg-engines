/**
 * Shen, Leader of the Kinkou Order — ven-138-166 · Champion Unit (Shen) · Order · 6 energy + [order][order] · 7 Might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   When I hold, if there is exactly one other unit you control here, you score 1 point.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. "exactly one OTHER unit you control HERE" — Shen alone: no; Shen + 1: yes; Shen + 2: no; the
 *     companion must be at the SAME battlefield (one in base / at another battlefield does not count).
 *  2. 383.2.a.1 — the "if" immediately follows the condition, so it is part of the TRIGGER CONDITION:
 *     checked when he holds (not put on the chain at all when false) and NOT re-checked on resolution
 *     — if the companion is bounced in response (Gust), the point is still scored.
 *  3. 383.4.d.2.a — "When I hold" needs Shen himself at the held battlefield; a hold elsewhere while
 *     he sits in base does nothing. Only YOUR hold (your Beginning Phase).
 *  4. 471.1.a.1 — his point is not a Conquer point, so it can be the FINAL point: at 6/8, hold (7) +
 *     Shen (8) wins the game.
 *  5. Shield is defender-only (814): 8 Might when attacked (a 7 dies to him and he lives), but he
 *     attacks at 7 (trades with a 7).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-138-166";
const GUST = "ogn-169-298"; // Reaction · 1 · Return a unit at a battlefield with 3 Might or less to its owner's hand.

/** P2 is about to end the turn; P1 controls bf1 with Shen plus `companions` vanilla units there. */
function holding(companions: number) {
  const b = scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: P2 }).unit(P1, "bf1", CARD, "shen");
  for (let i = 0; i < companions; i++) {
    b.unit(P1, "bf1", { might: 2, name: `Acolyte ${i + 1}` }, `aco${i + 1}`);
  }
  return b;
}

describe("Shen, Leader of the Kinkou Order (ven-138-166)", () => {
  test("costs 6 energy + [order][order]; a 7-Might unit with printed Shield; one order power short → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { order: 2 } }).hand(P1, CARD, "shen").build();
    await game.p1.play("shen");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("base");
    expect(game.state("shen")).toMatchObject({ baseMight: 7, might: 7 });
    expect(game.state("shen").keywords).toContain("Shield");
    const onePip = await scenario().resources(P1, { energy: 8, power: { order: 1 } }).hand(P1, CARD, "shen").build();
    expect(onePip.p1.can("play", "shen")).toBe(false);
    const fiveEnergy = await scenario().resources(P1, { energy: 5, power: { order: 3 } }).hand(P1, CARD, "shen").build();
    expect(fiveEnergy.p1.can("play", "shen")).toBe(false);
  });

  test("[Shield] defending: 7+1 = 8 — a 7-Might attacker dies, Shen survives and P1 keeps the battlefield; back to 7 after combat", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "shen")
      .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("shen")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("shen").might).toBe(7);
  });

  test("[Shield] boundary: an 8-Might attacker is exactly lethal through the shield — both die", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "shen")
      .unit(P2, "base", { might: 8, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("trash");
  });

  test("Shield is defender-only: Shen ATTACKING a 7-Might defender fights at 7 and trades (both die, no conquer)", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 7, name: "Wall" }, "wall").unit(P1, "base", CARD, "shen").build();
    await game.p1.move("shen", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("When I hold with EXACTLY one other friendly unit here: trigger on the chain in the Beginning Phase → hold point + Shen point = 2", async () => {
    const game = await holding(1).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the hold itself
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shen", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("near-miss: Shen holding ALONE (zero other units here) scores only the hold point and puts nothing on the chain", async () => {
    const game = await holding(0).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("near-miss: TWO other friendly units here is not 'exactly one' → only the hold point", async () => {
    const game = await holding(2).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });

  test("'here': the single other friendly unit must be at Shen's battlefield — one in base or at another held battlefield does not count", async () => {
    const inBase = await holding(0).unit(P1, "base", { might: 2 }, "homebody").build();
    await inBase.advanceTurn();
    expect(inBase.p1.points()).toBe(1);
    const elsewhere = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "shen")
      .unit(P1, "bf2", { might: 2 }, "far")
      .build();
    await elsewhere.advanceTurn();
    expect(elsewhere.p1.points()).toBe(2); // two holds, no Shen bonus
  });

  test("'When I hold': Shen in base while you hold a battlefield with exactly one unit there → no bonus (he must be the one holding)", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2 }, "aco").unit(P1, "base", CARD, "shen").build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1);
  });

  test("only YOUR hold: during the opponent's Beginning Phase nothing triggers and nobody scores off bf1", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "shen").unit(P1, "bf1", { might: 2 }, "aco").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("383.2.a.1: the 'if' is part of the trigger condition — bouncing the companion (Gust) in response does NOT stop the point", async () => {
    // P2's pool empties as their turn ends, so they pay for Gust by tapping a rune while holding priority.
    const game = await holding(1).rune(P2, "chaos", { alias: "r1" }).hand(P2, GUST, "gust").build();
    await game.p2.endTurn();
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.tapRune("r1");
    await game.p2.cast("gust", { targets: "aco1" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["shen", "gust"]);
    await game.settle();
    expect(game.zoneOf("aco1")).toBe("hand");
    expect(game.p1.points()).toBe(2);
  });

  test("471.1.a.1: Shen's point is not a Conquer point, so it may be the FINAL point — at 6/8, hold → 7, Shen → 8 wins the game", async () => {
    const game = await holding(1).victoryScore(8).points(P1, 6).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("conquering with exactly one companion is not holding: Shen + acolyte walk into an empty enemy battlefield → just the conquer point", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "shen").unit(P1, "base", { might: 2 }, "aco").build();
    await game.p1.move(["shen", "aco"], "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("parsed abilities: Shield 1 keyword + a self hold trigger scoring 1, conditioned on exactly one other friendly unit here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 6, isChampion: true, might: 7, powerCost: ["order", "order"], tags: ["Shen"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Shield", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { target: { controller: "friendly", excludeSelf: true, location: "here", quantity: { exactly: 1 }, type: "unit" }, type: "exists-here" },
      effect: { amount: 1, type: "score" },
      trigger: { event: "hold", on: "self" },
      type: "triggered",
    });
  });
});
