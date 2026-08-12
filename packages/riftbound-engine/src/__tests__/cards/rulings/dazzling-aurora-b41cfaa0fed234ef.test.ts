/**
 * Ruling b41cfaa0fed234ef — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and
 *    banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: Do you have to pay each turn to use a gear's effect, and does unit health/damage reset each turn?
 * A: You pay a gear's cost ONCE, when you play it; afterwards its ability works every turn for free. Units
 *    have Might and damage, not health: damage never lowers Might (a 9-Might unit with 4 damage still hits
 *    for 9), a unit is destroyed when damage reaches its Might, and damage is cleared at the end of combat
 *    and again at the end of the turn.
 * Rules: 357 (a play's costs are paid once, at play), 141 (Might), 320.3.c/465.2.d (lethal = damage ≥ Might),
 *        317.2 Expiration Step 3c (all damage healed at end of turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const SKULKER = "ogn-175-298"; // 3-Might vanilla unit
const VOID_SEEKER = "ogn-024-298"; // "Deal 4 to a unit at a battlefield."

describe("Ruling b41cfaa0fed234ef — a gear is paid for once; damage is not health", () => {
  test("ruling: Dazzling Aurora's cost is paid at play, and the end-of-turn ability then runs with an EMPTY pool — this turn and the next", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { body: 2 } })
      .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER], ["u1", "u2", "u3", "u4"])
      .hand(P1, DAZZLING_AURORA, "aurora")
      .build();

    await game.p1.playGear("aurora");
    await game.settle();
    expect(game.zoneOf("aurora")).toBe("base");
    expect(game.p1.energy()).toBe(0); // paid once, in full
    expect(game.p1.power("body")).toBe(0);

    // End of P1's turn: the ability fires with nothing left to pay.
    await game.advanceTurn();
    const firstArrival = game.p1.units("base").length;
    expect(firstArrival).toBeGreaterThan(0);
    expect(game.zoneOf("aurora")).toBe("base"); // the gear is still there

    // P2's turn passes; at the end of P1's NEXT turn it fires again — still free.
    await game.advanceToTurnOf(P1);
    await game.advanceTurn();
    expect(game.p1.units("base").length).toBeGreaterThan(firstArrival);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: damage does not reduce Might — a 9-Might unit with 4 damage is still a 9-Might unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 9, name: "Colossus" }, "colossus")
      .hand(P1, VOID_SEEKER, "vs")
      .build();
    await game.p1.cast("vs", { targets: "colossus" });
    await game.settle();
    expect(game.state("colossus").damage).toBe(4);
    expect(game.state("colossus").might).toBe(9);
    expect(game.state("colossus").baseMight).toBe(9);
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
  });

  test("nuance: the damaged 9-Might unit still DEALS 9 — it kills a fresh 9-Might defender in combat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", { might: 9, name: "Colossus" }, "colossus")
      .hand(P1, VOID_SEEKER, "vs")
      .build();
    await game.p1.cast("vs", { targets: "wall" }); // put damage on the WALL, not the attacker
    await game.settle();
    expect(game.state("wall").damage).toBe(4);
    expect(game.state("wall").might).toBe(9);

    await game.p1.move("colossus", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 4 + 9 ≥ 9
    expect(game.locationOf("colossus")).toBe("bf1");
  });

  test("nuance: a unit is destroyed the moment damage reaches its Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Chump" }, "chump")
      .hand(P1, VOID_SEEKER, "vs")
      .build();
    await game.p1.cast("vs", { targets: "chump" });
    await game.settle();
    expect(game.zoneOf("chump")).toBe("trash");
  });

  test("nuance: damage is cleared at the end of the turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 9, name: "Colossus" }, "colossus")
      .hand(P1, VOID_SEEKER, "vs")
      .build();
    await game.p1.cast("vs", { targets: "colossus" });
    await game.settle();
    expect(game.state("colossus").damage).toBe(4);
    await game.advanceTurn();
    expect(game.state("colossus").damage).toBe(0);
    expect(game.state("colossus").might).toBe(9);
  });
});
