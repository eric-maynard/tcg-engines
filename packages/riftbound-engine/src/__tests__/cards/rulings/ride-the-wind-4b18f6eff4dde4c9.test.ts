/**
 * Ruling 4b18f6eff4dde4c9 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: I hold one battlefield and Ride the Wind onto the other — do I win, or only if I hold?
 * A: On YOUR turn you win, and you do NOT need to hold both at once: the Final (winning) point taken by a
 *    Conquer requires only that you have scored at EVERY battlefield during that turn, so conquering the first
 *    and then riding onto the second gets there. If the second battlefield is the only one you scored this
 *    turn, the Final point is withheld and you draw a card for the conquer instead, staying at 7.
 * Rules: 471.1.b / 471.1.b.1 (Final Point restriction: a Conquer at VS−1 draws a card unless every
 *        battlefield was scored this turn), 469.1 (Conquer), 348.2.a (a non-combat showdown closes into
 *        Establish Control), 465/471.2 (each battlefield scores once per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** Turn 3, P1 active, Victory Score 8, both battlefields empty and uncontrolled; P1 has two units and Ride the Wind. */
async function board(points: number): Promise<Game> {
  return await scenario()
    .turn(3)
    .victoryScore(8)
    .points(P1, points)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", unit(3, "Walker"), "walker")
    .unit(P1, "base", unit(3, "Rider"), "rider")
    .unit(P2, "base", unit(1, "Bystander"), "bystander")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .build();
}

/** Pass Focus (both seats if asked) until no showdown decision is open. */
async function closeAnyShowdown(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      return;
    }
    await game.seat(d.seat).passFocus();
  }
}

/** Ride the Rider onto bf2 and close the non-combat showdown there. */
async function rideOntoBf2(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "rider" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bf2");
  await game.settle();
  expect(game.locationOf("rider")).toBe("bf2");
  expect(game.state("rider").isReady).toBe(true); // "and ready it"
  await closeAnyShowdown(game); // closing the showdown is what establishes control
}

describe("Ruling 4b18f6eff4dde4c9 — the Final point by Conquer needs every battlefield scored THIS turn", () => {
  test("6 → 7 → 8 on your own turn: conquer bf1 by walking in, then Ride the Wind onto bf2 and win", async () => {
    const game = await board(6);

    await game.p1.move("walker", "bf1");
    await closeAnyShowdown(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(7);

    await rideOntoBf2(game);

    // Both battlefields were scored this turn, so the 8th point is allowed — and P1 never held both at once
    // (the Walker is still the only unit at bf1, the Rider the only one at bf2).
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("at 7 with only bf2 scored this turn: the conquer happens but the Final point is withheld — draw 1 instead", async () => {
    const game = await board(7);
    const deck0 = game.p1.deck().length;
    const hand0 = game.p1.hand().length;

    await rideOntoBf2(game);

    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // Ride the Wind left, the conquer's card arrived
    expect(game.violations()).toEqual([]);
  });
});
