/**
 * Interaction: what "Continue to game 2" resets versus what "Rematch" resets, and the threshold that
 * moves with the battlefield pool.
 *   Chem-Baroness      (sfd-201-221) · Legend (Renata Glasc) — "When you or an ally hold, you may
 *     exhaust me to play a Gold gear token exhausted. While your score is within 3 points of the
 *     Victory Score, your Gold [ADD] an additional [1]."
 *   Bottled Constellation (ven-067-166) · Gear — "At the start of your Main Phase, you may kill 3
 *     other friendly units and/or gear to score 1 point."
 *   Aspirant's Climb   (ogn-276-298) · Battlefield — "Increase the points needed to win the game by 1."
 *   Gold               (sfd-t03) · gear token — "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Question: game 1 ends with Gold tokens, an exhausted legend, XP and a score on the board. Compare
 * the two exits — "Continue to game 2" versus, once the match is decided, "Rematch".
 *   YES side: does Continue reset the whole GAME state while PRESERVING the match score and rotating
 *             the battlefield pool?
 *   NO side:  does Rematch reset the MATCH score and restore the full battlefield pool, and is the
 *             previous game invisible behind the new pregame in both cases?
 *
 * Rules: 194.3.a (a "within N points of the Victory Score" clause measures against the EFFECTIVE
 * Victory Score, so a board passive counts), 486.3 / 486.6 (Best of 3: reset the game state, remove
 * the battlefields in play, choose new ones, first to two Game Wins), 486.5 (battlefields used in a
 * game somebody won leave the pool for the rest of THAT match), 116 (opening hand of 4), 117
 * (mulligan), 650 (a player may concede at any time), 355.8 / 358.3.a (an optional instruction stays
 * an offer — it is never taken for the player).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { concedeGame, concedeMatch, voteContinue, voteRematch } from "../../../../../../apps/riftbound-app/server/match";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { chooseFirstPlayer, createGameFromDecks, finalizePregame, lockSideboard, selectBattlefield } from "../../../../../../apps/riftbound-app/server/pregame";
import { type GameSession, getInternalSnapshot } from "../../../../../../apps/riftbound-app/server/state";

const CHEM_BARONESS = "sfd-201-221";
const BOTTLED_CONSTELLATION = "ven-067-166";
const ASPIRANTS_CLIMB = "ogn-276-298";
const GOLD_TOKEN = "sfd-t03";

let seq = 0;

/** A Bo3 where P1 presents Aspirant's Climb first and runs Chem-Baroness as their legend. */
function newBo3(): { gameId: string; session: GameSession } {
  const gameId = `continue-vs-rematch-${++seq}`;
  const p1 = {
    ...buildDefaultDeck("mind", "order"),
    battlefieldIds: [ASPIRANTS_CLIMB, "ogn-275-298", "ogn-277-298"],
    legendId: CHEM_BARONESS,
    sideboardCardIds: ["ogn-005-298"],
  };
  const p2 = {
    ...buildDefaultDeck("calm", "fury"),
    battlefieldIds: ["ogn-279-298", "ogn-280-298", "ogn-281-298"],
    sideboardCardIds: ["ogn-058-298"],
  };
  return {
    gameId,
    session: createGameFromDecks(p1, p2, gameId, {
      gameMode: "match",
      initiative: { kind: "roll" },
      names: { [P1]: "Alice", [P2]: "Bob" },
      sandbox: false,
    }),
  };
}

/** Walk the pregame to a live game, presenting each seat's first still-available battlefield. */
function playOut(session: GameSession, first: string = P1, stopAt?: string): void {
  for (let i = 0; i < 12 && session.pregame; i++) {
    const pg = session.pregame;
    if (stopAt && pg.phase === stopAt) {
      return;
    }
    if (pg.phase === "battlefield_select") {
      for (const seat of [P1, P2]) {
        if (pg.battlefieldSelections[seat]) {
          continue;
        }
        const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id));
        selectBattlefield(session, seat, free);
      }
    } else if (pg.phase === "sideboard") {
      for (const seat of [P1, P2]) {
        lockSideboard(session, seat);
      }
    } else if (pg.phase === "initiative") {
      chooseFirstPlayer(session, pg.initiative?.chooser as string, first);
    } else {
      pg.mulliganComplete.add(P1);
      pg.mulliganComplete.add(P2);
      finalizePregame(session);
    }
  }
}

function cardsIn(session: GameSession, zone: string, owner?: string): string[] {
  const cards = getInternalSnapshot(session.engine).cards;
  return Object.entries(cards)
    .filter(([, c]) => c.zone === zone && (owner === undefined || c.owner === owner))
    .map(([id]) => id);
}

