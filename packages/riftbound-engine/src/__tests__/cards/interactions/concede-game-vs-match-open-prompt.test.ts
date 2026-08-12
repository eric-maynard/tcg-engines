/**
 * Interaction: conceding out of THREE different open prompt states, and the two different things
 * "concede" can mean in a Bo3.
 *
 *   Renata Glasc, Mastermind (sfd-088-221) · Champion Unit · Mind · 5 · 4 Might —
 *     "[1][mind]: Draw 1. / [4][mind][mind][mind][mind], [Exhaust]: Score 1 point. /
 *      Use my abilities only while I'm at a battlefield."   → the activated-ability choice modal
 *   Bottled Constellation (ven-067-166) · Gear · Mind · 10 + [mind][mind] —
 *     "At the start of your Main Phase, you may kill 3 other friendly units and/or gear to score
 *      1 point."                                            → an optional "you may" prompt
 *   Cleave (ogn-004-298) · Spell · Fury · 1 — "Give a unit [Assault 3] this turn."
 *                                                           → a targeting banner
 *
 * Question: from each of those open states, is conceding still reachable, and does the app tell the
 * two concessions apart — conceding THE GAME (game 2 goes to the opponent, the match runs on) versus
 * conceding THE MATCH (the whole match ends, no Continue)? And may either path leave a
 * half-finalized spell or an orphaned prompt behind?
 *
 * Expected: (1) a player may concede at ANY time (650) — each of the three states advertises
 * `concede` in the seat's own action list and takes it. (2) In a Bo3 the two destructive actions are
 * distinct app messages, `concede_game` and `concede_match`; in a Bo1 only one is meaningful (485.6).
 * (3) Conceding the GAME removes the conceder and the sole remaining player wins that game
 * (651 / 651.1 / 196). 652's Removal-of-a-Player steps — including 652.4's "counter the conceder's
 * spells" — are conditional on the game CONTINUING, which in a duel it does not: the chain freezes
 * exactly as it stood, uncountered and unresolved, and no seat is handed a decision. (4) Game 3 then
 * follows 486.5: every battlefield used in a game somebody won is excluded from the next picker.
 * (5) Conceding the MATCH decides it: no continue vote is accepted afterwards. (6) None of the three
 * prompts is ever unanswerable — the "you may" always has a decline, the targeting selection commits
 * nothing until it is submitted, and an unaffordable ability is not offered at all (355.8 / 358.3.a).
 *
 * Rules: 650, 651, 651.1, 652.4, 486.5, 486.6, 355.8, 358.3.a. The match-level facets exercise the
 * app's own match layer (`server/match.ts`) — the Core Rules have no "concede the match" button.
 */
import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { concedeGame, concedeMatch, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { chooseFirstPlayer, createGameFromDecks, finalizePregame, lockSideboard, selectBattlefield } from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession, WsData } from "../../../../../../apps/riftbound-app/server/state";

const RENATA = "sfd-088-221";
const BOTTLED_CONSTELLATION = "ven-067-166";
const CLEAVE = "ogn-004-298";
/** Renata's second printed ability: "[4][mind]x4, [Exhaust]: Score 1 point." */
const SCORE_ABILITY = 1;

// ---------------------------------------------------------------------------
// (1) / (6) the three open states, at the engine surface the app's UI is built on
// ---------------------------------------------------------------------------

/**
 * P2 is about to end the turn. P1 holds bf1 with Renata, controls Bottled Constellation plus three
 * spare bodies to feed it, and holds Cleave. Ending P2's turn walks P1 into their Main Phase, where
 * the Constellation's "you may" is the first thing on screen.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RENATA, "renata")
    .gear(P1, BOTTLED_CONSTELLATION, "bottle")
    .unit(P1, "base", { might: 1, name: "Spare One" }, "spare1")
    .unit(P1, "base", { might: 1, name: "Spare Two" }, "spare2")
    .unit(P1, "base", { might: 1, name: "Spare Three" }, "spare3")
    .unit(P2, "base", { might: 2, name: "Their Body" }, "theirs")
    .rune(P1, "mind", { alias: "mindRune" })
    .hand(P1, CLEAVE, "cleave");
}

/** Drive to P1's Main Phase with the Constellation's optional prompt open. */
async function atOptionalPrompt(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.phase()).toBe("main");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bottle" }, timing: "FIN" });
  return game;
}

