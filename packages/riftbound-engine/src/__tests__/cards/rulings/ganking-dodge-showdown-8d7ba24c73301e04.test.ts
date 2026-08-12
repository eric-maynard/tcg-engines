/**
 * Ruling 8d7ba24c73301e04 — (no specific card) can [Ganking] dodge an incoming showdown?
 *   Exercised with Miss Fortune, Captain (OGN-162 → ogn-162-298), who has [Ganking].
 *
 * Q: Can a unit with [Ganking] move away before a showdown happens, to avoid it?
 * A: No. Moving a unit is a turn-player action taken in an Open State with nothing resolving.
 *    [Ganking] only widens WHERE a unit may move from (battlefield to battlefield); it grants no
 *    permission to move on the opponent's turn or in the middle of their showdown.
 * Rules: 155 / 323 (turn-player actions happen in an Open State on your own turn),
 *        808 ([Ganking] = "I can move from battlefield to battlefield" — a location permission),
 *        344.2 (the arrival stages the showdown; nothing intervenes between).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MISS_FORTUNE_CAPTAIN = "ogn-162-298"; // 5 Might, [Ganking]

/** P2's turn. P1's Miss Fortune sits at bf1; bf2 is open. P2 has a Raider ready to walk into bf1. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2")
    .unit(P1, "bf1", MISS_FORTUNE_CAPTAIN, "mf")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider");
}

describe("Ruling 8d7ba24c73301e04 — [Ganking] does not let you move away from an incoming attack", () => {
  test("premise: Miss Fortune really does have [Ganking], and on P1's OWN turn she may hop bf1 → bf2 with it", async () => {
    const game = await board().build();
    expect(game.state("mf").keywords).toContain("Ganking");
    await game.advanceTurn(); // P2 ends, P1's turn
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.gank("mf", "bf2");
    await game.settle();
    expect(game.locationOf("mf")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("on P2's turn, before anything happens, P1 simply cannot move her — it is not P1's turn", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("move", "mf")).toBe(false);
    expect((await game.p1.try((p) => p.gank("mf", "bf2"))).ok).toBe(false);
    expect(game.locationOf("mf")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("once P2's raider arrives the showdown is already staged: P1 still cannot gank out of it", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("mf").combatRole).toBe("defender");
    expect((await game.p1.try((p) => p.gank("mf", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("mf", "base"))).ok).toBe(false);
    expect(game.locationOf("mf")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("mf")).toBe("trash"); // 6 ≥ 5 — she had to stand and fight
    expect(game.violations()).toEqual([]);
  });
});
