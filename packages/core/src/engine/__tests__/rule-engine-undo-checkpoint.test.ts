import { describe, expect, it } from "bun:test";
import type { FlowDefinition } from "../../flow/flow-definition";
import type { GameDefinition } from "../../game-definition/game-definition";
import type { GameMoveDefinitions } from "../../game-definition/move-definitions";
import { createPlayerId } from "../../types";
import type { PlayerId } from "../../types";
import { RuleEngine } from "../rule-engine";

/**
 * undo()/redo() restore COMPLETE checkpoints: game state, internalState (in
 * place), the flow machine, the RNG cursor, trackers, the game-over latch and
 * the definition's historyExtension — grouped by beginUndoGroup/endUndoGroup.
 */

interface S {
  drawn: string[];
  rolls: number[];
  turnLog: string[];
  over: boolean;
}

interface M {
  roll: Record<string, never>;
  markOnce: Record<string, never>;
  pass: Record<string, never>;
  win: Record<string, never>;
  boom: Record<string, never>;
}

let external = 0;

function makeEngine() {
  external = 0;
  const moves: GameMoveDefinitions<S, M> = {
    boom: {
      reducer: (_draft, ctx) => {
        ctx.zones.moveCard({ cardId: "c1" as never, targetZoneId: "hand" as never });
        throw new Error("halfway");
      },
    },
    markOnce: {
      condition: (_s, ctx) => !ctx.trackers?.check("marked", ctx.playerId),
      reducer: (_draft, ctx) => {
        ctx.trackers?.mark("marked", ctx.playerId);
        external += 1;
      },
    },
    pass: {
      reducer: (_draft, ctx) => {
        ctx.flow?.endTurn();
      },
    },
    roll: {
      reducer: (draft, ctx) => {
        draft.rolls.push(ctx.rng.randomInt(1, 1_000_000));
      },
    },
    win: {
      reducer: (draft, ctx) => {
        draft.over = true;
        ctx.endGame?.({ reason: "test", winner: ctx.playerId });
      },
    },
  };
  const flow: FlowDefinition<S> = {
    turn: {
      onBegin: (ctx) => {
        ctx.state.turnLog.push(`begin ${ctx.getTurnNumber()} ${ctx.getCurrentPlayer()}`);
        // A flow hook that mutates INTERNAL state through the ops the
        // FlowManager was constructed with (draw a card at turn start).
        const drawn = ctx.zones.drawCards({ count: 1, from: "deck" as never, playerId: createPlayerId("p1"), to: "hand" as never });
        for (const id of drawn) {
          ctx.state.drawn.push(String(id));
        }
      },
      phases: { main: { next: undefined, order: 0 } },
    },
  };
  const def: GameDefinition<S, M> = {
    flow,
    historyExtension: {
      restore: (s) => {
        external = s as number;
      },
      snapshot: () => external,
    },
    moves,
    name: "undo-checkpoints",
    setup: () => ({ drawn: [], over: false, rolls: [], turnLog: [] }),
    trackers: { perPlayer: true, perTurn: ["marked"] },
    zones: {
      deck: { faceDown: true, id: "deck" as never, name: "Deck", ordered: true, visibility: "private" },
      hand: { faceDown: false, id: "hand" as never, name: "Hand", ordered: false, visibility: "private" },
    },
  };
  const players = [
    { id: createPlayerId("p1"), name: "A" },
    { id: createPlayerId("p2"), name: "B" },
  ];
  const engine = new RuleEngine(def, players, { seed: "cp" });
  const internal = (engine as unknown as { internalState: { zones: Record<string, { cardIds: string[] }>; cards: Record<string, unknown> } }).internalState;
  for (let i = 0; i < 6; i++) {
    const id = `c${i}`;
    internal.zones.deck?.cardIds.push(id);
    internal.cards[id] = { controller: "p1", definitionId: "x", owner: "p1", zone: "deck" };
  }
  return { engine, internal };
}

const p1 = createPlayerId("p1") as PlayerId;

function position(engine: RuleEngine<S, M>) {
  const priv = engine as unknown as { internalState: unknown; rng: { getState(): unknown }; trackerSystem: { getState(): unknown } };
  return JSON.stringify({
    ended: engine.hasGameEnded(),
    external,
    flow: engine.getFlowManager()?.serializeFlowState(),
    internal: priv.internalState,
    result: engine.getGameEndResult() ?? null,
    rng: priv.rng.getState(),
    state: engine.getState(),
    trackers: priv.trackerSystem.getState(),
  });
}

