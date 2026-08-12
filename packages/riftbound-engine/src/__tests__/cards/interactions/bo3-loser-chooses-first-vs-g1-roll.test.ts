/**
 * Interaction: who decides what, in what order, in game 1 versus games 2–3 of a Bo3 — and does the
 * second player's extra rune follow the SEAT or the previous game's seating?
 *   The Arena's Greatest (ogn-290-298) · Battlefield — "At the start of each player's first Beginning
 *     Phase, that player gains 1 point."
 *   Obelisk of Power (ogn-284-298) · Battlefield — "At the start of each player's first Beginning
 *     Phase, that player channels 1 rune."
 *   Aspirant's Climb (ogn-276-298) · Battlefield — "Increase the points needed to win the game by 1."
 * P1 registers all three as its battlefields.
 *
 * Question:
 *   (a) Game 1 of a Bo3: does the initiative roll come before or after battlefields are presented,
 *       and who then names the first player?
 *   (b) Games 2–3: is there a roll at all, who chooses, and does the choice come before or after
 *       battlefield_select and the sideboard window?
 *   (c) Does 486.7's extra rune attach to whoever is put SECOND in this game, or to the seat that
 *       went second in game 1? And what does The Arena's Greatest make the choice worth?
 *   (d) What happens when game 1 ended with nobody winning, by concession, and on a Rematch?
 *
 * Rules: 115.1.a (the Mode of Play specifies how a First Player is determined), 115.1.b.1 (the First
 * Player is whoever becomes the Turn Player first), 485.5 (Duel: battlefields chosen at random),
 * 486.5 / 486.5.a (battlefields used in a game somebody won are removed; a game nobody won leaves them
 * available), 486.6 (Match: reset, re-present, first to two Game Wins), 486.7 (the player going second
 * channels one extra rune in their first Channel Phase), 194.1.c (points gained by a card effect are
 * not Scored points).
 *
 * The Core Rules are silent on who picks the First Player for games 2–3, so "the previous game's
 * LOSER chooses" is an organized-play convention the app owns (apps/riftbound-app/server/match.ts,
 * README §Match play) — it is asserted here explicitly rather than left implicit.
 */
import { describe, expect, test } from "bun:test";
import { Game, P1, P2, basicRuneDef, loadDefaultCardPool } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { concedeGame, voteContinue, voteRematch } from "../../../../../../apps/riftbound-app/server/match";
import { chooseFirstPlayer, createGameFromDecks, finalizePregame, lockSideboard, selectBattlefield } from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";

const ARENAS_GREATEST = "ogn-290-298";
const OBELISK_OF_POWER = "ogn-284-298";
const ASPIRANTS_CLIMB = "ogn-276-298";
const SHIPYARD_SKULKER = "ogn-175-298"; // vanilla 3-Might filler for the fromDecks boards

const BASE_DECK = buildDefaultDeck();
/** P1: the three battlefields under test, plus a registered sideboard so game 2 opens the window. */
const P1_DECK = {
  ...BASE_DECK,
  battlefieldIds: [ARENAS_GREATEST, OBELISK_OF_POWER, ASPIRANTS_CLIMB],
  sideboardCardIds: ["ogn-005-298", "ogn-008-298"],
};
const P2_DECK = {
  ...buildDefaultDeck("calm", "mind"),
  battlefieldIds: ["ogn-275-298", "ogn-277-298", "ogn-279-298"],
  sideboardCardIds: ["ogn-058-298", "ogn-064-298"],
};

let seq = 0;

function newBo3(): { gameId: string; session: GameSession } {
  const gameId = `bo3-first-player-${++seq}`;
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

/** Both seats present their first still-selectable battlefield. */
function presentBattlefields(session: GameSession): void {
  const pg = session.pregame;
  if (!pg) { return; }
  for (const seat of [P1, P2]) {
    if (pg.battlefieldSelections[seat]) { continue; }
    const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id));
    selectBattlefield(session, seat, free);
  }
}

