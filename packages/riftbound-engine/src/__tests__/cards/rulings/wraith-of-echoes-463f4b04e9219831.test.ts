/**
 * Ruling 463f4b04e9219831 — Wraith of Echoes (OGN-118 → ogn-118-298) · Unit · Mind · 6 · 5 Might
 *   "The first time a friendly unit dies each turn, draw 1."
 *
 * Q: If Wraith of Echoes is itself the first friendly unit to die this turn, does its own ability draw a card?
 * A: No. The ability only works while Wraith is on the board; as it dies it is leaving for the trash, so it cannot
 *    "see" its own death (only Deathknell looks back like that). Even if other units die simultaneously with it, Wraith
 *    sees none of them.
 * Rules: 383.2.c.2 (a Game Object that leaves its trigger's zone at the same time the condition is met does not
 *        trigger — the Viktor example), 808 (Deathknell is the look-back exception), 465.2 (simultaneous deaths).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WRAITH = "ogn-118-298";
const BOLT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P1's turn. Wraith (5) + Fodder (1) ready in P1's base; P2 holds bf1 with an 8-Might Wall. No deaths yet this turn. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P1, "base", WRAITH, "wraith")
    .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder");
}

describe("Ruling 463f4b04e9219831 — Wraith of Echoes does not draw off its own death", () => {
  test("Wraith attacks the 8-Might Wall alone and dies — the first friendly death this turn — and P1 draws NOTHING", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.move("wraith", "bf1");
    await game.settle();
    expect(game.zoneOf("wraith")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("killed outside combat (P2's Bolt for 5 on P2's turn) as the first friendly death: still no draw", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: "wraith" });
    await game.settle();
    expect(game.zoneOf("wraith")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.chain()).toEqual([]);
  });

  test("Wraith and Fodder die SIMULTANEOUSLY (both attack the Wall; 8 damage covers 5 + 1): Wraith is leaving too, so it sees neither death — no draw", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.move(["wraith", "fodder"], "bf1");
    await game.settle();
    expect(game.zoneOf("wraith")).toBe("trash");
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("contrast — Fodder dies alone while Wraith stays on the board: that IS seen → P1 draws exactly 1", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("fodder", "bf1");
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("wraith")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
