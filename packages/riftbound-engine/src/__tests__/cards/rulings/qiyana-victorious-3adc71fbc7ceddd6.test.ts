/**
 * Ruling 3adc71fbc7ceddd6 — Qiyana, Victorious (OGN-155 → ogn-155-298) · Champion · Body · 4 · 4 Might
 *   "[Deflect] When I conquer, draw 1 or channel 1 rune exhausted."
 *   × Charm (OGN-043 → ogn-043-298) · Spell [1][calm] "Move an enemy unit."
 *
 * Q: Can you conquer/score a battlefield more than once a turn? Can you conquer on the opponent's turn (as a defender)?
 * A: Each player scores a given battlefield at most once per turn (Hold or Conquer). Conquering can happen on anybody's
 *    turn: if you Charm an enemy unit into the battlefield you already scored and it wins, the OPPONENT conquers and
 *    scores on your turn; if you then retake it the same turn you gain control but do NOT score again.
 * Rules: 469.1 (Conquer = gain control of a battlefield not yet scored this turn), 466.5.d, 471.2.c.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const QIYANA = "ogn-155-298";
const CHARM = "ogn-043-298";

/** P1's turn. P2 holds bf1 with a 1-Might Sentry and keeps `intruderMight` Intruder in base. P1: Qiyana, Bruiser (7), Charm. */
function board(intruderMight: number) {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: intruderMight, name: "Intruder" }, "intruder")
    .unit(P1, "base", QIYANA, "qiyana")
    .unit(P1, "base", { might: 7, name: "Bruiser" }, "bruiser")
    .hand(P1, CHARM, "charm");
}

/** Qiyana attacks bf1, kills the Sentry and conquers; P1 answers her conquer trigger with "Draw 1". */
async function qiyanaConquers(intruderMight: number): Promise<Game> {
  const game = await board(intruderMight).build();
  expect(game.p1.points()).toBe(0);
  await game.p1.move("qiyana", "bf1");
  await game.settle();
  // "draw 1 OR channel 1 rune exhausted" — P1 chooses (a real decision surfaced to P1).
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "qiyana" } });
  if (d?.kind === "pick") {
    expect(d.options.map((o) => o.label)).toEqual(["Draw 1", "Channel 1 rune exhausted"]);
  }
  const handBefore = game.p1.hand().length;
  await game.p1.pick("0");
  await game.settle();
  expect(game.p1.hand().length).toBe(handBefore + 1);
  return game;
}

/** P1 Charms the Intruder into bf1 (P1 picks the destination) and lets the resulting combat resolve. */
async function charmIntruderIntoBf1(game: Game): Promise<void> {
  await game.p1.cast("charm", { targets: "intruder" });
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-bf1");
  await game.settle();
}

describe("Ruling 3adc71fbc7ceddd6 — one score per battlefield per player per turn; conquering can happen on anyone's turn", () => {
  test("Qiyana conquers bf1: P1 scores it (0 → 1) and her conquer trigger fires", async () => {
    const game = await qiyanaConquers(1);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("qiyana").damage).toBe(0); // healed at combat cleanup
  });

  test("Charm a WEAK enemy (1) into the already-scored bf1: Qiyana defends and wins — P1 keeps control but does not score bf1 a second time", async () => {
    const game = await qiyanaConquers(1);
    await charmIntruderIntoBf1(game);
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.zoneOf("qiyana")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Charm a STRONG enemy (6) into bf1: it kills Qiyana and P2 CONQUERS ON P1'S TURN — P2 scores (0 → 1)", async () => {
    const game = await qiyanaConquers(6);
    expect(game.turnPlayer()).toBe(P1);
    await charmIntruderIntoBf1(game);
    expect(game.zoneOf("qiyana")).toBe("trash");
    expect(game.locationOf("intruder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.turnPlayer()).toBe(P1); // still P1's turn
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(1);
  });

  test("…and when P1 retakes bf1 the SAME turn (Bruiser 7 kills the Intruder 6), P1 regains control but scores nothing — bf1 was already scored by P1 this turn", async () => {
    const game = await qiyanaConquers(6);
    await charmIntruderIntoBf1(game);
    expect(game.p1.points()).toBe(1);
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // NOT 2
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("next turn the once-per-turn limit resets: holding bf1 at the start of P1's following turn scores it again (1 → 2)", async () => {
    const game = await qiyanaConquers(6);
    await charmIntruderIntoBf1(game);
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // P1's turn: Hold bf1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });
});
