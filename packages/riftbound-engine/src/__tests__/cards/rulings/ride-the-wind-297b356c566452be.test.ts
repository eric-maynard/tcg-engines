/**
 * Ruling 297b356c566452be — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: My opponent moves into an EMPTY battlefield and I answer with Ride the Wind, moving a unit in. Do I score
 *    the conquer even though I am the defender of that showdown?
 * A: Yes — a defender can conquer. The opponent applied the contested status, so they stay the attacker and I
 *    stay the defender for the whole thing; if my unit is the one left standing when the showdown/combat ends,
 *    I establish control, that is a Conquer and I score, on their turn.
 * Rules: 450/464.2.c (the player who applied the contested status is the Attacker), 348.2.a / 466.5
 *        (establishing control at the close of a showdown/combat = Conquer), 471.2 (score once per
 *        battlefield per turn, including on an opponent's turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn (turn 3). bf1 is open. P1: a 5-Might Striker in base, Ride the Wind and exactly [2][chaos]. P2: a 1-Might Scout. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .points(P1, 2)
    .points(P2, 2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 297b356c566452be — the defender of a showdown can conquer and score", () => {
  test("P2 walking onto the open bf1 makes P2 the attacker: they applied the contested status", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P2 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  });

  test("P1 answers with Ride the Wind: the Striker arrives as the DEFENDER (P2 keeps the attacker role) and wins the combat 5 vs 1", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("rtw", { targets: "striker" });
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.locationOf("striker")).toBe("bf1");
    expect(game.state("striker")).toMatchObject({ combatRole: null, damage: 0, isReady: true });
  });

  test("…and that win is a Conquer on the opponent's turn: P1 takes control of bf1 and scores a point (2 → 3)", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("rtw", { targets: "striker" });
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(2);
    expect(game.turnPlayer()).toBe(P2); // still their turn
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
