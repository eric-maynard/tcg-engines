/**
 * rule 357.1.a / 429.3 — the pay-line list must survive a REAL game, not just a
 * hand-built scenario.
 *
 * Reported from the browser: at the start of a mid-game Main Phase (0 pooled
 * Energy, every rune still ready — the exact moment the player looks at their
 * hand) the server shipped `reachablePlays: []`, so no hand card got the dim +
 * "tap a rune first" line and the whole hand read as dead; tapping one rune made
 * six of the same eight cards light up. The unit scenarios never caught it
 * because they start mid-board. This drives the actual session path
 * (`createGameFromDecks` → pregame → endTurn to turn 9) and asserts the list is
 * populated with a 0-Energy pool.
 *
 * The engine list was populated all along: the user-visible emptiness came from
 * `turn.ts sandboxAutoPlay` broadcasting ONE seat-less `buildGameSnapshot(session)`
 * to every client, and `reachablePlays` is gated on having a viewer — so that
 * frame shipped empty, and the Goldfish auto-passes straight through to the
 * human's next Main Phase, making it the last frame they hold while looking at
 * their hand (fixed in 73dced4, pinned per-seat by reachable-plays-per-seat).
 * This test is the other half of that guard: the ENGINE truth at that moment.
 */
import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ServerWebSocket } from "bun";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-reach-live-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { buildDefaultDeck } = await import("../decks");
const { createGameFromDecks, handlePregameMessage, runBotPregame } = await import("../pregame");
const { gameSessions } = await import("../state");
const { applySessionMove } = await import("../turn");
const { Harness } = await import("@tcg/riftbound");

type GameSession = import("../state").GameSession;
type WsData = import("../state").WsData;
const P1 = "player-1";
const P2 = "player-2";
const GAME_ID = "reach-live-1";

afterAll(() => {
  gameSessions.delete(GAME_ID);
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

function client(session: GameSession, gameId: string, playerId: string) {
  const ws = {
    close: () => undefined,
    data: { connId: `${playerId}-${gameId}`, gameId, playerId },
    send: () => undefined,
  } as unknown as ServerWebSocket<WsData>;
  session.clients.set(`${playerId}-${gameId}`, { playerId, ws });
  return ws;
}

test("a real game at turn 9 Main with 0 pooled Energy still lists what one Add would unlock", async () => {
  const session = createGameFromDecks(buildDefaultDeck(), buildDefaultDeck("calm", "mind"), GAME_ID, {
    firstPlayer: P1,
    gameMode: "duel",
    names: { [P1]: "Tester", [P2]: "Goldfish" },
    sandbox: true,
  });
  gameSessions.set(GAME_ID, session);
  const ws = client(session, GAME_ID, P1);

  for (let i = 0; i < 12 && session.pregame; i++) {
    const pg = session.pregame;
    await runBotPregame(session, { gameId: GAME_ID });
    if (pg.phase === "battlefield_select" && !pg.battlefieldSelections[P1]) {
      const free = (pg.battlefieldOptions[P1] ?? []).find(
        (id: string) => !(pg.battlefieldExcluded?.[P1] ?? []).includes(id),
      );
      handlePregameMessage(ws, { battlefieldId: free, type: "pregame_battlefield_select" }, session, GAME_ID, P1);
    } else if (pg.phase === "mulligan" && !session.pregame?.mulliganComplete.has(P1)) {
      handlePregameMessage(ws, { sendBack: [], type: "pregame_mulligan" }, session, GAME_ID, P1);
    } else if (pg.phase === "initiative" && pg.initiative?.chooser === P1) {
      handlePregameMessage(ws, { choice: "self", type: "pregame_choose_first" }, session, GAME_ID, P1);
    } else if (pg.phase === "sideboard") {
      handlePregameMessage(ws, { type: "sideboard_lock" }, session, GAME_ID, P1);
    }
  }
  expect(session.engine.getState().status).toBe("playing");

  const settle = () => {
    for (let n = 0; n < 80; n++) {
      let acted = false;
      for (const seat of [P1, P2]) {
        const pick = session.engine.enumerateMoves(seat as never, {
          moveIds: ["resolvePendingChoice", "passChainPriority", "passShowdownFocus"],
          validOnly: true,
        })[0];
        if (pick) {
          applySessionMove(session, seat, pick.moveId, { ...(pick.params as Record<string, unknown>) });
          acted = true;
          break;
        }
      }
      if (!acted) {
        return;
      }
    }
  };
  settle();

  for (let t = 0; t < 24; t++) {
    const st = session.engine.getState() as unknown as { status: string; turn: { number: number; activePlayer: string } };
    if (st.status !== "playing" || (st.turn.number >= 9 && st.turn.activePlayer === P1)) {
      break;
    }
    const end = session.engine.enumerateMoves(st.turn.activePlayer as never, { moveIds: ["endTurn"], validOnly: true })[0];
    if (!end) {
      settle();
      continue;
    }
    applySessionMove(session, st.turn.activePlayer, "endTurn", { ...(end.params as Record<string, unknown>) });
    settle();
    await new Promise((r) => setTimeout(r, 5));
    settle();
  }

  const state = session.engine.getState() as unknown as {
    turn: { number: number; activePlayer: string; phase: string };
    runePools: Record<string, { energy: number }>;
  };
  expect(state.turn).toMatchObject({ activePlayer: P1, phase: "main" });
  expect(state.turn.number).toBeGreaterThanOrEqual(9);
  // The reported state exactly: nothing pooled yet, everything still to tap.
  expect(state.runePools[P1]?.energy).toBe(0);

  const reach = Harness.reachablePlaysOf(session.engine as never, P1);
  expect(reach.length).toBeGreaterThan(0);
  for (const r of reach) {
    expect(r.needsAdd.reason.length).toBeGreaterThan(0);
  }
});
