/**
 * Interaction: Needlessly Large Yordle (sfd-055-221) · Unit · Calm · 10 + [calm][calm][calm] · 5 Might
 *     "[Shield 5] [Tank] I cost [2][calm] less for each point you scored from holding this turn."
 *   × The Arena's Greatest (ogn-290-298) · Battlefield —
 *     "At the start of each player's first Beginning Phase, that player gains 1 point."
 *   × Ahri, Alluring (ogn-066-298) · Champion Unit · Calm · 5 · 4 Might — "When I hold, you score 1 point."
 *
 * Question: P1 presents The Arena's Greatest and holds it with Ahri. On the turn P1 holds it, THREE
 * points arrive at once — the Arena's Greatest gained point, the Hold score itself, and Ahri's
 * triggered point. Which of the three reduce the Yordle's cost, and do BOTH the hand card's cost
 * badge and the play prompt's pay line recompute live as they arrive? NO side: with no new hold the
 * next turn, does the discount expire ("this turn") and the badge go back to printed cost?
 *
 * Expected: exactly ONE [2][calm] reduction. A point GAINED from a card effect is not a Scored point
 * (194.1.c vs 194.1.a / 469.2), and Ahri's "you score 1 point" is a triggered ability granting a
 * point (194.1.c) rather than the Hold Score of that battlefield — only the Hold itself (469.2) is
 * a point scored from holding. 470 caps Scoring at once per battlefield per turn, so the three
 * points that land at The Arena's Greatest this turn put it in the ledger exactly once.
 *
 * Rules: 194.1.a / 469.2 (Scoring — conquering or holding), 194.1.c (points GAINED because a card
 * effect says so), 470 (a player may Score from either method only once per battlefield per turn),
 * 355.8 / 357.1.a / 358.3.a (a prompt must present a payable-or-declinable cost; a play the pool
 * cannot cover yet is listed with what it still needs, and Reaction [Add]s may top the pool up),
 * 486.6 (the game state is reset between games of a match).
 *
 * The badge is the app's own hand-cost surface (`server/snapshot.ts handPlayCost`) and the pay line
 * is the engine `quote` carried by the play variant — asserting both is what separates an
 * engine-wide discount from one the client merely paints.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { handPlayCost } from "../../../../../../apps/riftbound-app/server/snapshot";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";

const YORDLE = "sfd-055-221";
const ARENA = "ogn-290-298";
const AHRI = "ogn-066-298";

/** Printed cost: 10 Energy + [calm][calm][calm]. */
const PRINTED = { energy: 10, power: ["calm", "calm", "calm"] };
/** One [2][calm] reduction. */
const ONE_OFF = { energy: 8, power: ["calm", "calm"] };

/** A minimal session wrapper so the app's hand-cost badge can be read off a harness game. */
function badge(game: Game, alias: string): { energy: number; power: string[] } | undefined {
  const session: GameSession = {
    clients: new Map(),
    engine: game.engine as unknown as GameSession["engine"],
    log: [],
    players: [P1, P2],
    playerNames: { [P1]: "P1", [P2]: "P2" },
    sandbox: true,
    seq: 0,
  };
  return handPlayCost(session, alias);
}

/** The pay line the play prompt would charge: the `quote` on the play variant. */
function payLine(game: Game, alias: string): { energy: number; power: Record<string, number> } | undefined {
  const variant = game.p1.option("play", alias)?.variants?.[0];
  const quote = (variant?.params as { quote?: { energy: number; power: Record<string, number> } } | undefined)?.quote;
  return quote ? { energy: quote.energy, power: { ...quote.power } } : undefined;
}

/**
 * P2 is about to end the turn. `arena` is The Arena's Greatest with live text; `holder` decides who
 * holds it, and `ahri` swaps P1's holder between Ahri, Alluring and a vanilla body.
 */
function board(o: { holder: typeof P1 | typeof P2; ahri?: boolean; second?: boolean }) {
  const s = scenario()
    .turn(2)
    .active(P2)
    .battlefield("arena", { controller: o.holder, def: ARENA, inert: false })
    .hand(P1, YORDLE, "yordle");
  if (o.holder === P1) {
    s.unit(P1, "arena", o.ahri ? AHRI : { might: 4, name: "Plain Holder" }, "holder");
  } else {
    s.unit(P2, "arena", { might: 2, name: "Squatter" }, "holder");
  }
  if (o.second) {
    s.battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2, name: "Second Holder" }, "holder2");
  }
  return s;
}

