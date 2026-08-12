/**
 * Interaction: Kai'Sa, Evolutionary (ogn-112-298) · Unit · Mind · [6] · 6 Might · [Ganking]
 *     "When I conquer, you may play a spell from your trash with Energy cost less than your points
 *      without paying its Energy cost. Then recycle it."
 *   × Seat of Power (sfd-217-221) · Battlefield
 *     "When you conquer here, draw 1 for each other battlefield you or allies control."
 *   × Windswept Hillock (ogn-297-298) · Battlefield · "Units here have [Ganking]."
 *   (third battlefield: Trifarian War Camp ogn-294-298, only as the second thing P1 controls)
 *
 * Rules: 471.1.b / 471.1.b.1 (a Conquer by a player 1 point from the Victory Score draws a card instead
 * of gaining the point, UNLESS they have Scored every battlefield this turn), 471.1.a.1 (points from a
 * source that is not a Conquer are NOT restricted — a Hold still scores normally), 469.1 (the Conquer
 * itself still happened), 470 (once per battlefield per turn), 471.2 / 471.2.a (Conquer abilities still
 * trigger at the battlefield that Scored), 431.1.a / 431.2 / 431.2.b / 431.2.c / 431.3 / 431.3.a /
 * 431.3.c.1 (Burn Out and the repeating cascade), 323.1 / 472 (victory).
 *
 * Question: Victory Score 8, three battlefields including Seat of Power. P1 sits on exactly 7 points and
 * Kai'Sa conquers Seat of Power.
 *   (a) Does the Conquer give the Final Point or the substituted draw — and do Seat of Power's and
 *       Kai'Sa's OWN conquer triggers still fire on top of the substituted draw?
 *   (b) Kai'Sa's trigger plays a trash spell with "Energy cost less than your points" — after the
 *       substitution, is that number still 7?
 *   (c) Do those draws eventually strip the Main Deck and hand P2 the game by Burn Out while P1 is one
 *       point from winning?
 *   (d) On the turn P1 has Scored EVERY battlefield, does the Conquer finally award the Final Point?
 *
 * Expected: (a) draw, not point — but only the POINT is substituted: the battlefield is Scored, and both
 * Conquer triggers fire (Seat of Power draws 1 per other controlled battlefield; Kai'Sa's opt-in is
 * raised). (b) yes, still 7 — a draw is not a point. (c) yes: with the deck (and trash) empty the
 * substituted draw burns out repeatedly, giving P2 one point per iteration until P2 passes the Victory
 * Score and wins immediately, P1 frozen at 7 throughout. (d) yes — with all three battlefields Scored
 * this turn 471.1.b.1's condition is met, the Conquer gains the Final Point and P1 wins.
 *
 * Note on the "12 consecutive turns at 7" framing: it only holds while P1 controls NO battlefield at its
 * own Beginning Phase — a Hold is not a Conquer (471.1.a.1), so a held battlefield would simply award the
 * eighth point. Facet (d) is exactly that case, run deliberately.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Decision, Game } from "../../../harness";

const KAISA = "ogn-112-298";
const SEAT_OF_POWER = "sfd-217-221";
const WINDSWEPT_HILLOCK = "ogn-297-298";
const WAR_CAMP = "ogn-294-298";

/** Three live battlefields; P1 holds Hillock + War Camp, Seat of Power is uncontrolled. */
function board(points: number) {
  return scenario()
    .victoryScore(8)
    .points(P1, points)
    .points(P2, 0)
    .battlefield("bfSeat", { controller: null, def: SEAT_OF_POWER, inert: false })
    .battlefield("bfHill", { controller: P1, def: WINDSWEPT_HILLOCK, inert: false })
    .battlefield("bfCamp", { controller: P1, def: WAR_CAMP, inert: false })
    .unit(P1, "bfHill", KAISA, "kaisa")
    .unit(P1, "bfHill", { might: 1, name: "HoldA" }, "holdA")
    .unit(P1, "bfCamp", { might: 1, name: "HoldB" }, "holdB");
}

/** Settle to the next open state, answering Kai'Sa's opt-in with `useKaisa` and picking greedily. */
async function resolveConquer(game: Game, useKaisa: boolean): Promise<Decision[]> {
  const asked: Decision[] = [];
  for (let i = 0; i < 20; i++) {
    const settled = await game.settle({ maxSteps: 60 });
    const d = game.decision();
    if (settled.reason !== "unanswered" || !d) {
      return asked;
    }
    asked.push(d);
    const seat = game.seat(d.seat);
    if (d.kind === "yes-no") {
      await (useKaisa ? seat.yes() : seat.no());
    } else if (d.kind === "pick") {
      await seat.pick(d.options[0]!.key);
    } else {
      return asked;
    }
  }
  throw new Error("did not settle");
}

