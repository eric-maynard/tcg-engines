/**
 * Ruling b6574d3008f9fe00 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: I'm at 7 points. During my opponent's attack I Ride the Wind onto an EMPTY battlefield — do I win at once?
 * A: No. The move stages a second showdown; the combat already running resolves first, and only afterwards does
 *    the new showdown at the empty battlefield close. You conquer it, but the Final Point by conquest needs every
 *    battlefield scored that turn, which cannot be true on the opponent's turn — so you draw 1 instead and stay
 *    at 7.
 * Rules: 348.2 / 465 (a second showdown is staged and runs after the current one), 471.1.b.1 (conquering at
 *        VS−1 without having scored every battlefield this turn draws a card instead of the point).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * Turn 3, P2's turn, Victory Score 8, P1 on 7 points. P1 holds bf1 with a Defender (4); bf2 is open. P2's
 * Raider (2) attacks bf1. P1 holds Ride the Wind with exactly [2][chaos] and a Striker (5) waiting in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .points(P1, 7)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 4, name: "Defender" }, "defender")
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 attacks bf1 and passes Focus; P1 (now with Focus) rides the Striker onto the empty bf2. */
async function attackThenRide(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { answers: ["bf2"], targets: "striker" });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

/** Pass focus/priority for whoever is asked until the position is open again. */
async function passUntilOpen(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling b6574d3008f9fe00 — riding onto an empty battlefield at 7 points during the opponent's attack does not win the game", () => {
  test("intermediate fact: the ride stages a SECOND showdown at bf2 while the bf1 combat is still open — nothing has scored yet", async () => {
    const game = await board().build();
    await attackThenRide(game);
    expect(game.locationOf("striker")).toBe("bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("the current combat at bf1 resolves FIRST (the Raider dies to the 4-Might Defender), and only then does bf2 close", async () => {
    const game = await board().build();
    await attackThenRide(game);
    await passUntilOpen(game);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
  });

  test("ruling: P1 CONQUERS bf2 but does not take the 8th point — a card is drawn instead and the game continues on P2's turn", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length; // includes Ride the Wind
    const deck0 = game.p1.deck().length;
    await attackThenRide(game);
    await passUntilOpen(game);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // cast Ride the Wind, drew the replacement card
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control at 6/8 the same conquest simply scores: 6 → 7 with no draw, still no win", async () => {
    const game = await board().points(P1, 6).build();
    const hand0 = game.p1.hand().length;
    await attackThenRide(game);
    await passUntilOpen(game);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // no replacement draw
    expect(game.isOver()).toBe(false);
  });
});
