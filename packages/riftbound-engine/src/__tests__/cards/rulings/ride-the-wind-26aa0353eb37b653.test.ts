/**
 * Ruling 26aa0353eb37b653 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: I am at 7 points, my opponent at 6 (Victory Score 8). They conquer the open battlefield B (→ 7), then
 *    move into battlefield A which I hold with a big unit. If I Ride the Wind that unit from A over to B
 *    before I lose the fight, does my B showdown resolve first — or do I lose?
 * A: You lose. Leaving A empties it, the showdown there goes to cleanup and my opponent conquers A for their
 *    8th point — the game ends before the showdown my Ride the Wind staged at B ever begins. They never had
 *    to control both battlefields at once, only to score both in the same turn.
 * Rules: 348.2.a (a showdown with only one player's units left establishes control ⇒ Conquer), 465/471
 *        (scoring on conquer, once per battlefield per turn), 480 (a player reaching the Victory Score wins
 *        immediately), 461.2 (a staged showdown that never starts is never resolved).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn, Victory Score 8: P1 at 7, P2 at 6. P1 holds bfA with a 9-Might Colossus and exactly [2][chaos]
 * plus Ride the Wind. bfB is open. P2 has a Scout (for bfB) and a Raider (to attack bfA).
 */
function board() {
  return scenario()
    .turn(4)
    .active(P2)
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 6)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", { might: 9, name: "Colossus" }, "colossus")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 walks the Scout onto the open bfB and conquers it. */
async function conquerB(game: Game): Promise<void> {
  await game.p2.move("scout", "bfB");
  await game.settle();
  expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
  expect(game.p2.points()).toBe(7);
}

describe("Ruling 26aa0353eb37b653 — riding away from a contested battlefield hands the opponent the conquer, and the game, first", () => {
  test("step 1: P2 conquers the open bfB and reaches 7 — one short of the win, and P1 is still at 7", async () => {
    const game = await board().build();
    await conquerB(game);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("step 2+3: P2 attacks bfA; P1 Rides the Colossus away to bfB — bfA is left empty, P2 conquers it for the 8th point and WINS before the bfB showdown starts", async () => {
    const game = await board().build();
    await conquerB(game);
    await game.p2.move("raider", "bfA");
    expect(game.state("colossus").combatRole).toBe("defender");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("rtw", { targets: "colossus" });
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("battlefield-bfB");
    }
    await game.settle();
    // bfA closed with only P2's Raider there ⇒ Conquer ⇒ P2's 8th point ⇒ game over.
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p1.points()).toBe(7); // the Colossus's own showdown at bfB never scored anything
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
  });

  test("contrast: standing and fighting at bfA instead wins the fight (9 vs 2) and keeps P2 at 7", async () => {
    const game = await board().build();
    await conquerB(game);
    await game.p2.move("raider", "bfA");
    await game.settle(); // no Ride the Wind: the Colossus simply defends
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