/** Walk a pregame all the way to a playing game, putting `first` on the first turn. */
function playOut(session: GameSession, first: string = P1): void {
  for (let i = 0; i < 10 && session.pregame; i++) {
    const pg = session.pregame;
    if (pg.phase === "battlefield_select") {
      presentBattlefields(session);
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

describe("Bo3 first-player decision: game 1's roll vs games 2–3's loser-chooses", () => {
  // ---- (a) game 1 -------------------------------------------------------------------------------

  test("(a) game 1 presents battlefields FIRST — no roll has happened yet while the picker is open, and nobody sideboards before game 1", async () => {
    const { session } = newBo3();
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.initiative).toMatchObject({ chooser: null, decided: false, kind: "roll" });
    expect(session.pregame?.initiative?.p1Roll).toBeUndefined();
    expect(session.log.some((l) => /rolled a d20/.test(l.text))).toBe(false);
    expect(session.pregame?.sideboard).toBeUndefined(); // sideboarding is a between-games window
    expect(session.pregame?.battlefieldOptions[P1]).toEqual([ARENAS_GREATEST, OBELISK_OF_POWER, ASPIRANTS_CLIMB]);
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
  });

  test("(a) only once both battlefields are down is initiative rolled: both d20s are logged and the HIGHER roll becomes the chooser", async () => {
    const { session } = newBo3();
    presentBattlefields(session);
    expect(session.pregame?.phase).toBe("initiative");
    const ini = session.pregame?.initiative;
    expect(ini?.kind).toBe("roll");
    expect(typeof ini?.p1Roll).toBe("number");
    expect(typeof ini?.p2Roll).toBe("number");
    expect(ini?.p1Roll).not.toBe(ini?.p2Roll);
    expect(ini?.chooser).toBe((ini?.p1Roll as number) > (ini?.p2Roll as number) ? P1 : P2);
    expect(session.log.some((l) => /wins initiative \(\d+ vs \d+\)/.test(l.text))).toBe(true);
  });

  test("(a) the roll winner NAMES who takes the first turn — the roll is not itself the first turn (115.1.b.1) — and only that seat may answer; hands wait for the decision (rule 116 after 115)", async () => {
    const { session } = newBo3();
    presentBattlefields(session);
    const chooser = session.pregame?.initiative?.chooser as string;
    const other = chooser === P1 ? P2 : P1;
    expect(session.pregame?.handsDrawn).toBe(false);

    expect(chooseFirstPlayer(session, other, other)).toMatchObject({ ok: false });
    // The chooser may hand the first turn to the OPPONENT — winning the roll is not "going first".
    expect(chooseFirstPlayer(session, chooser, other)).toEqual({ ok: true });
    expect(session.pregame?.firstPlayer).toBe(other);
    expect(session.pregame?.secondPlayer).toBe(chooser);
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.handsDrawn).toBe(true);
  });

  // ---- (b) games 2–3 ----------------------------------------------------------------------------

  /** Game 1 played out and conceded by `loser`, then both seats press Continue. */
  function toGame2(loser: string = P2): { gameId: string; session: GameSession } {
    const { gameId, session } = newBo3();
    playOut(session);
    concedeGame(session, gameId, loser);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    return { gameId, session };
  }

  test("(b) game 2 has NO roll: the previous game's loser is the chooser, and the step is reached only after battlefield_select and the sideboard window", async () => {
    const { session } = toGame2(P2);
    expect(session.gameNumber).toBe(2);
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.initiative).toMatchObject({ afterGame: 1, chooser: P2, decided: false, kind: "loser_chooses" });
    expect(session.pregame?.initiative?.p1Roll).toBeUndefined();
    expect(session.pregame?.initiative?.p2Roll).toBeUndefined();

    presentBattlefields(session);
    expect(session.pregame?.phase).toBe("sideboard"); // registered sideboard ⇒ the window opens
    expect(session.pregame?.handsDrawn).toBe(false);

    lockSideboard(session, P1);
    expect(session.pregame?.phase).toBe("sideboard"); // still waiting for the other seat
    lockSideboard(session, P2);
    expect(session.pregame?.phase).toBe("initiative"); // …and only now the first-player choice
    expect(session.pregame?.handsDrawn).toBe(false);
  });

  test("(b) the chooser decides knowing BOTH presented battlefields and after both seats locked their post-sideboard decks; hands are dealt only once the choice is made", async () => {
    const { session } = toGame2(P2);
    presentBattlefields(session);
    const presented = { ...session.pregame?.battlefieldSelections };
    lockSideboard(session, P1);
    lockSideboard(session, P2);
    expect(session.pregame?.phase).toBe("initiative");
    expect(Object.keys(presented)).toEqual([P1, P2]); // both are public before the decision
    expect(session.pregame?.sideboard?.[P1]?.locked).toBe(true);
    expect(session.pregame?.sideboard?.[P2]?.locked).toBe(true);
    expect(session.pregame?.handsDrawn).toBe(false);

    expect(chooseFirstPlayer(session, P1, P1)).toMatchObject({ ok: false }); // not the chooser
    expect(chooseFirstPlayer(session, P2, P2)).toEqual({ ok: true });
    expect(session.pregame?.firstPlayer).toBe(P2);
    expect(session.pregame?.handsDrawn).toBe(true);
  });

  // ---- (c) 486.7 follows the seat placed second THIS game ---------------------------------------

  test("(c) 486.7's extra rune is granted to whoever the chooser puts SECOND in THIS game — both directions, with the same seats and the same game-1 seating", async () => {
    for (const first of [P1, P2]) {
      const { session } = toGame2(P2); // P2 lost game 1 and is the chooser either way
      playOut(session, first);
      expect(session.gameNumber).toBe(2);
      expect(session.engine.getState().status).toBe("playing");
      const second = first === P1 ? P2 : P1;
      expect((session.engine.getState() as { extraRunePlayerId?: string }).extraRunePlayerId).toBe(second);
    }
  });

  test("(c) the seat that went second in GAME 1 has no claim on it: P1 went first in game 1, and putting P1 second in game 2 moves the extra rune to P1", async () => {
    const { session } = toGame2(P2);
    playOut(session, P2);
    expect((session.engine.getState() as { extraRunePlayerId?: string }).extraRunePlayerId).toBe(P1);
  });

  test("(c) played out for real: the second seat channels 1 (Obelisk) + 2 + 1 (486.7) = 4 while the first seat gets 3 — and swapping which DECK registered which battlefield changes nothing, because both battlefields are global", async () => {
    const pool = await loadDefaultCardPool();
    const rune = basicRuneDef(pool, "fury").id as string;
    const deck = (bf: string) => ({
      battlefieldIds: [bf],
      mainDeckCardIds: Array(40).fill(SHIPYARD_SKULKER) as string[],
      runeDeckCardIds: Array(12).fill(rune) as string[],
    });
    for (const [a, b] of [[ARENAS_GREATEST, OBELISK_OF_POWER], [OBELISK_OF_POWER, ARENAS_GREATEST]] as const) {
      const game = await Game.fromDecks({ p1: deck(a), p2: deck(b), seed: "bo3-486-7" });
      await game.settle(); // seat 1's first Beginning Phase + Channel
      expect(game.turnPlayer()).toBe(P1);
      expect(game.p1.runes()).toHaveLength(3); // Obelisk 1 + Channel 2, no 486.7 for the first player
      expect(game.p1.points()).toBe(1); // The Arena's Greatest banks its point a turn earlier
      expect(game.p2.points()).toBe(0);
      expect(game.p2.runes()).toHaveLength(0);

      await game.advanceTurn(); // → seat 2's first Beginning Phase + Channel
      expect(game.turnPlayer()).toBe(P2);
      expect(game.p2.runes()).toHaveLength(4); // Obelisk 1 + Channel 2 + 486.7's extra 1
      expect(game.p2.points()).toBe(1);
      expect(game.p1.runes()).toHaveLength(3); // untouched
      expect(game.violations()).toEqual([]);
    }
  });

  test("(c) the Arena's point is a card-effect gain, not a Score: it lands with neither seat holding or conquering anything — the first player is simply a turn ahead on it", async () => {
    const pool = await loadDefaultCardPool();
    const rune = basicRuneDef(pool, "fury").id as string;
    const game = await Game.fromDecks({
      p1: {
        battlefieldIds: [ARENAS_GREATEST],
        mainDeckCardIds: Array(40).fill(SHIPYARD_SKULKER) as string[],
        runeDeckCardIds: Array(12).fill(rune) as string[],
      },
      p2: {
        battlefieldIds: [OBELISK_OF_POWER],
        mainDeckCardIds: Array(40).fill(SHIPYARD_SKULKER) as string[],
        runeDeckCardIds: Array(12).fill(rune) as string[],
      },
      seed: "arena-point",
    });
    await game.settle();
    expect(game.p1.units()).toEqual([]); // nothing on the board at all
    expect(game.p1.points()).toBe(1);
    for (const bf of game.battlefields()) {
      expect(game.gameState.battlefields?.[bf]?.controller ?? null).toBeNull();
    }
  });

  // ---- (d) nobody won / concession / rematch -----------------------------------------------------

  test("(d) a game NOBODY won (486.5.a): there is no loser, so game 2 falls back to a fresh roll and BOTH seats' battlefields stay available for re-presentation", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    const bfsUsed = Object.keys(session.engine.getState().battlefields ?? {});
    expect(bfsUsed).toHaveLength(2);
    session.engine.applyPatches([{ op: "replace", path: ["status"], value: "finished" }]);
    expect(matchSummary(session).current).toMatchObject({ finished: true, winner: null });

    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    expect(session.gameNumber).toBe(2);
    expect(session.match?.games).toEqual([{ gameNumber: 1, reason: "none", winner: null }]);
    expect(session.match?.usedBattlefields).toEqual({});
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
    expect(session.pregame?.initiative).toMatchObject({ chooser: null, decided: false, kind: "roll" });
    expect(matchSummary(session).score).toEqual({ [P1]: 0, [P2]: 0 });
  });

  test("(d) ended by CONCESSION: the conceder is the loser and therefore the chooser — either seat, deliberately, not derived by accident", async () => {
    for (const conceder of [P1, P2]) {
      const { session } = toGame2(conceder);
      expect(session.pregame?.initiative).toMatchObject({ afterGame: 1, chooser: conceder, kind: "loser_chooses" });
      expect(matchSummary(session).score[conceder === P1 ? P2 : P1]).toBe(1);
    }
  });

  test("(d) Rematch: a brand-new match — game 1, the REGISTERED (not post-sideboard) decks, empty usedBattlefields, 0–0, and a roll rather than loser-chooses", async () => {
    const { gameId, session } = newBo3();
    playOut(session);
    concedeGame(session, gameId, P2); // 1–0
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    playOut(session, P2); // game 2
    concedeGame(session, gameId, P2); // 2–0 → decided
    expect(matchSummary(session)).toMatchObject({ decided: true, winner: P1 });

    expect(voteRematch(session, gameId, P1)).toEqual({ ok: true });
    expect(session.gameNumber).toBe(2); // still waiting for the second human
    expect(voteRematch(session, gameId, P2)).toEqual({ ok: true });
    expect(session.gameNumber).toBe(1);
    expect(matchSummary(session)).toMatchObject({ decided: false, gameNumber: 1, games: [], score: { [P1]: 0, [P2]: 0 } });
    expect(session.match?.usedBattlefields).toEqual({});
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
    expect(session.pregame?.initiative).toMatchObject({ chooser: null, kind: "roll" });
    expect(session.pregame?.battlefieldOptions[P1]).toEqual([ARENAS_GREATEST, OBELISK_OF_POWER, ASPIRANTS_CLIMB]);
  });
});