/** Decline the Constellation and stock the pool: P1's open Main Phase with everything affordable. */
async function atOpenMain(): Promise<Game> {
  const game = await atOptionalPrompt();
  await game.p1.no();
  await game.p1.do("addResources", { energy: 9, power: { fury: 1, mind: 5 } });
  return game;
}

describe("(1) concede is reachable from every open state (rule 650)", () => {
  test("(b) the optional 'you may kill 3 … to score 1 point' prompt: it advertises concede in its own actions, it always has a decline, and conceding from it ends the game with nothing killed and no point scored", async () => {
    const game = await atOptionalPrompt();
    const decision = game.decision();
    expect(decision?.actions?.map((a) => a.moveId)).toContain("concede");
    expect(decision).toMatchObject({ canAccept: true, kind: "yes-no" }); // 358.3.a — answerable either way

    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.decision()).toBeNull(); // no orphaned prompt is left on screen
    expect(game.p1.base()).toEqual(expect.arrayContaining(["spare1", "spare2", "spare3", "bottle"]));
    expect(game.violations()).toEqual([]);
  });

  test("(a) Renata's activated-ability choice: while BOTH abilities sit in the menu the concede action sits beside them, and taking it leaves Renata ready with the pool untouched (nothing half-paid)", async () => {
    const game = await atOpenMain();
    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).toEqual(expect.arrayContaining(["activateAbility:renata#0", `activateAbility:renata#${SCORE_ABILITY}`, "concede:-"]));

    const resources = game.p1.resources();
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.state("renata").isExhausted).toBe(false); // the [Exhaust] cost was never paid
    expect(game.p1.resources()).toEqual(resources);
    expect(game.chain()).toEqual([]);
  });

  test("(a) concede is still there once Renata's ability is finalized and priority is passing — and the chain FREEZES: 652.4 counters nothing, because 652 only runs 'if the game continues' (651.1 / 196)", async () => {
    const game = await atOpenMain();
    await game.p1.activate("renata", SCORE_ABILITY);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()?.options?.map((o) => o.moveId)).toContain("concede");

    const points = game.p1.points();
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(points); // the finalized Score item never resolved
    // DESIGN (652 / 652.4): the Removal-of-a-Player steps — including "counter the conceder's
    // spells" — run only IF THE GAME CONTINUES, which in a duel it does not. So the item is neither
    // countered nor resolved: the chain freezes exactly as it stood, and the game-over overlay is
    // what clears it from the screen. Same settled reading as
    // concede-with-play-trigger-unfinalized.test.ts.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", countered: false })]);
    expect(game.decision()).toBeNull();
    expect(game.actingSeat()).toBeUndefined();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) Cleave's targeting: the banner's own contents (both legal targets) are readable without committing anything, concede sits in the same menu, and conceding from there leaves Cleave IN HAND with an empty chain", async () => {
    const game = await atOpenMain();
    const targets = game.p1.option("cast", "cleave")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.flatMap((v) => (Array.isArray(v) ? v : [v]))).toEqual(expect.arrayContaining(["renata", "theirs"]));
    const hash = game.stateHash();
    expect(game.p1.legal().map((o) => o.key)).toContain("concede:-");
    expect(game.stateHash()).toBe(hash); // reading the banner commits nothing (358.3.a — cancel is free)

    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.zoneOf("cleave")).toBe("hand"); // no half-finalized spell
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toBeNull();
  });

  test("(6) an unpayable cost is never presented: with the pool short, Renata's Score ability is absent from the menu while concede and the affordable Draw stay (355.8), and one recycle brings it back", async () => {
    const game = await atOptionalPrompt();
    await game.p1.no();
    await game.p1.do("addResources", { energy: 9, power: { mind: 3 } });
    const short = game.p1.legal().map((o) => o.key);
    expect(short).toContain("activateAbility:renata#0");
    expect(short).not.toContain(`activateAbility:renata#${SCORE_ABILITY}`);
    expect(short).toContain("concede:-");

    await game.p1.recycleRune("mindRune", "mind"); // 429.3 — an [Add] inside the open state
    expect(game.p1.legal().map((o) => o.key)).toContain(`activateAbility:renata#${SCORE_ABILITY}`);
  });
});

