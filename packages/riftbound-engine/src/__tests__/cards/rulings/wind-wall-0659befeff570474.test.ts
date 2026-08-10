/**
 * Ruling 0659befeff570474 — Wind Wall (OGN-064 → ogn-064-298) · Calm Reaction spell · [3][calm][calm]
 *   "Counter a spell."
 *   × Time Warp (OGN-122 → ogn-122-298) · Mind spell · [10][mind]×4 — "Take a turn after this one. Banish this."
 *   (+ Ravenbloom Student ogn-103-298 "When you play a spell, give me +1 [Might] this turn" as the
 *    'was it played?' witness.)
 *
 * Q: Does Wind Wall counter Time Warp?
 * A: Yes. Time Warp is a spell on the chain, so it is a legal Wind Wall target. Wind Wall resolves first
 *    (LIFO); the countered Time Warp does nothing, is cleared from the chain to the trash (not banished),
 *    is not considered played for play-triggers, and no extra turn is taken.
 * Rules: 425.1.a, 425.1.a.1, 425.1.b, 340.1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIND_WALL = "ogn-064-298";
const TIME_WARP = "ogn-122-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** P1's turn. P1: Time Warp + exactly [10] + 4 mind, Ravenbloom Student (2) in base. P2: Wind Wall + exactly [3] + 2 calm. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, TIME_WARP, "warp")
    .hand(P2, WIND_WALL, "windwall");
}

describe("Ruling 0659befeff570474 — Wind Wall counters Time Warp", () => {
  test("control: unanswered, Time Warp resolves — it is BANISHED and P1 takes another turn after this one (Student +1 for the played spell)", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("warp")).toBe("banishment");
    expect(game.state("student").might).toBe(3);
    expect(game.turnPlayer()).toBe(P1);
    const turn = game.turnNumber();
    await game.advanceTurn();
    // The extra turn: still P1.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(turn + 1);
  });

  test("Time Warp on the chain is a legal target for Wind Wall; Wind Wall goes on top", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "windwall")).toBe(true);
    const field = game.p2.option("cast", "windwall")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["warp"]]);
    await game.p2.cast("windwall", { targets: "warp" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["warp", "windwall"]);
  });

  test("ruling: Wind Wall resolves first and counters Time Warp — Warp goes to the TRASH (not banished), Student gets nothing, and NO extra turn is taken", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    await game.p1.passPriority();
    await game.p2.cast("windwall", { targets: "warp" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("windwall")).toBe("trash");
    // 425.1.a.1: a countered card is placed in the trash — its own "Banish this." never executed.
    expect(game.zoneOf("warp")).toBe("trash");
    expect(game.p1.banishment()).not.toContain("warp");
    // 425.1.b: not "played" for Ravenbloom Student's trigger.
    expect(game.state("student").might).toBe(2);
    // The energy is still spent.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // No extra turn: ending P1's turn hands the turn to P2.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
