/**
 * Ruling a4b93e47cedcdd04 — (no specific card) both players presenting the same battlefield.
 *   Driven through the app's pregame/match layer (apps/riftbound-app/server/pregame.ts).
 *
 * Q: In a 1v1 best-of-three, may both players reveal the SAME battlefield?
 * A: Yes. Nothing stops two players' selections from matching — the restriction is only that your own
 *    three battlefields must be distinct from each other. Two identical selections simply put two
 *    copies of that battlefield into the Battlefield Zone.
 * Rules: 486.4.a (each player provides three battlefields, one is used), 486.5 (each selects one of
 *        their own three; the selected ones are placed simultaneously), 486.5/486.6 (only a battlefield
 *        used in a game somebody WON is set aside — nothing about the opponent's choice).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2 } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import {
  chooseFirstPlayer,
  createGameFromDecks,
  finalizePregame,
  lockSideboard,
  selectBattlefield,
} from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";

/** The two decks overlap on ogn-284-298 — the battlefield both seats will present. */
const SHARED = "ogn-284-298";
const P1_BATTLEFIELDS = [SHARED, "ogn-290-298", "ogn-276-298"];
const P2_BATTLEFIELDS = [SHARED, "ogn-277-298", "ogn-279-298"];
const P1_DECK = { ...buildDefaultDeck(), battlefieldIds: P1_BATTLEFIELDS };
const P2_DECK = { ...buildDefaultDeck("calm", "mind"), battlefieldIds: P2_BATTLEFIELDS };

let seq = 0;

function newMatch(): { gameId: string; session: GameSession } {
  const gameId = `bo3-same-bf-${++seq}`;
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

describe("Ruling a4b93e47cedcdd04 — two players may present the same battlefield", () => {
  test("both seats select the same id and both selections are accepted", async () => {
    const { session } = newMatch();
    expect(selectBattlefield(session, P1, SHARED)).toMatchObject({ ok: true });
    expect(selectBattlefield(session, P2, SHARED)).toMatchObject({ ok: true });
    expect(session.pregame?.battlefieldSelections).toEqual({ [P1]: SHARED, [P2]: SHARED });
    expect(session.pregame?.phase).toBe("initiative"); // the pregame moves on normally
  });

  test("the game starts with two battlefields in play, both of that same card", async () => {
    const { session } = newMatch();
    selectBattlefield(session, P1, SHARED);
    selectBattlefield(session, P2, SHARED);
    lockSideboard(session, P1);
    lockSideboard(session, P2);
    chooseFirstPlayer(session, session.pregame?.initiative?.chooser as string, P1);
    session.pregame?.mulliganComplete.add(P1);
    session.pregame?.mulliganComplete.add(P2);
    const selections = { ...(session.pregame?.battlefieldSelections ?? {}) };
    finalizePregame(session);
    const bfs = Object.values(session.engine.getState().battlefields ?? {});
    expect(bfs).toHaveLength(2);
    // Both slots came from the same printed battlefield; the engine keeps them as two distinct instances.
    const keys = Object.keys(session.engine.getState().battlefields ?? {});
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((k) => k.includes(SHARED.split("-")[1] as string))).toBe(true);
    expect(selections).toEqual({ [P1]: SHARED, [P2]: SHARED });
  });

  test("the restriction that DOES exist is within one deck: a player's own three must be distinct", async () => {
    const { session } = newMatch();
    expect(new Set(P1_BATTLEFIELDS).size).toBe(3);
    expect(new Set(P2_BATTLEFIELDS).size).toBe(3);
    // …and a seat may still only present a battlefield from its own three.
    expect(selectBattlefield(session, P1, "ogn-279-298")).toMatchObject({ ok: false });
  });
});
