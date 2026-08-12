/**
 * Ruling 42146eef0c068c44 — (pregame ordering: when is the first-player choice made; no card involved)
 *   Driven through the app's pregame/match layer (apps/riftbound-app/server/pregame.ts), the surface that owns
 *   the sequence. Decks carry three battlefields each so the picker is real.
 *
 * Q: When the previous game's loser decides whether to go first or second, is that before or after they see the
 *    battlefields?
 * A: After. The order is legends and champions (registered with the deck), then battlefields are chosen and
 *    revealed, then turn order is decided, and only then are opening hands drawn and mulliganed. It is the same
 *    sequence in every game, including the games after a loss in a best-of-three.
 * Rules: 113 (battlefields are placed in the public battlefield zone during setup — that is their reveal),
 *        115.1 (the Mode of Play determines the First Player), 116 (opening hands are drawn after that),
 *        486.5-486.6 (each game of a Match repeats the setup). Who chooses in games 2-3 is the organized-play
 *        convention the app owns (the previous game's loser); the sibling test
 *        interactions/bo3-loser-chooses-first-vs-g1-roll.test.ts pins that down.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2 } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { concedeGame, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import {
  chooseFirstPlayer,
  createGameFromDecks,
  finalizePregame,
  lockSideboard,
  selectBattlefield,
} from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";

const BASE_DECK = buildDefaultDeck();
const P1_DECK = { ...BASE_DECK, battlefieldIds: ["ogn-290-298", "ogn-284-298", "ogn-276-298"] };
const P2_DECK = { ...buildDefaultDeck("calm", "mind"), battlefieldIds: ["ogn-275-298", "ogn-277-298", "ogn-279-298"] };

let seq = 0;

function newMatch(): { gameId: string; session: GameSession } {
  const gameId = `pregame-order-${++seq}`;
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
  if (!pg) {
    return;
  }
  for (const seat of [P1, P2]) {
    if (pg.battlefieldSelections[seat]) {
      continue;
    }
    const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id));
    selectBattlefield(session, seat, free);
  }
}

/** Walk a pregame to a playing game, putting `first` on the first turn. */
function playOut(session: GameSession, first: string = P1): void {
  for (let i = 0; i < 10 && session.pregame; i++) {
    const pg = session.pregame;
    if (pg.phase === "battlefield_select") {
      presentBattlefields(session);
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

/** Game 1 played out and lost by P2; both seats continue into game 2, where P2 is the chooser. */
function toGame2(): { gameId: string; session: GameSession } {
  const { gameId, session } = newMatch();
  playOut(session);
  concedeGame(session, gameId, P2);
  voteContinue(session, gameId, P1);
  voteContinue(session, gameId, P2);
  return { gameId, session };
}

describe("Ruling 42146eef0c068c44 — turn order is chosen AFTER the battlefields are revealed, and hands come after that", () => {
  test("game 2 opens on the battlefield picker with the loser named as the chooser and the choice still open — no turn order has been settled", async () => {
    const { session } = toGame2();
    expect(session.gameNumber).toBe(2);
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.initiative).toMatchObject({ chooser: P2, decided: false });
    expect(session.pregame?.battlefieldSelections).toEqual({});
    expect(session.pregame?.handsDrawn).toBe(false);
  });

  test("the first-player step is only reached once BOTH battlefields are down and public", async () => {
    const { session } = toGame2();
    selectBattlefield(session, P1, session.pregame?.battlefieldOptions[P1]?.find((id) => !(session.pregame?.battlefieldExcluded?.[P1] ?? []).includes(id)));
    expect(session.pregame?.phase).toBe("battlefield_select"); // still waiting for the other seat
    presentBattlefields(session);
    for (const seat of [P1, P2]) {
      lockSideboard(session, seat);
    }
    expect(session.pregame?.phase).toBe("initiative");
    expect(Object.keys(session.pregame?.battlefieldSelections ?? {}).sort()).toEqual([P1, P2]);
  });

  test("so the chooser decides knowing both battlefields — and only their answer deals the opening hands (mulligan comes last)", async () => {
    const { session } = toGame2();
    presentBattlefields(session);
    for (const seat of [P1, P2]) {
      lockSideboard(session, seat);
    }
    expect(session.pregame?.handsDrawn).toBe(false);
    expect(chooseFirstPlayer(session, P1, P1)).toMatchObject({ ok: false }); // not the chooser
    expect(chooseFirstPlayer(session, P2, P1)).toEqual({ ok: true });
    expect(session.pregame?.firstPlayer).toBe(P1);
    expect(session.pregame?.secondPlayer).toBe(P2);
    expect(session.pregame?.handsDrawn).toBe(true);
    expect(session.pregame?.phase).toBe("mulligan");
  });

  test("the same order holds in game 1 of the match: the battlefield picker is open before anyone is asked who goes first", async () => {
    const { session } = newMatch();
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.initiative).toMatchObject({ chooser: null, decided: false });
    expect(session.pregame?.handsDrawn).toBe(false);
    presentBattlefields(session);
    expect(session.pregame?.phase).toBe("initiative"); // only now
    expect(session.pregame?.handsDrawn).toBe(false);
  });
});
