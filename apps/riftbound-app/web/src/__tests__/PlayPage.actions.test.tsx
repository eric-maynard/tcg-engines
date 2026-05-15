/**
 * PlayPage — Phase B batch 24 AAA action-legal + toast wiring.
 *
 * Goal B: server returns `actionsLegal` + `skipped` + per-move `error`. SPA
 * must disable End Turn / Step Bot when illegal and surface a transient
 * toast on illegal move / skipped step.
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
      id: "player-1",
      victoryPoints: 0,
      xp: 0,
      handSize: 0,
      deckSize: 30,
      runeDeckSize: 12,
      trashSize: 0,
      energy: 3,
      power: {},
      baseUnits: [],
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
      baseUnits: [],
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

const stateHumanTurn: StateResponse = {
  actionsLegal: { endTurn: true, stepBot: false },
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  trail: [],
  view: baseView,
  whoseTurnNow: "human",
};

const stateBotTurn: StateResponse = {
  actionsLegal: { endTurn: false, stepBot: true },
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  trail: [],
  view: baseView,
  whoseTurnNow: "bot",
};

const skippedStep: MoveResponse = {
  actionsLegal: { endTurn: true, stepBot: false },
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  ok: true,
  reason: "it's the human's turn",
  skipped: true,
  trail: [],
  view: baseView,
  whoseTurnNow: "human",
};

const failedMove: MoveResponse = {
  actionsLegal: { endTurn: true, stepBot: false },
  error: "not enough energy",
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  ok: false,
  trail: [],
  view: baseView,
  whoseTurnNow: "human",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("PlayPage actionsLegal + toast (batch 24 AAA)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("disables Step Bot when actionsLegal.stepBot is false (human's turn)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(stateHumanTurn)),
    );

    render(<PlayPage sessionId="aaa-test" />);

    await waitFor(() => {
      expect(screen.getByTestId("play-page")).toBeInTheDocument();
    });

    const stepBtn = screen.getByTestId("step-bot") as HTMLButtonElement;
    expect(stepBtn.disabled).toBe(true);
    expect(stepBtn.title).toMatch(/your turn/i);

    const endBtn = screen.getByTestId("end-turn") as HTMLButtonElement;
    expect(endBtn.disabled).toBe(false);
  });

  it("disables End Turn when actionsLegal.endTurn is false (bot's turn)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(stateBotTurn)),
    );

    render(<PlayPage sessionId="aaa-test" />);

    await waitFor(() => {
      expect(screen.getByTestId("play-page")).toBeInTheDocument();
    });

    const endBtn = screen.getByTestId("end-turn") as HTMLButtonElement;
    expect(endBtn.disabled).toBe(true);
    expect(endBtn.title).toMatch(/not legal/i);

    const stepBtn = screen.getByTestId("step-bot") as HTMLButtonElement;
    expect(stepBtn.disabled).toBe(false);
  });

  it("shows a toast when Step Bot returns skipped:true", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(stateBotTurn))
      .mockResolvedValueOnce(jsonResponse(skippedStep));
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="aaa-test" />);

    await waitFor(() => {
      expect(screen.getByTestId("step-bot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("step-bot"));

    await waitFor(() => {
      expect(screen.getByTestId("toast")).toBeInTheDocument();
    });

    expect(screen.getByTestId("toast")).toHaveTextContent(
      /Step Bot skipped/i,
    );
    expect(screen.getByTestId("toast")).toHaveTextContent(/human's turn/i);
  });

  it("shows a toast when a move returns ok:false with an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(stateHumanTurn))
      .mockResolvedValueOnce(jsonResponse(failedMove));
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="aaa-test" />);

    await waitFor(() => {
      expect(screen.getByTestId("end-turn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("end-turn"));

    await waitFor(() => {
      expect(screen.getByTestId("toast")).toBeInTheDocument();
    });
    expect(screen.getByTestId("toast")).toHaveTextContent(/Move failed/i);
    expect(screen.getByTestId("toast")).toHaveTextContent(
      /not enough energy/i,
    );
  });
});
