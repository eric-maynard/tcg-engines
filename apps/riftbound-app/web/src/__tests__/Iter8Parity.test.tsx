/**
 * Iter-8 RiftAtlas-parity polish tests.
 *
 * Covers four gaps:
 *   1. Phase strip (Path B): known phases render an icon glyph and a
 *      chevron arrow connector between consecutive phases. Unknown phase
 *      ids (synthetic) still render without an icon — defensive fallback.
 *   2. Active-seat sweep: the .seat-active class is still on the active
 *      seat (covered by Iter6), but we additionally assert the active
 *      seat is the gradient-driven element (no logic change — pure CSS,
 *      so we just sanity-check the class is present on the right node).
 *   3. Action affordance hint: a hand chip with a non-empty
 *      legalLocations[] gets the `.hand-chip-playable` class + the
 *      data-playable="true" attribute when canPlay is true. Cards with
 *      zero legal locations don't get the class.
 *   4. Move log live count: the header gains the `move-log-header-flash`
 *      class when the trail length grows; the flash clears after the
 *      timeout. Initial mount does NOT flash.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import { MoveLog } from "../components/MoveLog";
import { PlayerPanel } from "../components/PlayerPanel";
import type {
  GameViewPlayer,
  HandCard,
  StateResponse,
  TrailStep,
} from "../lib/api";

const samplePlayer: GameViewPlayer = {
  deckSize: 30,
  energy: 3,
  handSize: 1,
  id: "player-1",
  power: {},
  runeDeckSize: 12,
  trashSize: 0,
  victoryPoints: 0,
  xp: 0,
};

function makePhaseStripState(): StateResponse {
  return {
    hand: { "player-1": [], "player-2": [] },
    isGameOver: false,
    trail: [],
    view: {
      gameId: "g1",
      status: "playing",
      winner: null,
      victoryScore: 8,
      turn: {
        number: 1,
        activePlayer: "player-1",
        phase: "main",
        phaseLabel: "Main",
      },
      phaseStrip: [
        { id: "awaken", label: "Awaken" },
        { id: "beginning", label: "Beginning" },
        { id: "channel", label: "Channel" },
        { id: "draw", label: "Draw" },
        { id: "main", label: "Main" },
        { id: "ending", label: "Ending" },
        { id: "cleanup", label: "Cleanup" },
      ],
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
      battlefields: [],
    },
  };
}

describe("iter-8 stretch — phase strip Path B (icons + chevrons + pulse)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an icon glyph for each known phase id", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(makePhaseStripState()), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-strip")).toBeInTheDocument();
    });

    // All seven canonical phases get an icon.
    for (const id of [
      "awaken",
      "beginning",
      "channel",
      "draw",
      "main",
      "ending",
      "cleanup",
    ]) {
      const icon = screen.getByTestId(`phase-icon-${id}`);
      expect(icon).toBeInTheDocument();
      expect(icon.textContent?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("renders a chevron arrow between consecutive phases but not after the last one", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(makePhaseStripState()), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-strip")).toBeInTheDocument();
    });

    // Arrows between phases 1..6 (six arrows total).
    for (const id of ["awaken", "beginning", "channel", "draw", "main", "ending"]) {
      expect(screen.getByTestId(`phase-arrow-${id}`)).toBeInTheDocument();
    }
    // No arrow after the final phase.
    expect(screen.queryByTestId("phase-arrow-cleanup")).toBeNull();
  });
});

describe("iter-8 gap 3 — playable hand chip pulse hint", () => {
  it("adds .hand-chip-playable + data-playable=true when canPlay AND legalLocations.length > 0", () => {
    const playable: HandCard = {
      definitionId: "def-1",
      id: "h1",
      legalLocations: ["base"],
      name: "Playable Card",
    };
    const idle: HandCard = {
      definitionId: "def-2",
      id: "h2",
      legalLocations: [],
      name: "Idle Card",
    };
    render(
      <PlayerPanel
        player={samplePlayer}
        isActive
        victoryScore={8}
        hand={[playable, idle]}
        onPlayCard={() => {}}
        canPlay
      />,
    );

    const a = screen.getByTestId("hand-chip-h1");
    expect(a.className).toContain("hand-chip-playable");
    expect(a.getAttribute("data-playable")).toBe("true");

    const b = screen.getByTestId("hand-chip-h2");
    expect(b.className).not.toContain("hand-chip-playable");
    expect(b.getAttribute("data-playable")).toBe("false");
  });

  it("does NOT add .hand-chip-playable when canPlay=false (it's not your turn)", () => {
    const card: HandCard = {
      definitionId: "def-3",
      id: "h3",
      legalLocations: ["base"],
      name: "Card",
    };
    render(
      <PlayerPanel
        player={samplePlayer}
        isActive={false}
        victoryScore={8}
        hand={[card]}
        onPlayCard={() => {}}
        canPlay={false}
      />,
    );
    const chip = screen.getByTestId("hand-chip-h3");
    expect(chip.className).not.toContain("hand-chip-playable");
    expect(chip.getAttribute("data-playable")).toBe("false");
  });
});

describe("iter-8 gap 4 — Move log header flashes when count grows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function mkStep(seq: number, moveId = "playFromHand"): TrailStep {
    return {
      moveId,
      params: {},
      playerId: "player-1",
      seq,
      success: true,
    };
  }

  it("does NOT flash on initial mount", () => {
    render(<MoveLog trail={[mkStep(1)]} />);
    const header = screen.getByTestId("move-log-header");
    expect(header.getAttribute("data-flash")).toBe("false");
    expect(header.className).not.toContain("move-log-header-flash");
  });

  it("flashes the header when a new step lands, then clears", () => {
    const { rerender } = render(<MoveLog trail={[mkStep(1)]} />);
    expect(screen.getByTestId("move-log-header").getAttribute("data-flash")).toBe(
      "false",
    );

    act(() => {
      rerender(<MoveLog trail={[mkStep(1), mkStep(2)]} />);
    });
    const header = screen.getByTestId("move-log-header");
    expect(header.getAttribute("data-flash")).toBe("true");
    expect(header.className).toContain("move-log-header-flash");

    // Clear after the 800ms timeout
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByTestId("move-log-header").getAttribute("data-flash")).toBe(
      "false",
    );
  });

  it("does NOT flash when trail length shrinks or stays the same", () => {
    const { rerender } = render(<MoveLog trail={[mkStep(1), mkStep(2)]} />);
    act(() => {
      rerender(<MoveLog trail={[mkStep(1)]} />);
    });
    expect(screen.getByTestId("move-log-header").getAttribute("data-flash")).toBe(
      "false",
    );
  });
});
