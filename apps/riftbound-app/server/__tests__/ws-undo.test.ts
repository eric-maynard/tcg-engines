/**
 * Rewind over the game WebSocket (server/ws-game.ts → server/rewind.ts):
 * every client gets a fresh state_update with the restored snapshot and ITS
 * seat's moves, the "Rewound their last action." sentinel is the newest log
 * line, seq stays monotonic, refusals come back as `{type:"error"}`, the
 * pregame is never rewindable, the Goldfish's actions are skipped over, and a
 * vs-Claude seat discards a decision computed on the pre-rewind position and
 * is re-armed exactly once after the debounce.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { P1, P2 } from "@tcg/riftbound/harness";
import type { ServerWebSocket } from "bun";
import { type CallModel, type ModelRequest, type ModelToolUse, ClaudeOpponent, aiTiming, firstLegalCallModel } from "../ai-opponent";
import { buildDefaultDeck } from "../decks";
import { createGameFromDecks, finalizePregame } from "../pregame";
import { REWIND_LOG_SENTINEL, rewindEpoch, rewindSession } from "../rewind";
import { type GameSession, type WsData, gameSessions } from "../state";
import { applySessionMove } from "../turn";
import { gameWsMessage } from "../ws-game";

interface Frame {
  type: string;
  moveId?: string;
  seq?: number;
  error?: string;
  moves?: { moveId: string; params: Record<string, unknown>; playerId: string }[];
  state?: { log: { text: string; key?: string }[]; canUndo: boolean; canRedo: boolean; turn: { activePlayer: string; number: number }; zones: Record<string, { id: string; owner: string; meta?: { exhausted?: boolean } }[]>; runePools: Record<string, { energy: number }> };
  rewind?: { epoch: number; kind: string; steps: number };
}

interface FakeClient {
  ws: ServerWebSocket<WsData>;
  frames: Frame[];
  last(type?: string): Frame | undefined;
}

function client(gameId: string, playerId: string): FakeClient {
  const frames: Frame[] = [];
  const ws = {
    close: () => undefined,
    data: { connId: `${playerId}-conn`, gameId, playerId },
    send: (s: string) => {
      frames.push(JSON.parse(s) as Frame);
    },
  } as unknown as ServerWebSocket<WsData>;
  return { frames, last: (type) => [...frames].reverse().find((f) => !type || f.type === type), ws };
}

let gameSeq = 0;
const made: string[] = [];

afterEach(() => {
  for (const id of made.splice(0)) {
    gameSessions.delete(id);
  }
  aiTiming.rewindRearmMs = 3000;
});

/** A live sandbox (Goldfish) or duel session past the pregame, registered in gameSessions, with one fake socket per seat. */
function playing(opts: { sandbox: boolean; ai?: ClaudeOpponent; finalize?: boolean; settle?: boolean } = { sandbox: false }) {
  const gameId = `ws-undo-${++gameSeq}`;
  const session: GameSession = createGameFromDecks(buildDefaultDeck(), buildDefaultDeck("calm", "mind"), gameId, {
    firstPlayer: P1,
    gameMode: "duel",
    names: { [P1]: "Alice", [P2]: opts.ai ? "Claude" : opts.sandbox ? "Goldfish" : "Bob" },
    sandbox: opts.sandbox,
  });
  if (opts.ai) {
    session.opponent = opts.ai;
  }
  if (opts.finalize !== false) {
    session.pregame?.mulliganComplete.add(P1);
    session.pregame?.mulliganComplete.add(P2);
    finalizePregame(session);
    expect(session.engine.getState().status).toBe("playing");
    if (opts.settle !== false) {
      settleToMain(session);
    }
  }
  gameSessions.set(gameId, session);
  made.push(gameId);
  const c1 = client(gameId, P1);
  const c2 = client(gameId, P2);
  session.clients.set("c1", { playerId: P1, ws: c1.ws });
  session.clients.set("c2", { playerId: P2, ws: c2.ws });
  return { c1, c2, gameId, session };
}

function send(c: FakeClient, msg: Record<string, unknown>): void {
  gameWsMessage(c.ws, msg);
}

/**
 * Clear start-of-turn chain items / prompts (the starter decks' legends and
 * battlefields trigger at the Beginning Phase) so the turn player sits in an
 * open Main Phase. Goes through applySessionMove like every real action.
 */
function settleToMain(session: GameSession): void {
  for (let i = 0; i < 40; i++) {
    const st = session.engine.getState();
    if (st.status !== "playing") {
      return;
    }
    let acted = false;
    for (const seat of [P1, P2]) {
      const legal = session.engine.enumerateMoves(seat as never, { moveIds: ["resolvePendingChoice", "passChainPriority", "passShowdownFocus"], validOnly: true });
      const pick = legal[0];
      if (pick) {
        expect(applySessionMove(session, seat, pick.moveId, { ...(pick.params as Record<string, unknown>) }).success).toBe(true);
        acted = true;
        break;
      }
    }
    if (!acted) {
      break;
    }
  }
  const st = session.engine.getState();
  expect(st.turn.phase).toBe("main");
  expect(st.interaction?.chain?.active ?? false).toBe(false);
}

