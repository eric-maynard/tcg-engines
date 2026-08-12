/**
 * Interaction: the vs-Claude seat and concession — the one action the AI's action space deliberately
 * does not contain, and what happens when the HUMAN takes it while the model is thinking.
 *
 *   Kai'Sa, Survivor (ogn-039-298) · Unit · Fury · 4 · 4 Might — "[Accelerate] … When I conquer, draw 1."
 *   Aspirant's Climb (ogn-276-298) · Battlefield — "Increase the points needed to win the game by 1."
 *   Hidden Blade (ogn-213-298) · Spell · Order — the facedown card Claude controls.
 *
 * Question: Aspirant's Climb is in play (Victory Score 9). The Claude seat is mid-turn, one Conquer
 * away from 9 with Kai'Sa, and controls a facedown Hidden Blade; a model call is in flight.
 *   (a) Is `concede` ever present in the AI's menu? Rule 650 lets ANY player concede at any time — so
 *       this pins the app's deliberate answer: a Claude seat never scoops itself, and the human's
 *       concede is the only concession path in a vs-Claude game.
 *   (b) The human concedes the GAME while the model is thinking: does the driver leave the finished
 *       game untouched, stop the segment, clear the thinking flag and push a final per-seat frame
 *       plus game_over — or does it apply a move into a finished engine and leave a stale board?
 *   (c) At game end, is Claude's facedown Hidden Blade revealed to the human while Claude's HAND
 *       stays redacted?
 *   (d) In a Bo3, is this a GAME concession and not a match concession?
 *
 * Expected: (a) `buildSeatMenu` skips `option.moveId === "concede"` outright, so no PromptBundle ever
 * offers it and no `choose` index can map to it; `goldfishFallbackMove` never emits it either (its
 * ladder is resolvePendingChoice / passChainPriority / passShowdownFocus / startShowdown / conquer /
 * endTurn). 650 permits a concession — the driver's action space excludes it by construction, which
 * is what stops a stalled model from resigning the human's practice game. (b) Concession removes the
 * conceding player immediately (651 / 651.3) and the sole remaining player wins (651.1), so the game
 * ends at once (196) and Kai'Sa's pending conquer never scores. `aiSeatMustAct` returns false the
 * moment `status !== "playing"`, so the segment's loop exits; the answer the model produced for the
 * live position is refused by the engine and NOTHING is appended to the replay history; `act()`'s
 * finally clears `thinking` and broadcasts `ai_status`; the human's frames carry the finished game
 * with the Claude seat as winner. (c) 421.4 — when the game ends a facedown card's owner reveals it
 * to all players, so the human's snapshot names Hidden Blade; the hand is not covered by 421.4 and
 * stays Private (128.4). (d) The app's concede_game path ends the GAME: matchSummary is 0–1 with the
 * match live, and 486.5 removes the battlefields used in the won game from the next game's options.
 *
 * Rules: 650, 651, 651.1, 651.3, 652.4, 196, 421.4, 128.4, 486.5.
 */