describe("Kai'Sa × Seat of Power at Victory−1 — the Final Point becomes a draw, and the draws end the game", () => {
  test("premise: Victory Score 8, P1 on 7, Seat of Power uncontrolled, P1 holding the other two battlefields", async () => {
    const game = await board(7).fillDecks({ main: 30, runes: 20 }).build();
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.battlefields.bfSeat?.controller).toBeNull();
    expect(game.p1.battlefields({ controlled: true }).sort()).toEqual(["bfCamp", "bfHill"]);
    expect(game.state("kaisa").keywords).toContain("Ganking");
  });

  // ---- (a) the substitution -----------------------------------------------------------------------

  test("(a) the Conquer gives the DRAW, not the point: P1 stays on 7 (471.1.b, 471.1.b.1)", async () => {
    const game = await board(7).fillDecks({ main: 30, runes: 20 }).build();
    await game.p1.gank("kaisa", "bfSeat");
    await resolveConquer(game, false);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("(a) only the POINT is substituted — the Conquer itself happened: P1 controls Seat of Power and it counts as Scored this turn (469.1, 470)", async () => {
    const game = await board(7).fillDecks({ main: 30, runes: 20 }).build();
    await game.p1.gank("kaisa", "bfSeat");
    await resolveConquer(game, false);
    expect(game.gameState.battlefields.bfSeat?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toContain("bfSeat");
  });

  test("(a) Seat of Power's own Conquer trigger still fires ON TOP of the substituted draw: 1 + 2 = 3 cards (471.2, 471.2.a)", async () => {
    const game = await board(7).fillDecks({ main: 30, runes: 20 }).build();
    expect(game.p1.hand()).toHaveLength(0);
    const deckBefore = game.p1.deck().length;
    await game.p1.gank("kaisa", "bfSeat");
    await resolveConquer(game, false);
    // 1 substituted Final-Point draw + 1 per other battlefield P1 controls (bfHill, bfCamp).
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.deck()).toHaveLength(deckBefore - 3);
    expect(game.p1.points()).toBe(7);
  });

  test("(a) Kai'Sa's own Conquer trigger is finalized too — with a legal spell in the trash the opt-in is raised (471.2.a, 383.3.a)", async () => {
    const game = await board(7)
      .trash(P1, { cardType: "spell", energyCost: 3, name: "Three" }, "three")
      .fillDecks({ main: 30, runes: 20 })
      .build();
    await game.p1.gank("kaisa", "bfSeat");
    const asked = await resolveConquer(game, false);
    const optIn = asked.find((d) => d.kind === "yes-no");
    expect(optIn).toBeDefined();
    expect(optIn?.seat).toBe(P1);
    expect(optIn?.prompt).toContain("Kai'Sa");
  });

  test("contrast: two points from the Victory Score the substitution does NOT apply — the same Conquer gains the point (471.1.b)", async () => {
    const game = await board(6).fillDecks({ main: 30, runes: 20 }).build();
    await game.p1.gank("kaisa", "bfSeat");
    await resolveConquer(game, false);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(2); // Seat of Power only — no substituted draw
    expect(game.isOver()).toBe(false);
  });

  // ---- (b) the number the trigger reads ------------------------------------------------------------

  test("(b) a draw is not a point: 'Energy cost less than your points' still reads 7 — cost 3 and 6 are offered, cost 7 is not (206)", async () => {
    const game = await board(7)
      .trash(P1, { cardType: "spell", energyCost: 3, name: "Three" }, "three")
      .trash(P1, { cardType: "spell", energyCost: 6, name: "Six" }, "six")
      .trash(P1, { cardType: "spell", energyCost: 7, name: "Seven" }, "seven")
      .fillDecks({ main: 30, runes: 20 })
      .build();
    await game.p1.gank("kaisa", "bfSeat");
    await game.settle({ maxSteps: 60 });
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.yes();
    await game.settle({ maxSteps: 60 });
    const pick = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(pick.kind).toBe("pick");
    expect(pick.options.map((o) => o.key).sort()).toEqual(["six", "three"]);
    expect(pick.options.some((o) => o.key === "seven")).toBe(false);
    expect(game.p1.points()).toBe(7);
  });

  // ---- (c) the draws end the game ------------------------------------------------------------------

  test("(c) empty deck AND empty trash: the substituted draw burns out repeatedly, P2 climbs past the Victory Score and wins immediately (431.1.a, 431.2.c, 431.3.a, 431.3.c.1)", async () => {
    const game = await board(7).fillDecks({ main: 0, runes: 20 }).build();
    expect(game.p1.deck()).toHaveLength(0);
    expect(game.p1.trash()).toHaveLength(0);
    await game.p1.gank("kaisa", "bfSeat");
    await resolveConquer(game, false);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7); // frozen one point from victory the whole way
  });

  test("(c) a NON-empty trash buys exactly one iteration: the trash is recycled into the deck and P2 gains exactly 1 point (431.2.b, 431.2.c)", async () => {
    const game = await board(7)
      .trash(P1, { cardType: "spell", energyCost: 9, name: "Junk1" }, "junk1")
      .trash(P1, { cardType: "spell", energyCost: 9, name: "Junk2" }, "junk2")
      .trash(P1, { cardType: "spell", energyCost: 9, name: "Junk3" }, "junk3")
      .trash(P1, { cardType: "spell", energyCost: 9, name: "Junk4" }, "junk4")
      .fillDecks({ main: 0, runes: 20 })
      .build();
    await game.p1.gank("kaisa", "bfSeat");
    await resolveConquer(game, false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.trash()).toHaveLength(0); // recycled
    expect(game.p1.hand()).toHaveLength(3); // 1 substituted + 2 from Seat of Power
    expect(game.p1.deck()).toHaveLength(1); // 4 recycled − 3 drawn
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) the turn every battlefield is Scored -----------------------------------------------------

  test("(d) Holds are not Conquers (471.1.a.1): starting from 5, the Beginning Phase Holds score bfHill + bfCamp and put P1 on 7", async () => {
    const game = await board(5).turn(2).active(P2).fillDecks({ main: 30, runes: 20 }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]?.sort()).toEqual(["bfCamp", "bfHill"]);
    expect(game.isOver()).toBe(false);
  });

  test("(d) with every battlefield Scored this turn the Conquer awards the FINAL POINT and P1 wins (471.1.b.1, 323.1, 472)", async () => {
    const game = await board(5).turn(2).active(P2).fillDecks({ main: 30, runes: 20 }).build();
    await game.advanceTurn();
    await game.p1.gank("kaisa", "bfSeat");
    await resolveConquer(game, false);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
