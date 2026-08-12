/**
 * Ruling b9866c004ebcf25f — Time Warp (OGN-122 → ogn-122-298) · Spell · [10][mind]×4
 *   "Take a turn after this one. Banish this."
 *   × Pakaa Cub (OGN-135 → ogn-135-298) · Unit · [3] · "[Hidden] (Hide now for [rainbow] to react with later for [0].)"
 *
 * Q: If I hide a card on the turn I cast Time Warp, can I play it from face down during the extra turn?
 * A: Yes. [Hidden] only forbids playing a card face down and revealing it in the SAME turn; the extra turn is a new
 *    turn even though the same player takes it, so the card becomes playable there.
 * Rules: 811.1.d ([Hidden] cards cannot be played on the turn they were hidden), 311/312 (extra turns are turns).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";
const PAKAA_CUB = "ogn-135-298";

/** P1's turn with a very full pool: [rainbow] for the hide, then [10][mind][mind][mind][mind] for Time Warp. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, PAKAA_CUB, "cub")
    .hand(P1, TIME_WARP, "tw")
    .resources(P1, { energy: 10, power: { mind: 4, rainbow: 1 } });
}

describe("Ruling b9866c004ebcf25f — Time Warp's extra turn is a new turn for [Hidden] timing", () => {
  test("a card hidden this turn cannot be revealed this turn", async () => {
    const game = await board().build();
    await game.p1.hide("cub", "bf1");
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "cub")).toBe(false);
    const attempt = await game.p1.try((p) => p.reveal("cub"));
    expect(attempt.ok).toBe(false);
  });

  test("Time Warp resolves, banishes itself, and P1 keeps the turn seat after ending this one", async () => {
    const game = await board().build();
    await game.p1.hide("cub", "bf1");
    const turnBefore = game.turnNumber();
    await game.p1.cast("tw");
    await game.settle();
    expect(game.zoneOf("tw")).toBe("banishment");
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnNumber()).toBe(turnBefore + 1);
    expect(game.turnPlayer()).toBe(P1); // the extra turn, not the opponent's
  });

  test("…and on that extra turn the hidden card is playable", async () => {
    const game = await board().build();
    await game.p1.hide("cub", "bf1");
    await game.p1.cast("tw");
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(game.p1.can("reveal", "cub")).toBe(true);
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
