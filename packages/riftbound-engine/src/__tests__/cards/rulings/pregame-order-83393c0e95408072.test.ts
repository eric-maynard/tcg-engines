/**
 * Ruling 83393c0e95408072 — (no specific card) the setup sequence at the start of a game.
 *   Driven through the app's pregame layer (apps/riftbound-app/server/pregame.ts).
 *
 * Q: What is the correct order for revealing battlefields and deciding who goes first?
 * A: Legends and champions are set out, then battlefields are chosen secretly and revealed
 *    SIMULTANEOUSLY, and only then is turn order decided by any fair random method. Hands come after
 *    that, and the mulligan runs in turn order. Flipping battlefields to decide the first player (the
 *    Proving Grounds onboarding trick) is fine only as the random method AFTER they are revealed.
 *    In games 2 and 3 of a match the battlefields are likewise revealed before the previous game's
 *    loser chooses whether to go first.
 * Rules: 111 (legend to the Legend Zone), 112 (chosen champion to the Champion Zone), 113 (battlefields
 *        set aside), 486.5 (each player selects one of their three; the selected ones are placed
 *        SIMULTANEOUSLY), 115 (turn order by any fair random method), 116 (draw 4), 117 (mulligan in
 *        turn order).
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

const P1_BATTLEFIELDS = ["ogn-290-298", "ogn-284-298", "ogn-276-298"];
const P2_BATTLEFIELDS = ["ogn-275-298", "ogn-277-298", "ogn-279-298"];
const P1_DECK = { ...buildDefaultDeck(), battlefieldIds: P1_BATTLEFIELDS };
const P2_DECK = { ...buildDefaultDeck("calm", "mind"), battlefieldIds: P2_BATTLEFIELDS };

let seq = 0;

function newMatch(): { gameId: string; session: GameSession } {
  const gameId = `pregame-order-${++seq}`;
  return {
    gameId,
    session: createGameFromDecks(P1_DECK, P2_DECK, gameId, {
      gameMode: "match",
      initiative: { kind: "roll" as const },
      names: { [P1]: "Alice", [P2]: "Bob" },
      sandbox: false,
    }),
  };
}

describe("Ruling 83393c0e95408072 — battlefields are revealed simultaneously BEFORE turn order is decided", () => {
  test("the very first pregame phase is the battlefield selection — nothing about turn order has happened yet", async () => {
    const { session } = newMatch();
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.battlefieldSelections).toEqual({});
    expect(session.pregame?.initiative?.firstPlayer).toBeFalsy();
  });

  test("the choices are secret until both are in: one seat selecting does NOT advance the pregame", async () => {
    const { session } = newMatch();
    expect(selectBattlefield(session, P1, "ogn-284-298")).toMatchObject({ ok: true });
    expect(session.pregame?.phase).toBe("battlefield_select"); // still waiting on P2
    expect(session.pregame?.initiative?.firstPlayer).toBeFalsy();
  });

  test("both selections land together and only then does the game move on to deciding who goes first", async () => {
    const { session } = newMatch();
    selectBattlefield(session, P1, "ogn-284-298");
    selectBattlefield(session, P2, "ogn-277-298");
    expect(session.pregame?.battlefieldSelections).toEqual({ [P1]: "ogn-284-298", [P2]: "ogn-277-298" });
    expect(session.pregame?.phase).toBe("initiative"); // turn order comes AFTER the reveal
  });

  test("hands and the mulligan come after turn order, and the mulligan starts with the first player", async () => {
    const { session } = newMatch();
    selectBattlefield(session, P1, "ogn-284-298");
    selectBattlefield(session, P2, "ogn-277-298");
    lockSideboard(session, P1);
    lockSideboard(session, P2);
    expect(session.pregame?.phase).toBe("initiative");
    chooseFirstPlayer(session, session.pregame?.initiative?.chooser as string, P1);
    expect(session.pregame?.phase).toBe("mulligan");
    session.pregame?.mulliganComplete.add(P1);
    session.pregame?.mulliganComplete.add(P2);
    finalizePregame(session);
    expect(session.engine.getState().turn.activePlayer).toBe(P1);
    expect(Object.keys(session.engine.getState().battlefields ?? {})).toHaveLength(2);
  });

  test("games 2 and 3 keep the same order: battlefields are revealed before the previous game's loser chooses to go first", async () => {
    const { gameId, session } = newMatch();
    selectBattlefield(session, P1, P1_BATTLEFIELDS[1]);
    selectBattlefield(session, P2, P2_BATTLEFIELDS[1]);
    lockSideboard(session, P1);
    lockSideboard(session, P2);
    chooseFirstPlayer(session, session.pregame?.initiative?.chooser as string, P1);
    session.pregame?.mulliganComplete.add(P1);
    session.pregame?.mulliganComplete.add(P2);
    finalizePregame(session);

    concedeGame(session, gameId, P2); // P1 wins game 1, so P2 is the chooser next game
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    expect(session.gameNumber).toBe(2);
    expect(session.pregame?.phase).toBe("battlefield_select"); // battlefields first, again
    selectBattlefield(session, P1, P1_BATTLEFIELDS[0]);
    selectBattlefield(session, P2, P2_BATTLEFIELDS[0]);
    lockSideboard(session, P1);
    lockSideboard(session, P2);
    expect(session.pregame?.phase).toBe("initiative");
    expect(session.pregame?.initiative?.chooser).toBe(P2); // the loser of game 1 decides, after the reveal
  });
});
