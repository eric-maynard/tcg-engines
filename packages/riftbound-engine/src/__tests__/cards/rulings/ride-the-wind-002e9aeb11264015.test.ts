/**
 * Ruling 002e9aeb11264015 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos] · "Move a friendly unit and ready it."
 *
 * Q: I conquered both battlefields on my turn and sit at 7 points. On my opponent's turn, can I Ride the Wind onto a battlefield,
 *    conquer it and win?
 * A: No. The 8th (Final) point via CONQUER requires having scored every battlefield this turn; on the opponent's turn you cannot
 *    have done that, so the conquer gives you a card draw instead of the point. You stay at 7.
 * Rules: 471.1.b / 471.1.b.1 (Final Point restriction: conquer at VS−1 → draw unless every battlefield was scored this turn),
 *        465/471.2 (score each battlefield once per turn), 347 (Action spell with Focus in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * Turn 3, P2's turn, Victory Score 8. P1 has `p1Points`, holds bf1 with a Holder, a 5-Might Striker in base, Ride the Wind and
 * exactly [2][chaos]. bf2 is open. P2 has a 1-Might Scout in base.
 */
function board(p1Points: number) {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .points(P1, p1Points)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2's Scout walks onto open bf2 (non-combat showdown); P2 passes Focus; P1 Ride-the-Winds the Striker to bf2; fight it out. */
async function rideInAndFight(game: Game): Promise<void> {
  await game.p2.move("scout", "bf2");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2", focusPlayer: P2 });
  expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "striker" });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf2" || o.key === "bf2")?.key ?? "battlefield-bf2");
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.state("striker")).toMatchObject({ isReady: true, location: "bf2" });
  await game.settle(); // focus passes, combat: Striker 5 vs Scout 1
  expect(game.zoneOf("scout")).toBe("trash");
  expect(game.locationOf("striker")).toBe("bf2");
}

describe("Ruling 002e9aeb11264015 — Ride the Wind conquer on the opponent's turn at 7 points draws a card instead of winning", () => {
  test("at 7/8: the Striker wins the battlefield and P1 takes control of bf2 (a Conquer) — but gains NO point; P1 draws 1 instead and the game goes on", async () => {
    const game = await board(7).build();
    const hand0 = game.p1.hand().length; // includes Ride the Wind
    const deck0 = game.p1.deck().length;
    await rideInAndFight(game);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // cast rtw, drew 1 for the conquer
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control at 6/8: the very same off-turn conquer DOES score normally (6 → 7, no draw) — only the Final Point is restricted", async () => {
    const game = await board(6).build();
    const hand0 = game.p1.hand().length;
    await rideInAndFight(game);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // no draw
    expect(game.isOver()).toBe(false);
  });
});
