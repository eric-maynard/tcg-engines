/**
 * Interaction: the Victory Score track across a Bo3 — 9 in game 1, back to 8 in game 2.
 *   Aspirant's Climb (ogn-276-298) · Battlefield — "Increase the points needed to win the game by 1."
 *   Renata Glasc, Mastermind (sfd-088-221) · Champion Unit · Mind · 5 · 4 Might
 *     "[1][mind]: Draw 1.  ·  [4][mind][mind][mind][mind], [Exhaust]: Score 1 point.
 *      Use my abilities only while I'm at a battlefield."
 *   Power Nexus (sfd-214-221) · Battlefield — "When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point."
 *
 * Question.
 *   YES side — while Aspirant's Climb is the in-play battlefield, does every surface that names the win
 *   condition say 9, and does reaching exactly 8 leave the game running with no game-over?
 *   NO side — after P1 wins game 1, 486.5 removes the battlefields used that game for the rest of the
 *   match, so game 2 cannot present Climb again: does the game-2 picker refuse it, and does the win
 *   condition drop back to 8 so the same 8th point now ends the game?
 *   Also: is Power Nexus's optional payment a real, declinable pay line rather than a forced or
 *   unanswerable prompt?
 *
 * Expected.
 *   1) Pregame order: battlefields first (113 / 486.5), then the initiative step (115), then the
 *      mulligan (116 / 117). The picker carries exactly 3 options with name + rules text; a lock-in is
 *      final.
 *   2) With Climb in the Battlefield Zone the Victory Score is 8 + 1 = 9 (194.3, 194.3.a, 486.3) for
 *      BOTH seats — and the number the app ships to every HUD (`victoryScoreEffective`) is that 9, not
 *      the raw base of 8.
 *   3) Taking P1 to exactly 8 does not win: every cleanup compares against 9 (319.5 → 194.2), so play
 *      continues with the live turn player still on the clock.
 *   4) The 9th point wins in the next cleanup; the match records one Game Win for P1 and offers
 *      Continue / Leave (486.6).
 *   5) Because P1 WON game 1, both battlefields used in it are removed from the match (486.5): P1's
 *      game-2 picker refuses Climb, and the opponent's used battlefield is refused too. A game nobody
 *      won leaves them available (486.5.a) — the app must not over-rotate there.
 *   6) Game 2 has no Climb, so the Victory Score is 8 from the first frame of the new game and the 8th
 *      point ends it.
 *   7) Power Nexus's hold payment is optional: a declinable prompt naming the four [rainbow] pips,
 *      never one with zero legal answers (355.8 / 358.3.a).
 *   8) Concede / Leave is reachable on every one of these screens (650).
 *
 * Rules: 113, 115, 116, 117, 194.2, 194.3, 194.3.a, 319.5, 421.4, 486.3, 486.5, 486.5.a, 486.6, 650,
 * 355.8, 358.3.a.
 *
 * Layering: the win-condition arithmetic and the Power Nexus pay line are asserted through the agent
 * harness (engine truth); the pregame order, the picker payload, the 486.5 rotation and the number the
 * HUD is handed are asserted through the app's own server modules — the same call path the browser
 * screens render from.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";
import type { PlayerId } from "../../../types";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { concedeGame, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import {
  buildAvailableMoves,
  buildGameSnapshot,
} from "../../../../../../apps/riftbound-app/server/snapshot";
import {
  buildPregamePayload,
  chooseFirstPlayer,
  createGameFromDecks,
  finalizePregame,
  lockSideboard,
  selectBattlefield,
} from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";

const ASPIRANTS_CLIMB = "ogn-276-298";
const RENATA_GLASC = "sfd-088-221";
const POWER_NEXUS = "sfd-214-221";
const OBELISK_OF_POWER = "ogn-284-298";

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Engine layer — what 9 and 8 actually mean
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/** P1's Main Phase on `points`, with Renata at a battlefield and the runes for one Score activation. */
function renataBoard(points: number, opts: { climb?: boolean } = {}) {
  const b = scenario().turn(2).active(P1).points(P1, points).points(P2, 2);
  if (opts.climb === false) {
    b.battlefield("bf1", { controller: P1 });
  } else {
    b.battlefield("bf1", { controller: P1, def: ASPIRANTS_CLIMB, inert: false });
  }
  return b
    .unit(P1, "bf1", RENATA_GLASC, "renata")
    .resources(P1, { energy: 8, power: { mind: 8 } })
    .unit(P2, "base", { might: 1, name: "Bystander" }, "grunt");
}