import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";
import type { PlayerId } from "../../../types/game-state";
import type { CallModel, ModelRequest } from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { ClaudeOpponent, aiSeatMustAct, buildSeatMenu, goldfishFallbackMove } from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { concedeGame, concedeMatch, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { chooseFirstPlayer, createGameFromDecks, finalizePregame, lockSideboard, selectBattlefield } from "../../../../../../apps/riftbound-app/server/pregame";
import { buildGameSnapshot } from "../../../../../../apps/riftbound-app/server/snapshot";
import type { GameSession, WsData } from "../../../../../../apps/riftbound-app/server/state";

const KAISA = "ogn-039-298";
const ASPIRANTS_CLIMB = "ogn-276-298";
const HIDDEN_BLADE = "ogn-213-298";

const FAST = { backoffMs: 0, lookupTools: [], pacingMs: 0, timeoutMs: 2000 } as const;

interface Rig {
  readonly frames: { type: string }[];
  readonly game: Game;
  readonly session: GameSession;
}

/**
 * Claude (player-2) is the turn player on 8 points with Kai'Sa standing on an unheld Aspirant's Climb
 * — one Conquer from the raised Victory Score of 9 — plus a facedown Hidden Blade and one hand card.
 * The human (player-1) is connected on a fake socket that records every frame.
 */
async function rig(): Promise<Rig> {
  const game = await scenario()
    .turn(2)
    .active(P2)
    .points(P2, 8)
    .points(P1, 2)
    .resources(P2, { energy: 5, power: { fury: 2 } })
    .battlefield("climb", { controller: null, def: ASPIRANTS_CLIMB, inert: false })
    .unit(P2, "climb", KAISA, "kaisa")
    .facedown(P2, "climb", HIDDEN_BLADE, "cBlade")
    .hand(P2, HIDDEN_BLADE, "cHand")
    .unit(P1, "base", { might: 2, name: "Human Guard" }, "guard")
    .build();
  const frames: { type: string }[] = [];
  const session = {
    clients: new Map(),
    engine: game.engine as unknown as GameSession["engine"],
    gameMode: "match" as const,
    log: [],
    players: [P1, P2],
    playerNames: { [P1]: "Human", [P2]: "Claude" },
    sandbox: true,
    seq: 0,
  } as GameSession;
  const ws = {
    close: () => undefined,
    data: { connId: "human", gameId: "claude-concede", playerId: P1 },
    send: (raw: string) => frames.push(JSON.parse(raw) as { type: string }),
  } as unknown as ServerWebSocket<WsData>;
  session.clients.set("human", { playerId: P1, ws });
  return { frames, game, session };
}

describe("(a) the Claude seat's action space excludes concede (rule 650 permits it; the driver does not offer it)", () => {
  test("buildSeatMenu drops it: the engine's own legal list for that seat DOES carry concede, the AI's numbered menu never does", async () => {
    const { game, session } = await rig();
    expect(game.p2.legal().map((o) => o.key)).toContain("concede:-"); // 650 — legal at any time
    const menu = buildSeatMenu(session, P2).items;
    expect(menu.map((it) => it.label)).toEqual(expect.arrayContaining(["Conquer climb", "End turn"]));
    expect(menu.some((it) => /concede/i.test(it.label))).toBe(false);
    expect(menu.flatMap((it) => it.moves).some((m) => m.moveId === "concede")).toBe(false);
  });

  test("goldfishFallbackMove never emits it either — its ladder answers with Conquer here and End turn once nothing else is left", async () => {
    const { session } = await rig();
    expect(goldfishFallbackMove(session, P2)).toMatchObject({ moveId: "conquerBattlefield" });
    expect(goldfishFallbackMove(session, P2)?.moveId).not.toBe("concede");
  });

  test("across a whole AI turn, no PromptBundle the model ever sees contains a concede entry", async () => {
    const { session } = await rig();
    const menus: string[][] = [];
    const callModel: CallModel = async (request: ModelRequest) => {
      menus.push((request.meta.menu ?? []).map((it) => it.label));
      const endTurn = request.meta.menu?.find((it) => /End turn/.test(it.label));
      return { input: { index: endTurn?.index ?? 0, rationale: "wrap up" }, name: "choose" };
    };
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel });
    session.opponent = ai;
    await ai.act(session);
    expect(menus.length).toBeGreaterThan(0);
    for (const menu of menus) {
      expect(menu.some((label) => /concede/i.test(label))).toBe(false);
    }
    expect(session.engine.getState().turn.activePlayer).toBe(P1); // it ended the turn instead
  });
});

describe("(b) the human concedes the GAME while the model is thinking", () => {
  /** Run one AI segment whose model call concedes for the human before answering. */
  async function concedeMidThought(): Promise<Rig & { calls: number; historyAtConcede: number; ai: ClaudeOpponent }> {
    const r = await rig();
    let calls = 0;
    let historyAtConcede = -1;
    const callModel: CallModel = async (request: ModelRequest) => {
      calls++;
      if (calls === 1) {
        expect((r.session.opponent as ClaudeOpponent).thinking).toBe(true);
        expect(concedeGame(r.session, "claude-concede", P1)).toEqual({ ok: true });
        historyAtConcede = r.session.engine.getReplayHistory().length;
      }
      const conquer = request.meta.menu?.find((it) => /Conquer/.test(it.label)) ?? request.meta.menu?.[0];
      return { input: { index: conquer?.index ?? 0, rationale: "take the point" }, name: "choose" };
    };
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel, gameId: "claude-concede" });
    r.session.opponent = ai;
    await ai.act(r.session);
    return { ...r, ai, calls, historyAtConcede };
  }

  test("the in-flight answer is never applied: the replay history is byte-for-byte what the concession left, no 🤖 action line is logged, and the driver stops", async () => {
    const { ai, historyAtConcede, session } = await concedeMidThought();
    expect(session.engine.getReplayHistory().length).toBe(historyAtConcede);
    expect(aiSeatMustAct(session, P2)).toBe(false);
    expect(ai.busy).toBe(false);
    expect(ai.thinking).toBe(false); // act()'s finally cleared it and re-broadcast ai_status
    expect(session.log.some((e) => /^🤖 .*Conquer/u.test(e.text))).toBe(false);
  });

  test("651 / 651.1 / 196 — the sole remaining player wins at once and Kai'Sa's pending conquer never scores: Claude ends on 8 under a Victory Score of 9, and the Climb is still unheld", async () => {
    const { game, session } = await concedeMidThought();
    expect(effectiveVictoryScore(game.gameState, P2 as PlayerId)).toBe(9); // 194.3.a
    expect(session.engine.getState().status).toBe("finished");
    expect(game.winner()).toBe(P2);
    expect(game.engine.getGameEndResult()).toEqual({ metadata: { concededBy: P1 }, reason: "concede", winner: P2 });
    expect(game.p2.points()).toBe(8); // never 9 — the conquer never happened
    expect(game.gameState.battlefields.climb?.controller).toBeNull();
    expect(game.p2.hand()).toContain("cHand"); // and no card was drawn for a conquer
    expect(game.violations()).toEqual([]);
  });

  test("the human is not left on a stale board: their socket gets the game_over frame and a final per-seat state_update, and the AI's thinking flag is broadcast down", async () => {
    const { frames } = await concedeMidThought();
    expect(frames.map((f) => f.type)).toContain("game_over");
    expect(frames.map((f) => f.type)).toContain("state_update");
    expect(frames.at(-1)?.type).toBe("ai_status");
    const gameOverAt = frames.findIndex((f) => f.type === "game_over");
    expect(frames.slice(gameOverAt).some((f) => f.type === "state_update")).toBe(true);
  });

  test("(c) 421.4 — at game end Claude's facedown Hidden Blade is named in the human's snapshot, while Claude's HAND stays redacted (128.4)", async () => {
    const { session } = await concedeMidThought();
    type ZoneCard = { definitionId: string; name: string; owner: string };
    const zones = (buildGameSnapshot(session, P1) as { zones: Record<string, ZoneCard[]> }).zones;
    expect(zones["facedown-climb"]).toEqual([
      expect.objectContaining({ definitionId: HIDDEN_BLADE, name: "Hidden Blade", owner: P2 }),
    ]);
    const claudeHand = (zones.hand ?? []).filter((c) => c.owner === P2);
    expect(claudeHand.length).toBeGreaterThan(0);
    for (const card of claudeHand) {
      expect(card).toMatchObject({ definitionId: "", name: "Hidden card" });
    }
  });

  test("(d) it is a GAME concession: the Bo3 record is 0–1 with the match still live and no match winner", async () => {
    const { session } = await concedeMidThought();
    expect(matchSummary(session)).toMatchObject({
      current: { concededBy: P1, finished: true, reason: "concede", winner: P2 },
      decided: false,
      format: "bo3",
      gameNumber: 1,
      score: { [P1]: 0, [P2]: 1 },
    });
    expect(matchSummary(session).winner).toBeUndefined();
  });

  test("(d) concede_match is the OTHER action, and it is the human's alone: it decides the match for Claude, while nothing in the AI's menu could have produced either", async () => {
    const r = await rig();
    expect(concedeMatch(r.session, "claude-concede", P1)).toEqual({ ok: true });
    expect(matchSummary(r.session)).toMatchObject({ concededBy: P1, decided: true, winner: P2 });
    expect(voteContinue(r.session, "claude-concede", P1)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });
    expect(buildSeatMenu(r.session, P2).items.some((it) => /concede/i.test(it.label))).toBe(false);
  });
});