function movesFor(session: GameSession, seat: string, moveId: string) {
  return session.engine.enumerateMoves(seat as never, { moveIds: [moveId], validOnly: true });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

describe("WS undo/redo — duel (two humans)", () => {
  test("P1 taps a rune, P1 sends undo ⇒ BOTH sockets get state_update{moveId:'undo'} with the restored snapshot, their OWN seat's moves, the sentinel as newest log line, seq bumped; redo re-applies; canUndo/canRedo flags track it", () => {
    const { c1, c2, session } = playing({ sandbox: false });
    const seq0 = session.seq;
    const tap = movesFor(session, P1, "exhaustRune")[0];
    expect(tap).toBeDefined();
    const runeId = (tap?.params as { runeId: string }).runeId;
    const energy0 = session.engine.getState().runePools[P1]?.energy ?? 0;

    send(c1, { moveId: "exhaustRune", params: tap?.params, requestId: "r1", type: "move" });
    expect(c1.last("move_accepted")?.seq).toBe(seq0 + 1);
    expect(c2.last("state_update")?.seq).toBe(seq0 + 1);
    expect(session.engine.getState().runePools[P1]?.energy).toBe(energy0 + 1);
    const tappedFrame = c1.last("move_accepted");
    expect(tappedFrame?.state?.canUndo).toBe(true);
    expect(tappedFrame?.state?.canRedo).toBe(false);

    send(c1, { type: "undo" });
    for (const c of [c1, c2]) {
      const f = c.last();
      expect(f?.type).toBe("state_update");
      expect(f?.moveId).toBe("undo");
      expect(f?.seq).toBe(seq0 + 2);
      expect(f?.rewind).toEqual({ epoch: 1, kind: "undo", steps: 1 });
      expect(f?.state?.runePools[P1]?.energy).toBe(energy0);
      const rune = (f?.state?.zones.runePool ?? []).find((z) => z.id === runeId);
      expect(rune?.meta?.exhausted ?? false).toBe(false);
      const log = f?.state?.log ?? [];
      expect(log[log.length - 1]?.text).toBe(REWIND_LOG_SENTINEL);
      expect(log.some((l) => /exhaustRune|exhausted a rune/.test(l.text) && /replay-/.test(l.key ?? ""))).toBe(false); // narration of the undone move is gone
      expect(f?.state?.canRedo).toBe(true);
    }
    // Per-seat moves: P1 (turn player) can tap runes; P2 cannot.
    expect(c1.last()?.moves?.some((m) => m.moveId === "exhaustRune" && m.playerId === P1)).toBe(true);
    expect(c2.last()?.moves?.some((m) => m.moveId === "exhaustRune")).toBe(false);
    expect(c2.last()?.moves?.every((m) => m.playerId === P2)).toBe(true);
    expect(session.engine.getState().runePools[P1]?.energy).toBe(energy0);

    send(c2, { type: "redo" }); // either seat may redo (unchanged policy)
    for (const c of [c1, c2]) {
      const f = c.last();
      expect(f?.moveId).toBe("redo");
      expect(f?.seq).toBe(seq0 + 3);
      expect(f?.state?.runePools[P1]?.energy).toBe(energy0 + 1);
      expect(f?.state?.canRedo).toBe(false);
      expect(f?.state?.canUndo).toBe(true);
      const log = f?.state?.log ?? [];
      expect(log[log.length - 1]?.text).toBe("Move redone.");
    }
    expect(rewindEpoch(session)).toBe(2);
  });

  test("nothing to rewind (fresh game: only pregame setup in history) ⇒ {type:'error'} to the requester only, no broadcast, position untouched; redo with nothing rewound ⇒ error", () => {
    const { c1, c2, session } = playing({ sandbox: false, settle: false });
    const seqBefore = session.seq;
    const hist = session.engine.getReplayHistory().length;
    expect(hist).toBeGreaterThan(0); // setup moves exist but are below the floor
    const n2 = c2.frames.length;
    send(c1, { type: "undo" });
    expect(c1.last()?.type).toBe("error");
    expect(c1.last()?.error).toBe("Nothing to rewind");
    expect(c2.frames.length).toBe(n2);
    expect(session.seq).toBe(seqBefore);
    expect(session.engine.getReplayHistory().length).toBe(hist);
    expect(session.engine.getState().status).toBe("playing");

    send(c1, { type: "redo" });
    expect(c1.last()?.error).toBe("Nothing to redo");
  });

  test("undo during the pregame ⇒ error, nothing changes", () => {
    const { c1, session } = playing({ finalize: false, sandbox: false });
    expect(session.pregame).toBeDefined();
    const hist = session.engine.getReplayHistory().length;
    send(c1, { type: "undo" });
    expect(c1.last()?.type).toBe("error");
    expect(String(c1.last()?.error)).toMatch(/pregame|rewind/i);
    expect(session.engine.getReplayHistory().length).toBe(hist);
    expect(session.pregame).toBeDefined();
  });

  test("undo across endTurn restores turn player / number and drops the 'Turn passed to …' side line; a finished duel is not rewindable", () => {
    const { c1, c2, session } = playing({ sandbox: false });
    const t0 = session.engine.getState().turn;
    send(c1, { moveId: "endTurn", params: { playerId: P1 }, requestId: "e", type: "move" });
    expect(session.engine.getState().turn.activePlayer).toBe(P2);
    expect((c2.last()?.state?.log ?? []).some((l) => /^Turn passed to/.test(l.text))).toBe(true);
    send(c2, { type: "undo" }); // the OTHER seat rewinds it (allowed today — see DESIGN.md open question)
    const f = c1.last();
    expect(f?.moveId).toBe("undo");
    expect(f?.state?.turn.activePlayer).toBe(P1);
    expect(f?.state?.turn.number).toBe(t0.number);
    expect((f?.state?.log ?? []).some((l) => /^Turn passed to/.test(l.text))).toBe(false);
    expect(session.engine.getFlowManager()?.getCurrentPlayer()).toBe(P1);

    session.engine.applyPatches([{ op: "replace", path: ["status"], value: "finished" }]);
    send(c1, { type: "undo" });
    expect(c1.last()?.type).toBe("error");
    expect(c1.last()?.error).toBe("Can only rewind during active gameplay");
  });
});

describe("WS undo/redo — Goldfish sandbox", () => {
  test("Rewind takes back the HUMAN's last action, skipping every Goldfish action after it (endTurn ⇒ whole Goldfish turn undone in one request); Redo re-applies them all; the sandbox may rewind the winning move", () => {
    const { c1, session } = playing({ sandbox: true });
    const t0 = session.engine.getState().turn.number;
    const hist0 = session.engine.getReplayHistory().length;
    send(c1, { moveId: "endTurn", params: { playerId: P1 }, requestId: "e", type: "move" });
    // The Goldfish auto-played its turn synchronously: back to P1, a turn later.
    const afterGold = session.engine.getState().turn;
    expect(afterGold.activePlayer).toBe(P1);
    expect(afterGold.number).toBe(t0 + 2);
    const histGold = session.engine.getReplayHistory().length;
    expect(histGold).toBeGreaterThan(hist0 + 1);

    send(c1, { type: "undo" });
    const f = c1.last();
    expect(f?.moveId).toBe("undo");
    expect(f?.rewind?.steps).toBeGreaterThan(1);
    expect(session.engine.getState().turn.number).toBe(t0);
    expect(session.engine.getState().turn.activePlayer).toBe(P1);
    expect(session.engine.getReplayHistory().length).toBe(hist0);

    send(c1, { type: "redo" });
    expect(c1.last()?.moveId).toBe("redo");
    expect(session.engine.getState().turn).toEqual(afterGold);
    expect(session.engine.getReplayHistory().length).toBe(histGold);

    // Sandbox: a finished game can still take back the winning move (REST hook shares the path).
    session.engine.applyPatches([{ op: "replace", path: ["status"], value: "finished" }]);
    const r = rewindSession(session, "undo", { actor: P1 });
    expect(r.ok).toBe(true);
    expect(session.engine.getState().status).toBe("playing");
  });
});

// ---------------------------------------------------------------------------
// vs-Claude: stale in-flight decisions are dropped; re-arm exactly once
// ---------------------------------------------------------------------------

/** A model whose every call parks until the test releases it. */
function gatedModel() {
  const calls: { req: ModelRequest; release: (pick?: (req: ModelRequest) => ModelToolUse) => void; released: boolean }[] = [];
  const callModel: CallModel = (req, opts) =>
    new Promise((resolve) => {
      const entry = {
        release: (pick?: (r: ModelRequest) => ModelToolUse) => {
          entry.released = true;
          if (pick) {
            resolve(pick(req));
          } else {
            void firstLegalCallModel(req, opts).then(resolve);
          }
        },
        released: false,
        req,
      };
      calls.push(entry);
    });
  const waitForCall = async (n: number, ms = 3000) => {
    const t = Date.now();
    while (calls.length < n) {
      if (Date.now() - t > ms) {
        throw new Error(`model call #${n} never came (have ${calls.length})`);
      }
      await sleep(5);
    }
    return calls[n - 1] as (typeof calls)[number];
  };
  return { callModel, calls, waitForCall };
}

const endTurnPick = (req: ModelRequest): ModelToolUse => {
  const item = req.meta.menu?.find((it) => /end (the |your )?turn/i.test(it.label)) ?? req.meta.menu?.[req.meta.menu.length - 1];
  return { input: { index: item?.index ?? 0, rationale: "test: end turn" }, name: "choose" };
};

async function idle(ai: ClaudeOpponent, ms = 3000): Promise<void> {
  const t = Date.now();
  while (ai.busy) {
    if (Date.now() - t > ms) {
      throw new Error("AI loop never went idle");
    }
    await sleep(5);
  }
}

describe("WS undo — vs-Claude seat", () => {
  test("a decision computed on the pre-rewind position is DISCARDED (not applied to the rewound state); an undo that hands the cursor to the AI re-arms it exactly once, after the debounce", async () => {
    aiTiming.rewindRearmMs = 60;
    const gate = gatedModel();
    const ai = new ClaudeOpponent("haiku", undefined, { backoffMs: 0, callModel: gate.callModel, pacingMs: 0, timeoutMs: 5000 });
    const { c1, session } = playing({ ai, sandbox: true });

    // 1) Human ends the turn → the AI seat starts thinking about ITS turn (call #1 parked).
    const histBefore = session.engine.getReplayHistory().length;
    send(c1, { moveId: "endTurn", params: { playerId: P1 }, requestId: "e1", type: "move" });
    expect(session.engine.getState().turn.activePlayer).toBe(P2);
    const first = await gate.waitForCall(1);
    expect(ai.thinking).toBe(true);
    const histAtThink = session.engine.getReplayHistory().length;

    // 2) Human rewinds their endTurn while the model is mid-thought.
    send(c1, { type: "undo" });
    expect(c1.last()?.moveId).toBe("undo");
    expect(session.engine.getState().turn.activePlayer).toBe(P1);
    expect(session.engine.getReplayHistory().length).toBe(histBefore);

    // 3) The stale answer arrives: it must be dropped, never applied.
    first.release((req) => ({ input: { index: 0, rationale: "stale" }, name: "choose" }));
    await idle(ai);
    expect(ai.staleDiscards).toBe(1);
    expect(session.engine.getReplayHistory().length).toBe(histBefore);
    expect(session.engine.getState().turn.activePlayer).toBe(P1);
    // The debounce timer fires but it is not the AI's turn: no new model call.
    await sleep(aiTiming.rewindRearmMs + 60);
    expect(gate.calls.length).toBe(1);
    expect(histAtThink).toBeGreaterThan(histBefore);

    // 4) Human ends the turn again → AI thinks (call #2) and ends its own turn.
    send(c1, { moveId: "endTurn", params: { playerId: P1 }, requestId: "e2", type: "move" });
    const second = await gate.waitForCall(2);
    second.release(endTurnPick);
    // It may take a few forced/extra decisions to get through its turn; release them as they come.
    {
      const t = Date.now();
      while (session.engine.getState().turn.activePlayer !== P1 || ai.busy) {
        if (Date.now() - t > 5000) {
          throw new Error("AI never handed the turn back");
        }
        for (const c of gate.calls) {
          if (!c.released) {
            c.release(endTurnPick);
          }
        }
        await sleep(5);
      }
    }
    const callsAfterAiTurn = gate.calls.length;
    const humanTurn = session.engine.getState().turn.number;

    // 5) Human rewinds ONE action = the AI's last one → cursor back on the AI seat.
    send(c1, { type: "undo" });
    expect(c1.last()?.moveId).toBe("undo");
    expect(session.engine.getState().turn.activePlayer).toBe(P2);
    expect(session.engine.getState().turn.number).toBe(humanTurn - 1);
    // Not re-armed immediately (debounce)…
    await sleep(aiTiming.rewindRearmMs / 3);
    expect(gate.calls.length).toBe(callsAfterAiTurn);
    expect(ai.busy).toBe(false);
    // …exactly one new decision request once the debounce elapses.
    await gate.waitForCall(callsAfterAiTurn + 1, 3000);
    await sleep(aiTiming.rewindRearmMs + 60);
    expect(gate.calls.filter((c) => !c.released).length).toBe(1);
    expect(gate.calls.length).toBe(callsAfterAiTurn + 1);

    // Let it finish so no timer/loop outlives the test.
    {
      const t = Date.now();
      while (ai.busy || gate.calls.some((c) => !c.released)) {
        if (Date.now() - t > 5000) {
          break;
        }
        for (const c of gate.calls) {
          if (!c.released) {
            c.release(endTurnPick);
          }
        }
        await sleep(5);
      }
      await idle(ai).catch(() => undefined);
    }
  }, 30_000);
});
