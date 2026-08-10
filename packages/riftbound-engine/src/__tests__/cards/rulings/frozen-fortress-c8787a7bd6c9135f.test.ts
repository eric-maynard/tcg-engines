/**
 * Ruling c8787a7bd6c9135f — Frozen Fortress (UNL-212 → unl-212-219) · Battlefield
 *   "At the start of each player's Beginning Phase, deal 1 to each unit here."
 *   × Imperial Decree (OGN-221 → ogn-221-298) · Action spell · [5][order][order]
 *   "When any unit takes damage this turn, kill it."
 *
 * Q: Units at Frozen Fortress already carry its 1 damage; I then play Imperial Decree — do they die?
 * A: No. Imperial Decree sets up a trigger on the EVENT of taking damage after it resolves; it does not look
 *    back at damage already marked. If those units take further damage later this turn, they die then.
 * Rules: 383 (trigger conditions are events, not states), delayed/turn-scoped triggered effects.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FROZEN_FORTRESS = "unl-212-219";
const IMPERIAL_DECREE = "ogn-221-298";
/** 1-damage Action spell to produce a fresh damage event after the Decree. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/**
 * End of P2's turn. bf1 IS Frozen Fortress (live abilities), held by P1 with two sturdy units (4 and 5 Might);
 * a third P1 unit sits in base (not "here"). P1 holds Imperial Decree + Spark.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1, def: FROZEN_FORTRESS, inert: false })
    .unit(P1, "bf1", { might: 4, name: "Guard A" }, "a")
    .unit(P1, "bf1", { might: 5, name: "Guard B" }, "b")
    .unit(P1, "base", { might: 3, name: "Home C" }, "c")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, SPARK, "spark");
}

/** P2 ends turn → P1's Beginning Phase: Frozen Fortress pings each unit at bf1; then P1 gets Decree + Spark money. */
async function intoP1TurnWithFortressDamage(): Promise<Game> {
  const game = await board().build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.state("a").damage).toBe(1);
  expect(game.state("b").damage).toBe(1);
  expect(game.state("c").damage).toBe(0); // not "here"
  await game.p1.do("addResources", { energy: 6, power: { order: 2 } }); // [5][order][order] + Spark's [1]
  return game;
}

describe("Ruling c8787a7bd6c9135f — Imperial Decree does not kill units for damage marked before it resolved", () => {
  test("Frozen Fortress deals 1 to each unit there at the start of P1's Beginning Phase and the damage persists into the main phase", async () => {
    const game = await intoP1TurnWithFortressDamage();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
  });

  test("playing Imperial Decree afterwards kills nobody: the already-damaged Guards stay on bf1 with their 1 damage", async () => {
    const game = await intoP1TurnWithFortressDamage();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.zoneOf("c")).toBe("base");
  });

  test("…but a NEW damage event while the Decree is active does kill: Spark (1) on Guard B (5 Might, 1 damage) → B dies; untouched Guard A survives", async () => {
    const game = await intoP1TurnWithFortressDamage();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.cast("spark", { targets: "b" });
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash"); // 2 damage on a 5-Might unit is not lethal — the Decree killed it
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.state("a").damage).toBe(1);
    expect(game.chain()).toEqual([]);
  });
});
