/**
 * Iter-6 RiftAtlas-parity polish tests.
 *
 * Covers:
 *   - Active-player seat gets the seat-active class + data-active flag so
 *     the gold-ring CSS hooks in (gap 3).
 *   - MoveLog emits a category dot per step with the right data-attribute
 *     and CSS class so the legend dots render (gap 4).
 *
 * Hand-fan and vertical-compression are purely CSS rule changes; they're
 * covered structurally by the existing RiftAtlasLayout suite (`.hand`,
 * `.seat`, `.battlefield-band` are still present and rendered).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import { MoveLog } from "../components/MoveLog";
import type { StateResponse, TrailStep } from "../lib/api";

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

function makeState(activePlayer: string): StateResponse {
  return {
    hand: { "player-1": [], "player-2": [] },
    isGameOver: false,
    trail: [],
    view: {
      ...baseView,
      turn: { ...baseView.turn, activePlayer },
    },
  };
}

describe("iter-6 gap 3 — active-player seat ring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("flags self seat as active when player-1 is the active player", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(makeState("player-1")), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("seat-self")).toBeInTheDocument();
    });

    const self = screen.getByTestId("seat-self");
    const opp = screen.getByTestId("seat-opponent");
    expect(self.getAttribute("data-active")).toBe("true");
    expect(self.className).toContain("seat-active");
    expect(opp.getAttribute("data-active")).toBe("false");
    expect(opp.className).not.toContain("seat-active");
  });

  it("flags opponent seat as active when player-2 is the active player", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(makeState("player-2")), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("seat-opponent")).toBeInTheDocument();
    });

    const self = screen.getByTestId("seat-self");
    const opp = screen.getByTestId("seat-opponent");
    expect(opp.getAttribute("data-active")).toBe("true");
    expect(opp.className).toContain("seat-active");
    expect(self.getAttribute("data-active")).toBe("false");
    expect(self.className).not.toContain("seat-active");
  });
});

describe("iter-6 gap 4 — MoveLog category dots", () => {
  it("renders a category dot with the right data-move-category for each move type", () => {
    const trail: TrailStep[] = [
      { moveId: "playFromHand", params: {}, playerId: "p1", seq: 1, success: true },
      { moveId: "assignAttacker", params: {}, playerId: "p1", seq: 2, success: true },
      { moveId: "assignDefender", params: {}, playerId: "p1", seq: 3, success: true },
      { moveId: "resolveCombat", params: {}, playerId: "p1", seq: 4, success: true },
      { moveId: "endTurn", params: {}, playerId: "p1", seq: 5, success: true },
      { moveId: "passChainPriority", params: {}, playerId: "p1", seq: 6, success: true },
      { moveId: "contestBattlefield", params: {}, playerId: "p1", seq: 7, success: true },
      { moveId: "startShowdown", params: {}, playerId: "p1", seq: 8, success: true },
      { moveId: "weirdNewMove", params: {}, playerId: "p1", seq: 9, success: true },
    ];
    render(<MoveLog trail={trail} />);

    const expectations: Record<number, string> = {
      1: "play",
      2: "attack",
      3: "defend",
      4: "combat",
      5: "end-turn",
      6: "pass",
      7: "contest",
      8: "start",
      9: "other",
    };
    for (const [seq, category] of Object.entries(expectations)) {
      const step = screen.getByTestId(`step-${seq}`);
      expect(step.getAttribute("data-move-category")).toBe(category);
      const dot = screen.getByTestId(`step-${seq}-dot`);
      expect(dot.className).toContain(`move-dot-${category}`);
    }
  });

  it("dot is rendered alongside the existing card-name + move-id text", () => {
    const trail: TrailStep[] = [
      {
        moveId: "playFromHand",
        params: { cardId: "card-x" },
        playerId: "p1",
        seq: 42,
        success: true,
      },
    ];
    render(<MoveLog trail={trail} cardNames={{ "card-x": "Swift Scout" }} />);
    const step = screen.getByTestId("step-42");
    expect(step.textContent).toContain("Swift Scout");
    expect(step.textContent).toContain("playFromHand");
    // Dot is the first visible element inside the step.
    expect(screen.getByTestId("step-42-dot")).toBeInTheDocument();
  });
});