describe("RuleEngine undo/redo — complete checkpoints", () => {
  it("across a turn transition: flow turn/player, the onBegin draw (internal state) and its state effects are rewound and redone", () => {
    const { engine, internal } = makeEngine();
    const before = position(engine);
    const deck0 = [...(internal.zones.deck?.cardIds ?? [])];
    expect(engine.executeMove("pass", { params: {}, playerId: p1 }).success).toBe(true);
    expect(engine.getFlowManager()?.getTurnNumber()).toBe(2);
    expect(engine.getState().drawn.length).toBe(1); // the turn-2 onBegin draw (the deck was empty at init)
    expect(internal.zones.hand?.cardIds).toEqual(["c0"]);
    const after = position(engine);

    expect(engine.undo()).toBe(true);
    expect(position(engine)).toBe(before);
    expect(engine.getFlowManager()?.getTurnNumber()).toBe(1);
    expect(internal.zones.deck?.cardIds).toEqual(deck0);
    expect(internal.zones.hand?.cardIds).toEqual([]);

    expect(engine.redo()).toBe(true);
    expect(position(engine)).toBe(after);
    expect(internal.zones.hand?.cardIds).toEqual(["c0"]);
    // The flow (and its ops over the SAME internal object) are live: another pass draws again.
    expect(engine.executeMove("pass", { params: {}, playerId: p1 }).success).toBe(true);
    expect(engine.getState().drawn).toEqual(["c0", "c1"]);
    expect(internal.zones.hand?.cardIds).toEqual(["c0", "c1"]);
  });

  it("RNG cursor: undo + re-issue reproduces the same roll; redo restores the rolled value", () => {
    const { engine } = makeEngine();
    engine.executeMove("roll", { params: {}, playerId: p1 });
    const first = engine.getState().rolls[0];
    engine.undo();
    expect(engine.getState().rolls).toEqual([]);
    engine.executeMove("roll", { params: {}, playerId: p1 });
    expect(engine.getState().rolls[0]).toBe(first as number);
    engine.executeMove("roll", { params: {}, playerId: p1 });
    const second = engine.getState().rolls[1];
    engine.undo();
    engine.redo();
    expect(engine.getState().rolls).toEqual([first as number, second as number]);
    engine.executeMove("roll", { params: {}, playerId: p1 });
    expect(engine.getState().rolls[2]).not.toBe(second as number);
  });

  it("trackers, historyExtension and the game-over latch ride along", () => {
    const { engine } = makeEngine();
    expect(engine.executeMove("markOnce", { params: {}, playerId: p1 }).success).toBe(true);
    expect(external).toBe(1);
    expect(engine.executeMove("markOnce", { params: {}, playerId: p1 }).success).toBe(false); // tracker set
    expect(engine.undo()).toBe(true);
    expect(external).toBe(0);
    expect(engine.executeMove("markOnce", { params: {}, playerId: p1 }).success).toBe(true); // tracker cleared by undo
    expect(engine.executeMove("win", { params: {}, playerId: p1 }).success).toBe(true);
    expect(engine.hasGameEnded()).toBe(true);
    expect(engine.executeMove("roll", { params: {}, playerId: p1 }).success).toBe(false); // GAME_ENDED
    expect(engine.undo()).toBe(true);
    expect(engine.hasGameEnded()).toBe(false);
    expect(engine.getGameEndResult()).toBeUndefined();
    expect(engine.executeMove("roll", { params: {}, playerId: p1 }).success).toBe(true);
  });

  it("undo groups: several moves inside withUndoGroup rewind/redo as one; getReplayHistory is the applied prefix; canUndo/canRedo/peekRedo/getHistoryPosition", () => {
    const { engine } = makeEngine();
    const h0 = position(engine);
    engine.withUndoGroup(() => {
      engine.executeMove("roll", { params: {}, playerId: p1 });
      engine.executeMove("roll", { params: {}, playerId: p1 });
      engine.executeMove("pass", { params: {}, playerId: p1 });
    });
    engine.executeMove("roll", { params: {}, playerId: p1 });
    expect(engine.getReplayHistory()).toHaveLength(4);
    expect(engine.getHistoryPosition()).toEqual({ applied: 4, redoGroups: 0, redoable: 0, undoGroups: 2 });
    const serials = engine.getReplayHistory().map((e) => e.serial);
    expect(new Set(serials).size).toBe(4);

    expect(engine.undo()).toBe(true); // the lone roll
    expect(engine.getReplayHistory()).toHaveLength(3);
    expect(engine.undo()).toBe(true); // the whole group
    expect(engine.getReplayHistory()).toHaveLength(0);
    expect(position(engine)).toBe(h0);
    expect(engine.canUndo()).toBe(false);
    expect(engine.undo()).toBe(false);
    expect(engine.canRedo()).toBe(true);
    expect(engine.peekRedo()?.moveId).toBe("roll");
    expect(engine.getHistoryPosition()).toEqual({ applied: 0, redoGroups: 2, redoable: 4, undoGroups: 0 });

    expect(engine.redo()).toBe(true); // group back in one step
    expect(engine.getReplayHistory()).toHaveLength(3);
    expect(engine.getFlowManager()?.getTurnNumber()).toBe(2);
    // A new move now truncates the remaining redo branch and gets a fresh serial.
    engine.executeMove("markOnce", { params: {}, playerId: p1 });
    expect(engine.canRedo()).toBe(false);
    expect(engine.redo()).toBe(false);
    expect(engine.getReplayHistory().at(-1)?.serial).toBeGreaterThan(Math.max(...(serials as number[])));
  });

  it("a throwing reducer rolls internal state back IN PLACE (flow ops stay attached to the live object)", () => {
    const { engine, internal } = makeEngine();
    const deckBefore = [...(internal.zones.deck?.cardIds ?? [])];
    const r = engine.executeMove("boom", { params: {}, playerId: p1 });
    expect(r.success).toBe(false);
    expect(internal.zones.deck?.cardIds).toEqual(deckBefore);
    // Same object identity is what keeps the FlowManager's ops valid:
    expect((engine as unknown as { internalState: unknown }).internalState).toBe(internal);
    expect(engine.executeMove("pass", { params: {}, playerId: p1 }).success).toBe(true);
    expect(internal.zones.hand?.cardIds).toEqual(["c0"]); // the turn-2 draw landed on the live object
    expect(engine.getState().drawn).toEqual(["c0"]);
  });
});
