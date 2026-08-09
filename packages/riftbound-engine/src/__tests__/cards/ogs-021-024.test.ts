/**
 * Lady of Luminosity - Starter — ogs-021-024 · Legend (Lux) · Mind/Order
 *
 *   When you play a spell that costs [5] or more, draw 1.
 *
 * Rules: 419.4.a (abilities that trigger on playing a card trigger when the play is COMPLETED by the
 * card's resolution), 419.4.a.1 (a countered spell never resolved → no trigger), 206 ("costs [N]"
 * always reads the PRINTED energy cost, even if reduced/increased/ignored — the rule's own example is
 * Lux + Sky Splitter), 135 ([5] is an Energy symbol: Power pips are not part of "[5] or more"),
 * 190.6 ("you" = the legend's controller), 383 (the draw is a triggered ability → its own chain item).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Boundary: exactly [5] draws; [4] does not — even a [4]+[order][order] spell whose total outlay
 *     is "6 resources" does not, because only Energy is counted.
 *  2. Sky Splitter ([8], reduced by your highest Might) paid for 4 still "costs [8]" → draws (206).
 *  3. Countered (Wind Wall) → the spell never resolves → no draw (419.4.a.1).
 *  4. Timing: nothing is drawn while the spell is still on the chain; the draw follows resolution.
 *  5. "You": the opponent's expensive spell gives P1 nothing, and P1's spell gives an opposing Lux
 *     legend nothing.
 *  6. No once-per-turn cap: two big spells in one turn draw two cards.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogs-021-024";
const FALLING_COMET = "ogn-085-298"; // [Action] 5: deal 6 to a unit at a battlefield
const FINAL_SPARK = "ogs-022-024"; // [Action] 8: deal 8 to a unit
const VENGEANCE = "ogn-229-298"; // 4 + [order][order]: kill a unit
const SKY_SPLITTER = "ogn-014-298"; // [Action] 8 + [fury], reduced by your highest Might: deal 5 to a unit at a bf
const WIND_WALL = "ogn-064-298"; // [Reaction] 3 + [calm][calm]: counter a spell
const PROGRESS_DAY = "ogn-114-298"; // 6 + [mind]: draw 4

function board() {
  return scenario()
    .resources(P1, { energy: 13, power: { order: 2, fury: 1, mind: 1 } })
    .legend(P1, CARD, "lux")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P2, "bf1", { might: 2, name: "Imp" }, "imp");
}

describe("Lady of Luminosity - Starter (ogs-021-024)", () => {
  test("registry payload: one triggered ability — on controller's play-spell with min-cost 5 → draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Lux", name: "Lady of Luminosity - Starter" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, type: "draw" },
        trigger: { event: "play-spell", on: "controller", restrictions: [{ count: 5, type: "min-cost" }] },
        type: "triggered",
      },
    ]);
  });

  test("a [5] spell (Falling Comet) draws 1 once it has resolved; nothing is drawn while it is still on the chain (419.4.a)", async () => {
    const game = await board().hand(P1, FALLING_COMET, "comet").build();
    const deckTop = game.p1.deck()[0];
    await game.p1.cast("comet", { targets: "wall" });
    expect(game.p1.energy()).toBe(8);
    expect(game.zoneOf("comet")).toBe("chain");
    expect(game.p1.hand()).toEqual([]); // not yet
    await game.p1.passPriority();
    await game.p2.passPriority(); // the spell resolves …
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.state("wall").damage).toBe(6);
    // … and only now does the legend's trigger sit on the chain as its own item (383), draw still pending.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lux", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toEqual([deckTop as string]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("boundary below: a [4] spell does NOT draw — Vengeance costs [4]+[order][order] and Power pips are not Energy", async () => {
    const game = await board().hand(P1, VENGEANCE, "veng").build();
    await game.p1.cast("veng", { targets: "imp" });
    await game.settle();
    expect(game.zoneOf("imp")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });

  test("well above: an [8] spell (Final Spark) draws exactly 1 (not one per energy)", async () => {
    const game = await board().hand(P1, FINAL_SPARK, "spark").build();
    await game.p1.cast("spark", { targets: "wall" });
    await game.settle();
    expect(game.state("wall").damage).toBe(8);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("printed cost governs (206): Sky Splitter [8] reduced to 4 by a 4-Might ally is paid for 4 yet still draws", async () => {
    const game = await board()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .unit(P1, "base", { might: 4, name: "Big Friend" }, "big")
      .hand(P1, SKY_SPLITTER, "sky")
      .build();
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "wall" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.state("wall").damage).toBe(5);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("countered spell (Wind Wall) never resolves → no draw (419.4.a.1)", async () => {
    const game = await board()
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .hand(P1, FALLING_COMET, "comet")
      .hand(P2, WIND_WALL, "ww")
      .build();
    await game.p1.cast("comet", { targets: "wall" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("ww", { targets: "comet" });
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.p1.hand()).toEqual([]);
  });

  test("'you': the opponent playing a [5] spell draws nothing for the Lux player (nor for themselves)", async () => {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 5 })
      .unit(P1, "bf1", { might: 9, name: "MyWall" }, "mywall")
      .hand(P2, FALLING_COMET, "comet")
      .build();
    await game.p2.cast("comet", { targets: "mywall" });
    await game.settle();
    expect(game.state("mywall").damage).toBe(6);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("'you' (mirror): P1's big spell does not feed an opposing Lux legend", async () => {
    const game = await board().legend(P2, CARD, "theirLux").hand(P1, FALLING_COMET, "comet").build();
    await game.p1.cast("comet", { targets: "wall" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toEqual([]);
  });

  test("no once-per-turn limit: two qualifying spells in the same turn draw two cards in total", async () => {
    const game = await board().hand(P1, FALLING_COMET, "comet").hand(P1, FINAL_SPARK, "spark").build();
    await game.p1.cast("comet", { targets: "wall" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2); // spark + 1 drawn
    await game.p1.cast("spark", { targets: "wall" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 6 + 8 ≥ 9
    expect(game.p1.hand()).toHaveLength(2); // both spells gone, two cards drawn
    expect(game.p1.hand()).not.toContain("spark");
  });

  test("the trigger's draw stacks with the spell's own draws: Progress Day ([6]: draw 4) nets 5 cards", async () => {
    const game = await board().hand(P1, PROGRESS_DAY, "pd").build();
    await game.p1.cast("pd");
    await game.settle();
    expect(game.zoneOf("pd")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(5);
  });
});
