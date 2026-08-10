/**
 * Ruling 8bf4781afbfa21e7 — Targon's Peak (OGN-289 → ogn-289-298) · Battlefield
 *   "When you conquer here, ready up to 2 runes at the end of this turn."
 *
 * Q: I control the Peak at the start of my turn, lose control of it during my turn, then take it again the same turn —
 *    do I ready 2 runes at end of turn?
 * A: No. You already scored that battlefield this turn (the Hold); a battlefield can't be scored twice in a turn and
 *    conquering is a form of scoring, so re-taking it is not a Conquer and the Peak's ability doesn't trigger. (Losing
 *    control by just moving your units away counts the same as losing a showdown.)
 * Rules: 469.1 (Conquer = gaining control of a battlefield you did NOT yet score this turn), 469.2 (Hold), 323.6 (control
 *        lapses when you have no units there), 348.2.a.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TARGONS_PEAK = "ogn-289-298";

/**
 * End of P2's turn 2. The live Peak; P2 holds bf2 with a Wall. P1: Holder (2) — at the Peak (held case) or in base
 * (fresh-conquer case) —, a Climber (3) in base, and 3 runes.
 */
function board(peakHeldByP1: boolean) {
  const s = scenario()
    .turn(2)
    .active(P2)
    .battlefield("peak", { controller: peakHeldByP1 ? P1 : null, def: TARGONS_PEAK, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Climber" }, "climber")
    .runes(P1, "fury", 3);
  return peakHeldByP1 ? s.unit(P1, "peak", { might: 2, name: "Holder" }, "holder") : s.unit(P1, "base", { might: 2, name: "Holder" }, "holder");
}

/** Start P1's turn and tap every rune for energy so "readied at end of turn" is observable. */
async function p1TurnAllRunesTapped(game: Game): Promise<number> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  for (const r of game.p1.runes({ ready: true })) {
    await game.p1.tapRune(r);
  }
  expect(game.p1.runes({ ready: true })).toEqual([]);
  return game.p1.runes().length;
}

describe("Ruling 8bf4781afbfa21e7 — held at start of turn, lost, re-taken the same turn: not a Conquer, no runes readied", () => {
  test("P1 HOLDS the Peak in its Beginning Phase (1 point); walks the Holder home (control lapses — no showdown needed); the Climber re-takes the empty Peak: control is re-established but it is NOT scored again and the Peak's conquer trigger does NOT fire", async () => {
    const game = await board(true).build();
    await p1TurnAllRunesTapped(game);
    expect(game.p1.points()).toBe(1); // the Hold
    expect(game.gameState.battlefields.peak?.controller).toBe(P1);
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.gameState.battlefields.peak?.controller).toBeNull(); // lost by simply moving away
    await game.p1.move("climber", "peak");
    expect(game.chain()).toEqual([]); // no trigger as the showdown opens …
    await game.settle();
    expect(game.gameState.battlefields.peak?.controller).toBe(P1); // control regained
    expect(game.p1.points()).toBe(1); // … not scored a second time
    expect(game.chain()).toEqual([]); // … and no "Targon's Peak" item ever appeared
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("so at the end of that turn nothing asks P1 to ready runes and none become ready", async () => {
    const game = await board(true).build();
    const total = await p1TurnAllRunesTapped(game);
    await game.p1.move("holder", "base");
    await game.settle();
    await game.p1.move("climber", "peak");
    await game.settle();
    await game.p1.endTurn();
    expect(game.decision()?.kind).not.toBe("pick"); // no "up to 2 runes" choice
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes()).toHaveLength(total);
    expect(game.p1.runes({ ready: true })).toEqual([]); // still all exhausted during P2's turn
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the Peak NOT held at the start of the turn: taking it is a real Conquer (1 point), the trigger fires, and at end of turn P1 picks 2 runes which are then ready", async () => {
    const game = await board(false).build();
    const total = await p1TurnAllRunesTapped(game);
    expect(game.p1.points()).toBe(0);
    await game.p1.move("climber", "peak");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    await game.settle();
    await game.p1.endTurn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const runes = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(runes).toHaveLength(total);
    await game.p1.pick(runes[0] as string, runes[1] as string);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});