// ---------------------------------------------------------------------------
// (2)–(5) the app's match layer: concede_game vs concede_match in game 2 of a Bo3
// ---------------------------------------------------------------------------

const P1_DECK = { ...buildDefaultDeck(), battlefieldIds: ["ogn-276-298", "ogn-290-298", "ogn-284-298"] };
const P2_DECK = { ...buildDefaultDeck("calm", "mind"), battlefieldIds: ["ogn-275-298", "ogn-277-298", "ogn-279-298"] };

interface Frame { type: string; match?: ReturnType<typeof matchSummary> }

let seq = 0;

/** A two-human Bo3 session with a fake socket per seat capturing every broadcast frame. */
function newMatch() {
  const gameId = `concede-open-prompt-${++seq}`;
  const session = createGameFromDecks(P1_DECK, P2_DECK, gameId, {
    gameMode: "match",
    initiative: { kind: "roll" as const },
    names: { [P1]: "Alice", [P2]: "Bob" },
    sandbox: false,
  });
  const seats = Object.fromEntries([P1, P2].map((pid) => {
    const frames: Frame[] = [];
    const ws = {
      close: () => undefined,
      data: { connId: `${pid}-${gameId}`, gameId, playerId: pid },
      send: (s: string) => { frames.push(JSON.parse(s) as Frame); },
    } as unknown as ServerWebSocket<WsData>;
    session.clients.set(`${pid}-${gameId}`, { playerId: pid, ws });
    return [pid, { frames, last: (t?: string) => [...frames].reverse().find((f) => !t || f.type === t) }];
  })) as Record<string, { frames: Frame[]; last: (t?: string) => Frame | undefined }>;
  return { gameId, seats, session };
}

/** Drive the current pregame to a playing game; `first` is the seat the chooser puts first. */
function playOut(session: GameSession, first: string = P1): void {
  for (let i = 0; i < 10 && session.pregame; i++) {
    const pg = session.pregame;
    if (pg.phase === "battlefield_select") {
      for (const seat of [P1, P2]) {
        if (pg.battlefieldSelections[seat]) { continue; }
        const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id));
        selectBattlefield(session, seat, free);
      }
    } else if (pg.phase === "sideboard") {
      for (const seat of [P1, P2]) { lockSideboard(session, seat); }
    } else if (pg.phase === "initiative") {
      chooseFirstPlayer(session, pg.initiative?.chooser as string, first);
    } else {
      pg.mulliganComplete.add(P1);
      pg.mulliganComplete.add(P2);
      finalizePregame(session);
    }
  }
}

/** Game 1: P1 concedes, so P2 leads 1–0 and game 2 is live. */
function atGameTwo() {
  const m = newMatch();
  playOut(m.session);
  expect(concedeGame(m.session, m.gameId, P1)).toEqual({ ok: true });
  expect(voteContinue(m.session, m.gameId, P1)).toEqual({ ok: true });
  expect(voteContinue(m.session, m.gameId, P2)).toEqual({ ok: true });
  playOut(m.session, P1);
  expect(m.session.gameNumber).toBe(2);
  expect(m.session.engine.getState().status).toBe("playing");
  expect(matchSummary(m.session)).toMatchObject({ decided: false, score: { [P1]: 0, [P2]: 1 } });
  return m;
}