const victoryScoreOf = (game: Game, seat: string): number =>
  effectiveVictoryScore(game.gameState, seat as PlayerId);

describe("194.3.a / 486.3 — with Aspirant's Climb in play the Victory Score is 9 for everyone", () => {
  test("the raw base stays 8 and the EFFECTIVE score both seats play to is 9 — the number every win-condition surface must quote", async () => {
    const game = await renataBoard(7).build();
    expect(game.gameState.victoryScore).toBe(8);
    expect(victoryScoreOf(game, P1)).toBe(9);
    expect(victoryScoreOf(game, P2)).toBe(9); // Climb raises "the points needed to win the game", not one seat's
  });

  test("control: the same board with an ordinary battlefield is a plain 8", async () => {
    const game = await renataBoard(7, { climb: false }).build();
    expect(victoryScoreOf(game, P1)).toBe(8);
    expect(victoryScoreOf(game, P2)).toBe(8);
  });

  test("Renata's Score ability is real and costed: [4][mind][mind][mind][mind] + [Exhaust], and it takes P1 from 7 to 8", async () => {
    const game = await renataBoard(7).build();
    expect(game.p1.legal().some((o) => o.key === "activateAbility:renata#1")).toBe(true);
    await game.p1.activate("renata", 1);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.state("renata").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 4 } });
  });

  test("reaching exactly 8 under Climb does NOT end the game: no winner, the turn player is still on the clock and the open Main Phase decision is still P1's (319.5 → 194.2)", async () => {
    const game = await renataBoard(7).build();
    await game.p1.activate("renata", 1);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.gameState.status).toBe("playing");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("concede")).toBe(true); // 650 — reachable mid-game
  });

  test("control: the identical 8th point WITHOUT Climb wins on the spot", async () => {
    const game = await renataBoard(7, { climb: false }).build();
    await game.p1.activate("renata", 1);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the 9th point wins under Climb — in the cleanup after the Score, with the final score reading exactly 9 (194.2)", async () => {
    const game = await renataBoard(8).build();
    expect(game.isOver()).toBe(false); // 8 was already not enough
    await game.p1.activate("renata", 1);
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Power Nexus — an optional payment must be declinable, never unanswerable
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/** Turn 2, P2 about to end the turn; P1 holds Power Nexus with `runes` ready runes to recycle. */
function nexusBoard(runes: number) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .points(P1, 3)
    .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
    .unit(P1, "nexus", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "grunt");
  if (runes > 0) {
    b.runes(P1, "fury", runes);
  }
  return b;
}

describe("355.8 / 358.3.a — Power Nexus's 'you MAY pay [rainbow]×4' is a declinable pay line", () => {
  test("the Hold scores its own point and then raises an opt-in prompt that names the four [rainbow] pips and its source", async () => {
    const game = await nexusBoard(4).build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(4); // the Hold itself
    expect(game.decision()).toMatchObject({
      kind: "yes-no",
      prompt: expect.stringContaining("[rainbow][rainbow][rainbow][rainbow]"),
      seat: P1,
      source: { battlefieldId: "nexus", cardId: "nexus" },
    });
  });

  test("declining is ALWAYS legal — including with nothing whatsoever to pay from, so the prompt never has zero legal answers", async () => {
    const game = await nexusBoard(0).build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false); // accepting an unpayable cost is refused…
    await game.p1.no(); // …declining is not
    await game.settle();
    expect(game.p1.points()).toBe(4); // only the Hold point
    expect(game.chain()).toEqual([]);
    expect(game.phase()).toBe("main");
  });

  test("accepting is gated on the cost actually being covered: unpaid Yes is refused and the prompt stays open (429.3 manual pay)", async () => {
    const game = await nexusBoard(4).build();
    await game.p2.endTurn();
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.p1.points()).toBe(4);
  });

  test("paying it for real: recycle four runes at the prompt, accept, and the extra point lands (4 → 5)", async () => {
    const game = await nexusBoard(4).build();
    await game.p2.endTurn();
    for (const rune of game.p1.runes()) {
      await game.p1.recycleRune(rune);
    }
    expect(game.p1.power("fury")).toBe(4);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.points()).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("concede is on the prompt's own action list while it is open (650)", async () => {
    const game = await nexusBoard(0).build();
    await game.p2.endTurn();
    const d = game.decision() as { actions?: readonly { verb: string }[] } | null;
    expect(d?.actions?.map((a) => a.verb)).toContain("concede");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Match layer — pregame order, the picker payload, 486.5 rotation, and the number the HUD is handed
// ═════════════════════════════════════════════════════════════════════════════════════════════════

const BASE_DECK = buildDefaultDeck();
/** P1 registers Climb, Power Nexus and the Obelisk; P2 registers three others. */
const P1_DECK = { ...BASE_DECK, battlefieldIds: [ASPIRANTS_CLIMB, POWER_NEXUS, OBELISK_OF_POWER] };
const P2_DECK = { ...buildDefaultDeck("calm", "mind"), battlefieldIds: ["ogn-275-298", "ogn-277-298", "ogn-279-298"] };

let seq = 0;

function newBo3(): { gameId: string; session: GameSession } {
  const gameId = `bo3-climb-${++seq}`;
  return {
    gameId,
    session: createGameFromDecks(P1_DECK, P2_DECK, gameId, {
      gameMode: "match",
      initiative: { kind: "roll" },
      names: { [P1]: "Alice", [P2]: "Bob" },
      sandbox: false,
    }),
  };
}

/** Walk a pregame to a playing game; P1 presents `p1Bf` (default: its first still-selectable option). */
function playOut(session: GameSession, p1Bf?: string): void {
  for (let i = 0; i < 10 && session.pregame; i++) {
    const pg = session.pregame;
    if (pg.phase === "battlefield_select") {
      for (const seat of [P1, P2]) {
        if (pg.battlefieldSelections[seat]) {
          continue;
        }
        const excluded = pg.battlefieldExcluded?.[seat] ?? [];
        const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !excluded.includes(id));
        selectBattlefield(session, seat, seat === P1 ? (p1Bf ?? free) : free);
      }
    } else if (pg.phase === "sideboard") {
      for (const seat of [P1, P2]) {
        lockSideboard(session, seat);
      }
    } else if (pg.phase === "initiative") {
      chooseFirstPlayer(session, pg.initiative?.chooser as string, P1);
    } else {
      pg.mulliganComplete.add(P1);
      pg.mulliganComplete.add(P2);
      finalizePregame(session);
    }
  }
}

/** The `victoryScoreEffective` map the app ships to every HUD. */
const hudVictoryScore = (session: GameSession, seat: string): number =>
  (buildGameSnapshot(session, seat).victoryScoreEffective as Record<string, number>)[seat] as number;

describe("(1) pregame order and the battlefield picker (113 / 486.5 before 115, then 116 / 117)", () => {
  test("game 1 opens on battlefield_select with no roll taken, no sideboard window and no hands dealt", async () => {
    const { session } = newBo3();
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.initiative).toMatchObject({ chooser: null, decided: false, kind: "roll" });
    expect(session.pregame?.handsDrawn).toBe(false);
    expect(session.pregame?.sideboard).toBeUndefined();
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
  });

  test("the picker offers exactly THREE options, each with an id, a name and its rules text, and none flagged used in game 1", async () => {
    const { session } = newBo3();
    const payload = buildPregamePayload(session, P1) as { battlefieldOptions: { id: string; name: string; rulesText: string; used?: true }[] };
    expect(payload.battlefieldOptions).toHaveLength(3);
    expect(payload.battlefieldOptions.map((o) => o.id)).toEqual([ASPIRANTS_CLIMB, POWER_NEXUS, OBELISK_OF_POWER]);
    const climb = payload.battlefieldOptions[0] as { name: string; rulesText: string; used?: true };
    expect(climb.name).toBe("Aspirant's Climb");
    expect(climb.rulesText).toContain("Increase the points needed to win the game by 1");
    expect(payload.battlefieldOptions.every((o) => o.used === undefined)).toBe(true);
  });

  test("P1 locks in Aspirant's Climb and the lock is FINAL — a second selection by the same seat is refused", async () => {
    const { session } = newBo3();
    expect(selectBattlefield(session, P1, ASPIRANTS_CLIMB)).toMatchObject({ ok: true });
    expect(selectBattlefield(session, P1, POWER_NEXUS)).toMatchObject({ error: "Battlefield already locked in", ok: false });
    expect(session.pregame?.battlefieldSelections[P1]).toBe(ASPIRANTS_CLIMB);
  });

  test("only once both seats have locked does the pregame move on to the initiative step, and only after that are hands dealt (115 then 116/117)", async () => {
    const { session } = newBo3();
    selectBattlefield(session, P1, ASPIRANTS_CLIMB);
    expect(session.pregame?.phase).toBe("battlefield_select"); // still waiting on P2
    selectBattlefield(session, P2, P2_DECK.battlefieldIds[0] as string);
    expect(session.pregame?.phase).toBe("initiative");
    expect(session.pregame?.handsDrawn).toBe(false);
    chooseFirstPlayer(session, session.pregame?.initiative?.chooser as string, P1);
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.handsDrawn).toBe(true);
  });
});

describe("(2)/(3) the number the HUD is handed in game 1 is 9, and 8 does not end the game", () => {
  test("with Climb placed, `victoryScoreEffective` is 9 for BOTH seats' snapshots (194.3.a) while the raw victoryScore stays 8", async () => {
    const { session } = newBo3();
    playOut(session, ASPIRANTS_CLIMB);
    expect(session.engine.getState().status).toBe("playing");
    expect(hudVictoryScore(session, P1)).toBe(9);
    expect(hudVictoryScore(session, P2)).toBe(9);
    expect(buildGameSnapshot(session, P1).victoryScore).toBe(8);
  });

  test("driving P1 to exactly 8 leaves the game running: no winner, status playing, and Concede is still on P1's move list (650)", async () => {
    const { session } = newBo3();
    playOut(session, ASPIRANTS_CLIMB);
    session.engine.applyPatches([{ op: "replace", path: ["players", P1, "victoryPoints"], value: 8 }]);
    expect(session.engine.getState().status).toBe("playing");
    expect(session.engine.getState().winner ?? null).toBeNull();
    expect(hudVictoryScore(session, P1)).toBe(9);
    expect(buildAvailableMoves(session, P1).some((m: { moveId: string }) => m.moveId === "concede")).toBe(true);
  });

  test("control: the same 8 with the Obelisk instead of Climb is already at the Victory Score the HUD quotes", async () => {
    const { session } = newBo3();
    playOut(session, OBELISK_OF_POWER);
    expect(hudVictoryScore(session, P1)).toBe(8);
  });
});

describe("(4)/(5) 486.5 / 486.6 — after P1 wins game 1 the used battlefields leave the match", () => {
  /** Game 1 played out with P1 on Climb, then P2 concedes (P1 wins), then both press Continue. */
  function toGame2(): { gameId: string; session: GameSession } {
    const { gameId, session } = newBo3();
    playOut(session, ASPIRANTS_CLIMB);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    return { gameId, session };
  }

  test("the match records one Game Win for P1 and is not yet decided — the game-over box's Continue / Leave state (486.6)", async () => {
    const { gameId, session } = newBo3();
    playOut(session, ASPIRANTS_CLIMB);
    concedeGame(session, gameId, P2);
    const m = matchSummary(session);
    expect(m).toMatchObject({ decided: false, format: "bo3", gameNumber: 1, winsNeeded: 2 });
    expect(m.current).toMatchObject({ finished: true, winner: P1 });
    expect(m.score).toEqual({ [P1]: 1, [P2]: 0 });
    // The rotation is banked when the next game is started, not at the moment the game ends.
    expect(m.usedBattlefields[P1]).toBeUndefined();
  });

  test("game 2's picker will not take Climb again: it is flagged `used` in the payload and selectBattlefield refuses it, naming 486.5", async () => {
    const { session } = toGame2();
    expect(session.gameNumber).toBe(2);
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(matchSummary(session).usedBattlefields[P1]).toEqual([ASPIRANTS_CLIMB]);
    expect(session.pregame?.battlefieldExcluded?.[P1]).toEqual([ASPIRANTS_CLIMB]);

    const payload = buildPregamePayload(session, P1) as { battlefieldOptions: { id: string; used?: true }[] };
    // 486.5 is enforced by unselectability: the app still LISTS the used battlefield (greyed, so the
    // player can see why it is gone) — what matters is that it can never be put into play again.
    expect(payload.battlefieldOptions.filter((o) => o.used !== true).map((o) => o.id)).toEqual([POWER_NEXUS, OBELISK_OF_POWER]);
    expect(payload.battlefieldOptions.find((o) => o.id === ASPIRANTS_CLIMB)?.used).toBe(true);
    expect(selectBattlefield(session, P1, ASPIRANTS_CLIMB)).toMatchObject({ ok: false });
    expect((selectBattlefield(session, P1, ASPIRANTS_CLIMB) as { error: string }).error).toContain("486.5");
    expect(session.pregame?.battlefieldSelections[P1]).toBeUndefined();
  });

  test("the opponent's used battlefield is removed too — the rotation is symmetric, not just the winner's", async () => {
    const { session } = toGame2();
    expect(session.pregame?.battlefieldExcluded?.[P2]).toEqual([P2_DECK.battlefieldIds[0] as string]);
    expect(selectBattlefield(session, P2, P2_DECK.battlefieldIds[0] as string)).toMatchObject({ ok: false });
  });

  test("486.5.a — a game NOBODY won leaves both seats' battlefields available: nothing is excluded and the picker is unchanged", async () => {
    const { gameId, session } = newBo3();
    playOut(session, ASPIRANTS_CLIMB);
    session.engine.applyPatches([{ op: "replace", path: ["status"], value: "finished" }]);
    expect(matchSummary(session).current).toMatchObject({ finished: true, winner: null });
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    expect(session.gameNumber).toBe(2);
    expect(session.match?.usedBattlefields).toEqual({});
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
    const payload = buildPregamePayload(session, P1) as { battlefieldOptions: { id: string; used?: true }[] };
    expect(payload.battlefieldOptions.map((o) => o.id)).toEqual([ASPIRANTS_CLIMB, POWER_NEXUS, OBELISK_OF_POWER]);
    expect(payload.battlefieldOptions.every((o) => o.used === undefined)).toBe(true);
    expect(selectBattlefield(session, P1, ASPIRANTS_CLIMB)).toMatchObject({ ok: true });
  });
});

describe("(6) game 2 has no Climb, so the win condition is 8 from its first frame", () => {
  test("the new game's snapshot quotes 8 — the 9 does not carry over from game 1", async () => {
    const { gameId, session } = newBo3();
    playOut(session, ASPIRANTS_CLIMB);
    expect(hudVictoryScore(session, P1)).toBe(9);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    playOut(session, POWER_NEXUS); // Climb is unavailable now
    expect(session.gameNumber).toBe(2);
    expect(session.engine.getState().status).toBe("playing");
    expect(hudVictoryScore(session, P1)).toBe(8);
    expect(hudVictoryScore(session, P2)).toBe(8);
  });

  test("…and the 8th point now ends game 2, recorded as P1's second Game Win, which decides the match (486.6)", async () => {
    const { gameId, session } = newBo3();
    playOut(session, ASPIRANTS_CLIMB);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    playOut(session, POWER_NEXUS);
    concedeGame(session, gameId, P2);
    const m = matchSummary(session);
    expect(m.score).toEqual({ [P1]: 2, [P2]: 0 });
    expect(m).toMatchObject({ decided: true, gameNumber: 2, winner: P1 });
  });
});
