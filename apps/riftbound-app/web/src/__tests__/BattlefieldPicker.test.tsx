import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import type { MoveResponse, StateResponse } from "../lib/api";

/**
 * Fixture: player-1 has a hand card with legal locations including a
 * battlefield, so clicking the chip should open the picker rather than
 * directly post the move.
 */
const battlefields = [
  {
    contested: false,
    controller: "player-1",
    id: "player-1-bf-1",
    units: [],
  },
  {
    contested: true,
    controller: null,
    id: "player-1-bf-2",
    units: [],
  },
] as const;

const fakeView = {
  battlefields,
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

const stateWithChoices: StateResponse = {
  hand: {
    "player-1": [
      {
        id: "card-bf",
        definitionId: "swift-scout",
        legalLocations: ["base", "player-1-bf-1"],
      },
    ],
    "player-2": [],
  },
  isGameOver: false,
  trail: [],
  view: fakeView,
};

const okMoveResponse: MoveResponse = {
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  ok: true,
  trail: [],
  view: fakeView,
};

describe("BattlefieldPicker integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens picker on hand-chip click when multiple legal locations exist", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(stateWithChoices), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-card-bf")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hand-chip-card-bf"));

    expect(screen.getByTestId("battlefield-picker")).toBeInTheDocument();

    // "Play to Base" is legal
    const baseOpt = screen.getByTestId("picker-option-base");
    expect(baseOpt).not.toBeDisabled();
    expect(baseOpt.getAttribute("data-legal")).toBe("true");

    // Bf-1 is legal
    const bf1Opt = screen.getByTestId("picker-option-player-1-bf-1");
    expect(bf1Opt).not.toBeDisabled();

    // Bf-2 is shown but greyed out (not in legalLocations)
    const bf2Opt = screen.getByTestId("picker-option-player-1-bf-2");
    expect(bf2Opt).toBeDisabled();
    expect(bf2Opt.getAttribute("data-legal")).toBe("false");

    // No move POST yet — only the initial GET.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts playFromHand with chosen location after picker click", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(stateWithChoices), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(okMoveResponse), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-card-bf")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hand-chip-card-bf"));
    fireEvent.click(screen.getByTestId("picker-option-player-1-bf-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const moveCall = fetchMock.mock.calls[1];
    expect(moveCall[0]).toBe("/api/v2/move/abc");
    const body = JSON.parse(moveCall[1].body as string);
    expect(body.moveId).toBe("playFromHand");
    expect(body.playerId).toBe("player-1");
    expect(body.params.cardId).toBe("card-bf");
    expect(body.params.location).toBe("player-1-bf-1");

    // Picker should close after pick.
    expect(screen.queryByTestId("battlefield-picker")).toBeNull();
  });

  // Regression: ensure stable class names survive — the styles.css file in
  // Batch 21 TT depends on these class names. If a future refactor renames
  // Any of these, this assertion catches it before visual breakage ships.
  it("renders with stable class names that match styles.css selectors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(stateWithChoices), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-card-bf")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hand-chip-card-bf"));

    const picker = screen.getByTestId("battlefield-picker");
    expect(picker.className).toContain("battlefield-picker");
  });
});
