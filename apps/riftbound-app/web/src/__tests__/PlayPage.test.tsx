import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import type { MoveResponse, StateResponse } from "../lib/api";

const fakeView = {
  battlefields: [],
  gameId: "g1",
  phaseStrip: [{ id: "main", label: "Main" }],
  players: [
    {
      id: "player-1",
      victoryPoints: 0,
      xp: 0,
      handSize: 1,
      deckSize: 30,
      runeDeckSize: 12,
      trashSize: 0,
      energy: 3,
      power: {},
    },
    {
      id: "player-2",
      victoryPoints: 0,
      xp: 0,
      handSize: 0,
      deckSize: 30,
      runeDeckSize: 12,
      trashSize: 0,
      energy: 0,
      power: {},
    },
  ],
  status: "playing",
  turn: {
    number: 1,
    activePlayer: "player-1",
    phase: "main",
    phaseLabel: "Main",
  },
  victoryScore: 8,
  winner: null,
} as const;

const fakeState: StateResponse = {
  hand: {
    "player-1": [{ id: "card-1", definitionId: "swift-scout" }],
    "player-2": [],
  },
  isGameOver: false,
  trail: [],
  view: fakeView,
};

const fakeMoveResponse: MoveResponse = {
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  ok: true,
  trail: [
    {
      seq: 1,
      playerId: "player-1",
      moveId: "playUnit",
      params: { cardId: "card-1" },
      success: true,
    },
  ],
  view: fakeView,
};

describe("PlayPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the board after fetching state", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(fakeState), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);

    expect(screen.getByTestId("loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("play-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("player-player-1")).toBeInTheDocument();
    expect(screen.getByTestId("hand-chip-card-1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/state/abc",
    );
  });

  it("posts a move when a hand chip is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fakeState), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fakeMoveResponse), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-card-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hand-chip-card-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const moveCall = fetchMock.mock.calls[1];
    expect(moveCall[0]).toBe("/api/v2/move/abc");
    expect(moveCall[1].method).toBe("POST");
    const body = JSON.parse(moveCall[1].body as string);
    expect(body.moveId).toBe("playFromHand");
    expect(body.params.cardId).toBe("card-1");
  });
});