describe("(2)–(5) concede_game vs concede_match in game 2 of a Bo3", () => {
  test("(3) concede_game in game 2: the game goes to the opponent, the match is level at 1–1 and NOT decided, and both seats get the game_over interstitial rather than a match result", async () => {
    const { gameId, seats, session } = atGameTwo();
    expect(concedeGame(session, gameId, P2)).toEqual({ ok: true });

    expect(session.engine.getState().status).toBe("finished");
    const summary = matchSummary(session);
    expect(summary).toMatchObject({
      current: { concededBy: P2, finished: true, reason: "concede", winner: P1 },
      decided: false,
      score: { [P1]: 1, [P2]: 1 },
    });
    expect(summary.winner).toBeUndefined();
    expect(seats[P1]?.last("game_over")?.match).toMatchObject({ decided: false, score: { [P1]: 1, [P2]: 1 } });
    expect(seats[P2]?.last("game_over")).toBeDefined();
    expect(seats[P1]?.frames.some((f) => f.type === "match_over")).toBe(false);
  });

  test("(4) 486.5 — game 3's picker excludes every battlefield used in games somebody won: after two decided games each seat has exactly one selectable option left", async () => {
    const { gameId, session } = atGameTwo();
    concedeGame(session, gameId, P2);
    expect(voteContinue(session, gameId, P1)).toEqual({ ok: true });
    expect(voteContinue(session, gameId, P2)).toEqual({ ok: true });
    expect(session.gameNumber).toBe(3);

    const excluded = session.pregame?.battlefieldExcluded ?? {};
    expect(excluded[P1]).toHaveLength(2);
    expect(excluded[P2]).toHaveLength(2);
    for (const seat of [P1, P2]) {
      const options = session.pregame?.battlefieldOptions[seat] ?? [];
      expect(options).toHaveLength(3); // still listed, just not selectable
      expect(options.filter((id) => !(excluded[seat] ?? []).includes(id))).toHaveLength(1);
      expect(selectBattlefield(session, seat, (excluded[seat] ?? [])[0])).toMatchObject({ ok: false });
    }
  });

  test("(5) concede_match from the same position: no continue path — the match is decided for the opponent, a match_over frame is broadcast, and voteContinue is refused with MATCH_OVER", async () => {
    const { gameId, seats, session } = atGameTwo();
    expect(concedeMatch(session, gameId, P1)).toEqual({ ok: true });

    expect(session.engine.getState().status).toBe("finished"); // the running game is conceded too
    expect(session.match?.concededBy).toBe(P1);
    expect(session.match?.continueVotes).toEqual([]);
    expect(matchSummary(session)).toMatchObject({ concededBy: P1, decided: true, winner: P2 });
    expect(seats[P1]?.last("match_over")?.match).toMatchObject({ concededBy: P1, decided: true, winner: P2 });
    expect(voteContinue(session, gameId, P2)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });
    expect(session.pregame).toBeUndefined(); // game 3 is never built
  });

  test("(2) the two buttons are genuinely different actions: after a conceded GAME the match lives on and concede_match is still available, while a second concede_game is refused with GAME_OVER", async () => {
    const { gameId, session } = atGameTwo();
    expect(concedeGame(session, gameId, P2)).toEqual({ ok: true });
    expect(matchSummary(session).decided).toBe(false);
    expect(concedeGame(session, gameId, P2)).toMatchObject({ errorCode: "GAME_OVER", ok: false });
    expect(concedeGame(session, gameId, P1)).toMatchObject({ errorCode: "GAME_OVER", ok: false });

    expect(concedeMatch(session, gameId, P2)).toEqual({ ok: true });
    expect(matchSummary(session)).toMatchObject({ concededBy: P2, decided: true, winner: P1 });
    expect(concedeMatch(session, gameId, P2)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });
  });
});