describe("Needlessly Large Yordle's cost line: points SCORED from holding vs points GAINED", () => {
  test("premise — all three points land on P1's turn (Arena's gain + the Hold + Ahri), and the Hold ledger records the battlefield exactly once (470)", async () => {
    const game = await board({ ahri: true, holder: P1 }).build();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["arena"]);
    expect(game.violations()).toEqual([]);
  });

  test("(1) a point GAINED from The Arena's Greatest is not a Scored point (194.1.c vs 194.1.a / 469.2): P1 is on 1 with an empty Hold ledger and the badge AND pay line stay at printed cost", async () => {
    // Arena's Greatest is held by P2, so P1's first Beginning Phase gains the point without holding.
    const game = await board({ holder: P2 }).build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(badge(game, "yordle")).toEqual(PRINTED);
    await game.p1.do("addResources", { energy: 10, power: { calm: 3 } });
    expect(payLine(game, "yordle")).toEqual({ energy: 10, power: { calm: 3 } });
  });

  test("(2) the Hold itself IS a point scored from holding (469.2): one [2][calm] off, and it shows on BOTH the hand badge and the play prompt's pay line", async () => {
    const game = await board({ ahri: true, holder: P1 }).build();
    expect(badge(game, "yordle")).toEqual(PRINTED); // before the hold
    await game.advanceTurn();
    expect(badge(game, "yordle")).toEqual(ONE_OFF);
    await game.p1.do("addResources", { energy: 10, power: { calm: 3 } });
    expect(payLine(game, "yordle")).toEqual({ energy: 8, power: { calm: 2 } });
    await game.p1.play("yordle", { to: "base" });
    expect(game.zoneOf("yordle")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } }); // only 8 + [calm][calm] taken
  });

  test("(3) Ahri's 'When I hold, you score 1 point' grants a point (194.1.c), it is not a second Hold Score: with and without Ahri the reduction is the SAME single [2][calm] while the point total differs 3 vs 2", async () => {
    const withAhri = await board({ ahri: true, holder: P1 }).build();
    await withAhri.advanceTurn();
    const without = await board({ ahri: false, holder: P1 }).build();
    await without.advanceTurn();

    expect(withAhri.p1.points()).toBe(3);
    expect(without.p1.points()).toBe(2);
    expect(badge(withAhri, "yordle")).toEqual(ONE_OFF);
    expect(badge(without, "yordle")).toEqual(ONE_OFF);
    // Not two reductions (6 + [calm]) and not three (4 + nothing).
    expect(badge(withAhri, "yordle")).not.toEqual({ energy: 6, power: ["calm"] });
    expect(badge(withAhri, "yordle")).not.toEqual({ energy: 4, power: [] });
  });

  test("(4) 470 — three points at ONE battlefield still Score it once, so a second hold there cannot add a reduction; two DIFFERENT battlefields held do stack to 6 + [calm]", async () => {
    const one = await board({ ahri: true, holder: P1 }).build();
    await one.advanceTurn();
    expect(one.gameState.scoredThisTurn[P1]).toEqual(["arena"]); // no duplicate entry
    expect(badge(one, "yordle")).toEqual(ONE_OFF);

    const two = await board({ ahri: true, holder: P1, second: true }).build();
    await two.advanceTurn();
    expect(two.gameState.scoredThisTurn[P1]).toEqual(["arena", "bf2"]);
    expect(two.p1.points()).toBe(4); // gain + Ahri + two hold scores
    expect(badge(two, "yordle")).toEqual({ energy: 6, power: ["calm"] });
    await two.p1.do("addResources", { energy: 6, power: { calm: 1 } });
    expect(payLine(two, "yordle")).toEqual({ energy: 6, power: { calm: 1 } });
    await two.p1.play("yordle", { to: "base" });
    expect(two.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("(5) the reduced pay line is payable-or-declinable (355.8 / 357.1.a / 358.3.a): exactly 8 + [calm][calm] plays; one short it is refused but LISTED as reachable with what it needs, and a Reaction [Add] (tapping a rune) unlocks it", async () => {
    const game = await board({ ahri: true, holder: P1 }).runes(P1, "calm", 2).build();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 7, power: { calm: 2 } });
    expect(game.p1.can("play", "yordle")).toBe(false);
    const decision = game.decision();
    expect(decision?.kind === "action" ? decision.reachablePlays : undefined).toEqual([
      expect.objectContaining({ card: "yordle", needsAdd: expect.objectContaining({ energy: 1 }) }),
    ]);
    await game.p1.tapRune();
    expect(game.p1.can("play", "yordle")).toBe(true);
    expect(payLine(game, "yordle")).toEqual({ energy: 8, power: { calm: 2 } });
    await game.p1.play("yordle", { to: "base" });
    expect(game.zoneOf("yordle")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("(6) 'this turn' expires: on the following turn the Hold ledger is empty and badge + pay line are back to printed cost; a fresh game starts there too (486.6)", async () => {
    const game = await board({ ahri: true, holder: P1 }).build();
    await game.advanceTurn();
    expect(badge(game, "yordle")).toEqual(ONE_OFF);
    await game.advanceTurn(); // P1 ends; P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(badge(game, "yordle")).toEqual(PRINTED);

    // A new game with the same board carries nothing over: the ledger is empty and the cost printed.
    const nextGame = await board({ ahri: true, holder: P1 }).build();
    expect(nextGame.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(badge(nextGame, "yordle")).toEqual(PRINTED);
  });
});
