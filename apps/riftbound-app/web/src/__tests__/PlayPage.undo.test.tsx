/**
 * PlayPage — Slice 4 (undo/rewind) UI tests.
 *
 * Covers:
 *   - Undo button is hidden when there's no move in history (undoCount=0).
 *   - Undo button is shown but disabled when canUndoBy[localPlayerId] is false
 *     (e.g. opponent moved since, or chain item resolved).
 *   - Undo button is shown + enabled when canUndoBy[localPlayerId] is true.
 *   - Clicking Undo dispatches POST /api/v2/undo/:sessionId with the local
 *     player's id in the body, and shows a "Move undone" toast on success.
 *   - The button label reflects `undo.lastMove.label` ("Undo (Sabotage)").
 *
 * Uses the same fetch-stub pattern as PlayPage.actions.test.tsx so the
 * tests are deterministic and don't require a real server.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import type { MoveResponse, StateResponse } from "../lib/api";

const baseView = {
  battlefields: [],
  gameId: "g1",
  phaseStrip: [{ id: "main", label: "Main" }],
  players: [
    {
      baseUnits: [],
      deckSize: 30,
      energy: 3,
      handSize: 0,
      id: "player-1",
      power: {},
      runeDeckSize: 12,
      trashSize: 0,
      victoryPoints: 0,
      xp: 0,
    },
    {
      baseUnits: [],
      deckSize: 30,
      energy: 0,
      handSize: 0,
      id: "player-2",
      power: {},
      runeDeckSize: 12,
      trashSize: 0,
      victoryPoints: 0,
      xp: 0,
    },
  ],
  status: "playing",
  turn: {
    activePlayer: "player-1",
    number: 1,
    phase: "main",
    phaseLabel: "Main",
  },
  victoryScore: 8,
  winner: null,
} as const;

// State with NO history — Undo button should not render.
const stateNoHistory: StateResponse = {
  actionsLegal: { endTurn: true, stepBot: false },
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  trail: [],
  undo: { canUndoBy: { "player-1": false, "player-2": false }, undoCount: 0 },
  view: baseView,
  whoseTurnNow: "human",
};

// State with history but local player can't undo (e.g. opponent moved).
const stateUndoBlocked: StateResponse = {
  actionsLegal: { endTurn: true, stepBot: false },
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  trail: [{ seq: 1, playerId: "player-2", moveId: "playUnit", params: {}, success: true }],
  undo: {
    canUndoBy: { "player-1": false, "player-2": false },
    undoCount: 1,
    lastMove: { moveId: "playUnit", playerId: "player-2", label: "playUnit", stepSeq: 1 },
  },
  view: baseView,
  whoseTurnNow: "human",
};

// State with history AND local player can undo their own last move.
const stateCanUndo: StateResponse = {
  actionsLegal: { endTurn: true, stepBot: false },
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  trail: [
    { seq: 1, playerId: "player-1", moveId: "playUnit", params: { cardId: "card-A" }, success: true },
  ],
  undo: {
    canUndoBy: { "player-1": true, "player-2": false },
    undoCount: 1,
    lastMove: { moveId: "playUnit", playerId: "player-1", label: "Sabotage", stepSeq: 1, cardId: "card-A" },
  },
  view: baseView,
  whoseTurnNow: "human",
};

// Server's response to a successful POST /api/v2/undo
const undoSuccess: MoveResponse = {
  actionsLegal: { endTurn: true, stepBot: false },
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  ok: true,
  trail: [
    // The original step is preserved with `undone: true` flagged.
    { seq: 1, playerId: "player-1", moveId: "playUnit", params: { cardId: "card-A" }, success: true, undone: true },
  ],
  undo: { canUndoBy: { "player-1": false, "player-2": false }, undoCount: 0 },
  undone: { moveId: "playUnit", playerId: "player-1", label: "Sabotage", stepSeq: 1 },
  view: baseView,
  whoseTurnNow: "human",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("PlayPage Undo button (slice 4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT render the Undo button when there is no move history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(stateNoHistory)),
    );

    render(<PlayPage sessionId="undo-test-1" localPlayerId="player-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("play-page")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("undo")).toBeNull();
  });

  it("renders the Undo button DISABLED when canUndoBy[localPlayer] is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(stateUndoBlocked)),
    );

    render(<PlayPage sessionId="undo-test-2" localPlayerId="player-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("undo")).toBeInTheDocument();
    });

    const undoBtn = screen.getByTestId("undo") as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    expect(undoBtn.title).toMatch(/Undo unavailable/i);
  });

  it("renders the Undo button ENABLED with a card-name label when canUndoBy is true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(stateCanUndo)),
    );

    render(<PlayPage sessionId="undo-test-3" localPlayerId="player-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("undo")).toBeInTheDocument();
    });

    const undoBtn = screen.getByTestId("undo") as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(false);
    // Label includes the last-move name ("Sabotage" in our fixture).
    expect(undoBtn.textContent).toMatch(/Undo \(Sabotage\)/);
  });

  it("clicking Undo POSTs /api/v2/undo with the local player's id and shows a toast", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(stateCanUndo))
      .mockResolvedValueOnce(jsonResponse(undoSuccess));
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="undo-test-4" localPlayerId="player-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("undo")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("undo"));

    await waitFor(() => {
      expect(screen.getByTestId("toast")).toBeInTheDocument();
    });

    // Verify the fetch call signature: POST /api/v2/undo/<sessionId> with
    // The local player's id in the body.
    const undoCall = fetchMock.mock.calls.find(
      ([url]) => typeof url === "string" && url.includes("/api/v2/undo/"),
    );
    expect(undoCall).toBeDefined();
    const [, init] = undoCall!;
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ playerId: "player-1" });

    // Toast surfaces the undone move's label.
    expect(screen.getByTestId("toast")).toHaveTextContent(/Move undone/i);
    expect(screen.getByTestId("toast")).toHaveTextContent(/Sabotage/i);
  });
});
