/**
 * Shen, Scourge of Shadows — ven-042a-166 · Champion Unit · Calm · 5 energy + [calm] · 6 Might · Shen
 *
 *   When I hold, if there is exactly one other unit you control here, draw 1.
 *
 * Head-judge checklist for this card:
 *   1. rule 469.2 / 383.4.d — "hold" = keeping control of Shen's battlefield through YOUR Beginning
 *      Phase; conquering is not holding, and the opponent's Beginning Phase never counts.
 *   2. rule 383.2.a.1 — "if there is exactly one other unit you control here" directly follows the
 *      trigger, so it is part of the CONDITION: with 0 or 2 others nothing is even put on the chain;
 *      once triggered, killing the partner in response does not stop the draw.
 *   3. "here" is Shen's battlefield only: partners in base or at another held battlefield don't count;
 *      "other" excludes Shen; "you control" is control, not ownership (a stolen unit counts); a
 *      facedown card here is not a unit.
 *   4. Shen must himself be at the held battlefield — Shen in base while a battlefield with exactly one
 *      unit is held draws nothing.
 *   5. Hand arithmetic across a turn start: hold point first, trigger draw (+1), then Draw Phase (+1).
 *   6. Cost: 5 energy + 1 calm.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-042a-166";
const FLURRY_OF_BLADES = "ogn-133-298"; // [Reaction] 1 energy: deal 1 to all units at battlefields
const TORNADO_WARRIOR = "ven-099-166"; // a [Hidden] unit to place facedown

/** P2 is about to end turn 2; P1 controls bf1 with Shen plus `partners` vanilla 1-Might units there. */
function heldWith(partners: number) {
  const b = scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "shen");
  for (let i = 0; i < partners; i++) {
    b.unit(P1, "bf1", { might: 1, name: `Acolyte ${i}` }, `pal${i}`);
  }
  return b;
}

describe("Shen, Scourge of Shadows (ven-042a-166)", () => {
  test("registry payload: hold trigger on self, condition 'exactly 1 other friendly unit here', effect draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 5, isChampion: true, might: 6, powerCost: ["calm"], tags: ["Shen"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: {
        target: { controller: "friendly", excludeSelf: true, location: "here", quantity: { exactly: 1 }, type: "unit" },
        type: "exists-here",
      },
      effect: { amount: 1, type: "draw" },
      trigger: { event: "hold", on: "self" },
      type: "triggered",
    });
  });

  test("cost: 5 energy + 1 calm deducted for a 6-Might champion; unaffordable at 4 energy or without calm", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "shen").build();
    await game.p1.play("shen");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("base");
    expect(game.state("shen").might).toBe(6);
    expect((await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
  });

  test("holding with EXACTLY one other friendly unit here: trigger on the chain in the Beginning Phase, then draw 1 (0 → 2 with the Draw Phase)", async () => {
    const game = await heldWith(1).build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the hold point itself
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shen", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.points()).toBe(1); // Shen draws, he does not score
  });

  test("alone (zero other units here): the hold still scores but nothing goes on the chain and only the Draw Phase card is drawn", async () => {
    const game = await heldWith(0).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'exactly one': two other friendly units here is too many — no trigger, no extra card", async () => {
    const game = await heldWith(2).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'here': a partner in the base or at ANOTHER held battlefield does not count (both battlefields still score)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "shen")
      .unit(P1, "base", { might: 1 }, "homebody")
      .unit(P1, "bf2", { might: 1 }, "elsewhere")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'here' cuts both ways: exactly one partner at Shen's battlefield draws even though another held battlefield is crowded", async () => {
    const game = await heldWith(1)
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 1 }, "x1")
      .unit(P1, "bf2", { might: 1 }, "x2")
      .unit(P1, "bf2", { might: 1 }, "x3")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("'When I hold': Shen in the base while a battlefield with exactly one friendly unit is held draws nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "shen")
      .unit(P1, "bf1", { might: 1 }, "holder")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("only YOUR hold: the opponent's Beginning Phase with my Shen + one partner parked at my battlefield does nothing", async () => {
    const game = await heldWith(1).turn(3).active(P1).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
  });

  test("conquering is not holding: Shen + one partner moving onto an empty enemy battlefield scores 1 but draws nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "shen")
      .unit(P1, "base", { might: 1 }, "pal")
      .build();
    await game.p1.move(["shen", "pal"], "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  // rule 108.2 — "you control" reads control: the stolen unit is the one other unit P1 controls here.
  test("'unit you control here' reads control, not ownership — a stolen partner satisfies Shen's condition (rule 108.2)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "shen")
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Turncoat" }, owner: P2, zone: "bf1" })
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P1, owner: P2 });
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shen", triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("a facedown card at Shen's battlefield is not a unit: Shen + facedown only = alone → no draw", async () => {
    const game = await heldWith(0).facedown(P1, "bf1", TORNADO_WARRIOR, "hiddenCard").build();
    expect(game.zoneOf("hiddenCard")).toBe("facedown-bf1");
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("rule 383.2.a.1: the partner dying IN RESPONSE to the hold trigger does not stop the draw (condition is not re-checked on resolution)", async () => {
    // P2's pool emptied at the end of their own turn (317.2.d), so they float a ready rune to tap in response.
    const game = await heldWith(1).rune(P2, "body", { alias: "bodyRune" }).hand(P2, FLURRY_OF_BLADES, "flurry").build();
    await game.p2.endTurn();
    expect(game.chain().map((c) => c.cardId)).toEqual(["shen"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.tapRune("bodyRune");
    await game.p2.cast("flurry");
    expect(game.chain().map((c) => c.cardId)).toEqual(["shen", "flurry"]);
    await game.settle();
    expect(game.zoneOf("pal0")).toBe("trash"); // the 1-Might acolyte died to Flurry
    expect(game.state("shen").damage).toBe(1);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2); // trigger draw + Draw Phase
    expect(game.violations()).toEqual([]);
  });
});
