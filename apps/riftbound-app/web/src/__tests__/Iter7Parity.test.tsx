/**
 * Iter-7 RiftAtlas-parity polish tests.
 *
 * Covers:
 *   - Refresh button is icon-only (↻ glyph, aria-label "Refresh state",
 *     `.refresh-icon-btn` class).
 *   - BattlefieldList renders a status glyph (no UNCONTROLLED text pill);
 *     status data-attribute distinguishes uncontrolled / controlled /
 *     contested.
 *   - BattlefieldList renders a [i] rules-toggle when rulesText is present
 *     and the <pre data-testid="bf-rules-text-...">  is still in the DOM
 *     (so CardArt tests keep passing).
 *   - PlayerPanel renders a `.player-avatar` chip; the active player's
 *     avatar gets the `player-avatar-active` class.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import { BattlefieldList } from "../components/BattlefieldList";
import { PlayerPanel } from "../components/PlayerPanel";
import type { GameViewBattlefield, GameViewPlayer, StateResponse } from "../lib/api";

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

function makeState(): StateResponse {
  return {
    hand: { "player-1": [], "player-2": [] },
    isGameOver: false,
    trail: [],
    view: baseView,
  };
}

const samplePlayer: GameViewPlayer = {
  deckSize: 30,
  energy: 3,
  handSize: 0,
  id: "player-1",
  power: {},
  runeDeckSize: 12,
  trashSize: 0,
  victoryPoints: 0,
  xp: 0,
};

describe("iter-7 gap 1 — Refresh is an icon button", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders as an icon-only button with aria-label and ↻ glyph", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(makeState()), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("refresh")).toBeInTheDocument();
    });

    const btn = screen.getByTestId("refresh");
    expect(btn.className).toContain("refresh-icon-btn");
    expect(btn.getAttribute("aria-label")).toBe("Refresh state");
    expect(btn.getAttribute("title")).toBe("Refresh state");
    expect(btn.textContent).toContain("↻");
    expect(btn.textContent).not.toContain("Refresh ");
  });
});

describe("iter-7 gap 4 — BF status glyph (no UNCONTROLLED text pill)", () => {
  it("renders an uncontrolled glyph for a fresh BF", () => {
    const battlefields: GameViewBattlefield[] = [
      { contested: false, controller: null, id: "bf-1", units: [] },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    const status = screen.getByTestId("bf-status-bf-1");
    expect(status.getAttribute("data-status")).toBe("uncontrolled");
    expect(status.className).toContain("bf-status-uncontrolled");
    // No leftover UNCONTROLLED text pill
    expect(status.textContent?.toLowerCase()).not.toContain("uncontrolled");
    expect(status.textContent?.toLowerCase()).not.toContain("held by");
  });

  it("renders a controlled glyph when a controller is set", () => {
    const battlefields: GameViewBattlefield[] = [
      { contested: false, controller: "player-1", id: "bf-2", units: [] },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    const status = screen.getByTestId("bf-status-bf-2");
    expect(status.getAttribute("data-status")).toBe("controlled");
    expect(status.className).toContain("bf-status-controlled");
    expect(status.getAttribute("title")).toContain("held by player-1");
  });

  it("renders a contested glyph when bf.contested is true", () => {
    const battlefields: GameViewBattlefield[] = [
      { contested: true, controller: null, id: "bf-3", units: [] },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    const status = screen.getByTestId("bf-status-bf-3");
    expect(status.getAttribute("data-status")).toBe("contested");
    expect(status.className).toContain("bf-status-contested");
  });
});

describe("iter-7 gap 2 — BF rules collapse behind [i] toggle", () => {
  it("renders the [i] toggle and keeps the <pre> in the DOM", () => {
    const battlefields: GameViewBattlefield[] = [
      {
        contested: false,
        controller: null,
        id: "bf-rules",
        rulesText: "Action: Pay 2 energy.\nDraw a card.",
        units: [],
      },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    expect(screen.getByTestId("bf-rules-toggle-bf-rules")).toBeInTheDocument();
    // Pre still in DOM for CardArt test compatibility
    const pre = screen.getByTestId("bf-rules-text-bf-rules");
    expect(pre).toBeInTheDocument();
    expect(pre.textContent).toContain("Draw a card");
  });

  it("omits the toggle when rulesText is missing", () => {
    const battlefields: GameViewBattlefield[] = [
      { contested: false, controller: null, id: "bf-empty", units: [] },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    expect(screen.queryByTestId("bf-rules-toggle-bf-empty")).toBeNull();
  });
});

describe("iter-7 gap 5 — Player avatar chip", () => {
  it("renders a player-avatar with player-avatar-active when isActive", () => {
    render(
      <PlayerPanel
        player={samplePlayer}
        isActive
        victoryScore={8}
        hand={[]}
        onPlayCard={() => {}}
        canPlay={false}
      />,
    );
    const av = screen.getByTestId("player-avatar-player-1");
    expect(av).toBeInTheDocument();
    expect(av.className).toContain("player-avatar-active");
    expect(av.getAttribute("data-active")).toBe("true");
    // Initial = last digit "1"
    expect(av.textContent).toBe("1");
  });

  it("renders a neutral avatar when isActive=false", () => {
    render(
      <PlayerPanel
        player={{ ...samplePlayer, id: "player-2" }}
        isActive={false}
        victoryScore={8}
        hand={[]}
        onPlayCard={() => {}}
        canPlay={false}
      />,
    );
    const av = screen.getByTestId("player-avatar-player-2");
    expect(av).toBeInTheDocument();
    expect(av.className).not.toContain("player-avatar-active");
    expect(av.getAttribute("data-active")).toBe("false");
    expect(av.textContent).toBe("2");
  });
});