/** Activate a Gold token with `points` banked and, optionally, Aspirant's Climb on the board. */
async function goldAdd(points: number, withClimb: boolean): Promise<{ energy: number; power: Record<string, number> }> {
  let s = scenario()
    .victoryScore(8)
    .points(P1, points)
    .legend(P1, CHEM_BARONESS, "baroness")
    .gear(P1, GOLD_TOKEN, "gold")
    .resources(P1, { energy: 0 });
  s = withClimb
    ? s.battlefield("bf1", { controller: null, def: ASPIRANTS_CLIMB, inert: false })
    : s.battlefield("bf1", { controller: null });
  const game = await s.build();
  expect(game.state("gold").isToken).toBe(true);
  await game.p1.activate("gold");
  await game.settle({ policy: "first" });
  expect(game.zoneOf("gold")).toBe("gone"); // "Kill this" is the cost — the token ceases to exist (186.1)
  const r = game.p1.resources();
  return { energy: r.energy, power: { ...(r.power as Record<string, number>) } };
}

describe("Continue to game 2 vs Rematch: what resets, and the Victory-Score threshold that moves with it", () => {
  // ---- 1 / 4: the Baroness threshold is computed from the EFFECTIVE Victory Score ---------------

  test("with Aspirant's Climb in play the Victory Score is 9, so the Gold bonus turns on at 6 — not at 5 (194.3.a, 486.3)", async () => {
    expect(await goldAdd(5, true)).toEqual({ energy: 0, power: { rainbow: 1 } }); // 9 − 5 = 4 > 3
    expect(await goldAdd(6, true)).toEqual({ energy: 1, power: { rainbow: 1 } }); // 9 − 6 = 3 ≤ 3
  });

  test("without the Climb the same legend flips one point earlier, at 5 — the threshold is derived from the board, never cached", async () => {
    expect(await goldAdd(4, false)).toEqual({ energy: 0, power: { rainbow: 1 } }); // 8 − 4 = 4 > 3
    expect(await goldAdd(5, false)).toEqual({ energy: 1, power: { rainbow: 1 } }); // 8 − 5 = 3 ≤ 3
  });

  // ---- 2: the game-over box ---------------------------------------------------------------------

  test("game 1 over: the box knows the winner and the match score (1–0) and the match is NOT decided, so Continue is the path and Rematch is refused", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    expect(session.engine.getState().status).toBe("playing");
    expect(Object.keys(session.engine.getState().battlefields ?? {})).toContain(`${P1}-bf-${ASPIRANTS_CLIMB}`);

    expect(concedeGame(session, gameId, P2)).toEqual({ ok: true });
    const summary = matchSummary(session);
    expect(summary.current).toMatchObject({ concededBy: P2, finished: true, reason: "concede", winner: P1 });
    expect(summary.score).toEqual({ [P1]: 1, [P2]: 0 });
    expect(summary).toMatchObject({ decided: false, format: "bo3", gameNumber: 1, winsNeeded: 2 });
    // No rematch path exists while the match is live.
    expect(voteRematch(session, gameId, P1)).toMatchObject({ errorCode: "MATCH_NOT_OVER", ok: false });
  });

  // ---- 3: Continue = a full GAME reset, with the MATCH score preserved --------------------------

  test("Continue to game 2 (486.6): a brand-new engine — nothing in play, empty trash, no chain, 0 points and 0 XP, and the legend back unexhausted", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    const engine1 = session.engine;
    // Dirty the game-1 state the way a real game 1 ends.
    session.engine.applyPatches([
      { op: "replace", path: ["players", P1, "victoryPoints"], value: 6 },
      { op: "replace", path: ["players", P1, "xp"], value: 4 },
    ]);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    expect(session.gameNumber).toBe(2);
    playOut(session, P1);

    expect(session.engine).not.toBe(engine1); // the old game is freed, not patched in place
    const state = session.engine.getState();
    expect(state.status).toBe("playing");
    for (const seat of [P1, P2]) {
      expect((state.players?.[seat] as { victoryPoints?: number } | undefined)?.victoryPoints ?? 0).toBe(0);
      expect((state.players?.[seat] as { xp?: number } | undefined)?.xp ?? 0).toBe(0);
      expect(cardsIn(session, "base", seat)).toEqual([]); // no Gold token, no unit survived
      expect(cardsIn(session, "trash", seat)).toEqual([]);
    }
    expect(cardsIn(session, "chain")).toEqual([]);
    expect(state.interaction?.chain?.active ?? false).toBe(false);
    // No card of the game-1 Gold token definition exists anywhere in game 2.
    const defs = Object.values(getInternalSnapshot(session.engine).cards).map((c) => c.definitionId);
    expect(defs).not.toContain(GOLD_TOKEN);
    // The legend is back, ready.
    const legend = cardsIn(session, "legendZone", P1);
    expect(legend).toEqual([`${P1}-legend-${CHEM_BARONESS}`]);
    expect(getInternalSnapshot(session.engine).cardMetas[legend[0] as string]?.exhausted ?? false).toBe(false);
  });

  test("Continue deals fresh hands: 4 each at the mulligan window (116/117), and the MATCH score survives as 1–0", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);

    // The sideboard window comes first in game 2 (both decks registered one), and hands are dealt only
    // once the first player has been named.
    playOut(session, P1, "mulligan");
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.handsDrawn).toBe(true);
    expect(cardsIn(session, "hand", P1)).toHaveLength(4);
    expect(cardsIn(session, "hand", P2)).toHaveLength(4);
    expect(matchSummary(session).score).toEqual({ [P1]: 1, [P2]: 0 });
  });

  test("Continue rotates the battlefield pool (486.5): the game-1 battlefields — Aspirant's Climb among them — are excluded from game 2, so the Baroness's threshold really is recomputed", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);

    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.battlefieldExcluded?.[P1]).toEqual([ASPIRANTS_CLIMB]);
    expect(session.pregame?.battlefieldExcluded?.[P2]).toHaveLength(1);
    expect(session.pregame?.battlefieldOptions[P1]).toEqual([ASPIRANTS_CLIMB, "ogn-275-298", "ogn-277-298"]);

    playOut(session, P1);
    const bfs = Object.keys(session.engine.getState().battlefields ?? {});
    expect(bfs).not.toContain(`${P1}-bf-${ASPIRANTS_CLIMB}`);
    expect(bfs).toHaveLength(2);
  });

  // ---- 5: once decided, Continue is gone and Rematch resets the MATCH ---------------------------

  test("match decided: Continue is refused and Rematch restarts at game 1 with 0–0 and the FULL battlefield pool (486.5's removal is scoped to the finished match)", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    playOut(session, P1);
    concedeGame(session, gameId, P2); // 2–0
    const decided = matchSummary(session);
    expect(decided).toMatchObject({ decided: true, gameNumber: 2, winner: P1 });
    expect(decided.score).toEqual({ [P1]: 2, [P2]: 0 });
    expect(decided.games).toEqual([{ concededBy: P2, gameNumber: 1, reason: "concede", winner: P1 }]);

    expect(voteContinue(session, gameId, P1)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });

    expect(voteRematch(session, gameId, P1)).toEqual({ ok: true });
    expect(session.gameNumber).toBe(2); // still waiting on the second seat
    expect(voteRematch(session, gameId, P2)).toEqual({ ok: true });

    expect(session.gameNumber).toBe(1);
    const fresh = matchSummary(session);
    expect(fresh).toMatchObject({ decided: false, gameNumber: 1, games: [] });
    expect(fresh.score).toEqual({ [P1]: 0, [P2]: 0 });
    expect(fresh.usedBattlefields).toEqual({});
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
    expect(session.pregame?.battlefieldOptions[P1]).toEqual([ASPIRANTS_CLIMB, "ogn-275-298", "ogn-277-298"]);
    expect(session.pregame?.initiative).toMatchObject({ chooser: null, decided: false, kind: "roll" });
  });

  test("nothing of the finished match is left behind the new pregame: no board, no score, and the session is immediately usable again", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    playOut(session, P1);
    concedeGame(session, gameId, P2);
    voteRematch(session, gameId, P1);
    voteRematch(session, gameId, P2);

    expect(session.engine.getState().status).not.toBe("finished");
    expect(Object.keys(session.engine.getState().battlefields ?? {})).toEqual([]);
    for (const seat of [P1, P2]) {
      expect(cardsIn(session, "base", seat)).toEqual([]);
      expect(cardsIn(session, "trash", seat)).toEqual([]);
      expect((session.engine.getState().players?.[seat] as { victoryPoints?: number } | undefined)?.victoryPoints ?? 0).toBe(0);
    }
    // …and the fresh match plays straight through.
    playOut(session, P1);
    expect(session.engine.getState().status).toBe("playing");
    expect(session.gameNumber).toBe(1);
  });

  // ---- 7: concede is reachable at every step; the Constellation stays an offer -------------------

  test("650: concede-the-match is available in a live game and refused only once the match is already over; conceding a game before it starts is refused with a pointer to conceding the match", async () => {
    const { gameId, session } = newBo3();
    expect(session.pregame).toBeDefined();
    expect(concedeGame(session, gameId, P1)).toMatchObject({ errorCode: "GAME_NOT_STARTED", ok: false });

    playOut(session);
    expect(concedeMatch(session, gameId, P2)).toEqual({ ok: true });
    expect(matchSummary(session)).toMatchObject({ concededBy: P2, decided: true, winner: P1 });
    expect(concedeMatch(session, gameId, P1)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });
    expect(voteContinue(session, gameId, P1)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });
    expect(voteRematch(session, gameId, P1)).toEqual({ ok: true }); // the rematch path is the way out
  });

  test("Bottled Constellation's start-of-Main-Phase kill is a declinable prompt, never forced (355.8 / 358.3.a)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, CHEM_BARONESS, "baroness")
      .gear(P1, BOTTLED_CONSTELLATION, "bottle")
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .unit(P1, "base", { might: 1, name: "B" }, "b")
      .gear(P1, GOLD_TOKEN, "gold")
      .build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect((game.decision() as { soleOption?: true }).soleOption).toBeUndefined();

    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.zoneOf("gold")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.state("baroness").isExhausted).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
