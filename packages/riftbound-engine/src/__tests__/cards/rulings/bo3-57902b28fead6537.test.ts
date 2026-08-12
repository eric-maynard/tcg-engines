/**
 * Ruling 57902b28fead6537 — (battlefields in a 1v1 best-of-three: chosen, not random; no card involved)
 *   Driven through the app's pregame/match layer (apps/riftbound-app/server/pregame.ts). Each deck registers
 *   three battlefields, as every Riftbound deck does.
 *
 * Q: In a 1v1 best-of-three, do we pick our battlefields or are they random?
 * A: You pick. Each player brings three; for each game each player selects one of theirs, and both are revealed
 *    (placed in the public battlefield zone) before turn order is decided. A battlefield used in a game somebody
 *    won is set aside for the rest of the match, so later games must come from the ones left. A best-of-one duel
 *    is the contrast: there the battlefields are picked at random.
 * Rules: 486.5 (Match: each player presents one of their three battlefields), 486.5.a (battlefields used in a
 *        game somebody won are removed for the rest of the match), 485.5 (Duel: battlefields chosen at random),
 *        115.1 / 116 (turn order and hands come after).
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

function newSession(gameMode: "duel" | "match"): { gameId: string; session: GameSession } {
  const gameId = `bo3-battlefields-${++seq}`;
  return {
    gameId,
    session: createGameFromDecks(P1_DECK, P2_DECK, gameId, {
      gameMode,
      ...(gameMode === "duel" ? { firstPlayer: P1 } : { initiative: { kind: "roll" as const } }),
      names: { [P1]: "Alice", [P2]: "Bob" },
      sandbox: false,
    }),
  };
}

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

describe("Ruling 57902b28fead6537 — in a Bo3 match each player CHOOSES a battlefield from the three in their deck", () => {
  test("game 1 of the match opens a real picker: the three battlefields from each deck are listed, nothing was rolled for them, and neither seat has one placed yet", async () => {
    const { session } = newSession("match");
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.battlefieldRandom).toBeFalsy();
    expect(session.pregame?.battlefieldOptions[P1]).toEqual(P1_BATTLEFIELDS);
    expect(session.pregame?.battlefieldOptions[P2]).toEqual(P2_BATTLEFIELDS);
    expect(session.pregame?.battlefieldSelections).toEqual({});
  });

  test("each seat picks one of its own three; both are revealed together and only then is turn order decided", async () => {
    const { session } = newSession("match");
    expect(selectBattlefield(session, P1, "ogn-275-298")).toMatchObject({ ok: false }); // not from P1's deck
    expect(selectBattlefield(session, P1, "ogn-284-298")).toMatchObject({ ok: true });
    expect(session.pregame?.phase).toBe("battlefield_select"); // still waiting for P2
    expect(selectBattlefield(session, P2, "ogn-277-298")).toMatchObject({ ok: true });
    expect(session.pregame?.battlefieldSelections).toEqual({ [P1]: "ogn-284-298", [P2]: "ogn-277-298" });
    expect(session.pregame?.phase).toBe("initiative");
  });

  test("a battlefield used in a game somebody won is set aside: game 2 still lists all three but refuses the used one", async () => {
    const { gameId, session } = newSession("match");
    playOut(session);
    const used = Object.keys(session.engine.getState().battlefields ?? {});
    expect(used).toHaveLength(2);
    concedeGame(session, gameId, P2); // somebody won this game
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    expect(session.gameNumber).toBe(2);
    expect(session.pregame?.battlefieldExcluded?.[P1]).toEqual([P1_BATTLEFIELDS[0] as string]);
    expect(session.pregame?.battlefieldExcluded?.[P2]).toEqual([P2_BATTLEFIELDS[0] as string]);
    expect(session.pregame?.battlefieldOptions[P1]).toHaveLength(3); // listed…
    expect(selectBattlefield(session, P1, P1_BATTLEFIELDS[0])).toMatchObject({ ok: false }); // …but not selectable
    expect(selectBattlefield(session, P1, P1_BATTLEFIELDS[1])).toMatchObject({ ok: true });
  });

  test("contrast — a best-of-one duel does NOT ask: the battlefields are selected at random and the pregame skips straight past the picker", async () => {
    const { session } = newSession("duel");
    expect(session.pregame?.battlefieldRandom).toBe(true);
    expect(session.pregame?.phase).toBe("mulligan");
    expect(Object.keys(session.pregame?.battlefieldSelections ?? {}).sort()).toEqual([P1, P2]);
    expect(P1_BATTLEFIELDS).toContain(session.pregame?.battlefieldSelections[P1]);
    expect(P2_BATTLEFIELDS).toContain(session.pregame?.battlefieldSelections[P2]);
  });
});