describe("(d) 486.5 in a real vs-Claude Bo3: the conceded game's battlefields are gone for the next one", () => {
  test("after the human concedes game 1 and both continue, game 2's picker excludes each seat's used battlefield and the match is still 0–1", () => {
    const gameId = "claude-concede-bo3";
    const humanDeck = { ...buildDefaultDeck(), battlefieldIds: [ASPIRANTS_CLIMB, "ogn-290-298", "ogn-284-298"] };
    const claudeDeck = { ...buildDefaultDeck("calm", "mind"), battlefieldIds: ["ogn-275-298", "ogn-277-298", "ogn-279-298"] };
    const session = createGameFromDecks(humanDeck, claudeDeck, gameId, {
      gameMode: "match",
      initiative: { kind: "roll" as const },
      names: { [P1]: "Human", [P2]: "Claude" },
      sandbox: false,
    });
    session.opponent = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", {
      ...FAST,
      callModel: async () => ({ input: { index: 0, rationale: "n/a" }, name: "choose" }),
      gameId,
    });
    for (let i = 0; i < 10 && session.pregame; i++) {
      const pg = session.pregame;
      if (pg.phase === "battlefield_select") {
        for (const seat of [P1, P2]) {
          if (pg.battlefieldSelections[seat]) { continue; }
          selectBattlefield(session, seat, (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id)));
        }
      } else if (pg.phase === "sideboard") {
        for (const seat of [P1, P2]) { lockSideboard(session, seat); }
      } else if (pg.phase === "initiative") {
        chooseFirstPlayer(session, pg.initiative?.chooser as string, P1);
      } else {
        pg.mulliganComplete.add(P1);
        pg.mulliganComplete.add(P2);
        finalizePregame(session);
      }
    }
    expect(session.engine.getState().status).toBe("playing");

    expect(concedeGame(session, gameId, P1)).toEqual({ ok: true });
    expect(matchSummary(session)).toMatchObject({ decided: false, score: { [P1]: 0, [P2]: 1 } });
    expect(voteContinue(session, gameId, P1)).toEqual({ ok: true });
    expect(voteContinue(session, gameId, P2)).toEqual({ ok: true });
    expect(session.gameNumber).toBe(2);
    expect(session.match?.usedBattlefields).toEqual({ [P1]: [ASPIRANTS_CLIMB], [P2]: ["ogn-275-298"] });
    expect(session.pregame?.battlefieldExcluded).toEqual({ [P1]: [ASPIRANTS_CLIMB], [P2]: ["ogn-275-298"] });
    expect(selectBattlefield(session, P1, ASPIRANTS_CLIMB)).toMatchObject({ ok: false });
  });
});
