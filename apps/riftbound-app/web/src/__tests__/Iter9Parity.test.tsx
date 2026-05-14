/**
 * Iter-9 RiftAtlas-parity polish tests.
 *
 * Covers four gaps:
 *   1. Right-rail restructure — Combat & Chain wrapped in <details>
 *      with `data-testid="rail-section-combat"` / `rail-section-chain`.
 *      Combat/Chain default-open when present, default-collapsed when
 *      absent (still rendered as empty placeholders so the player
 *      knows the section exists). MoveLog gets a `.move-log-fill`
 *      wrapper so it expands to fill remaining vertical space.
 *   2. TurnBanner — styled banner at the top of the right rail with
 *      Turn number, active player avatar + id, phase label, status
 *      pill. Replaces the prior plain-text page header.
 *   3. Unaffordable card overlay — `canAfford` helper compares the
 *      card's energy/power cost against the player's pool. The chip
 *      gains `.hand-chip-unaffordable` + a `✗` badge when the player
 *      lacks resources; otherwise it renders normally.
 *   4. (Background pattern — pure CSS, not unit-testable.)
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import { PlayerPanel, canAfford } from "../components/PlayerPanel";
import { TurnBanner } from "../components/TurnBanner";
import type {
  GameViewPlayer,
  HandCard,
  StateResponse,
} from "../lib/api";

const samplePlayer: GameViewPlayer = {
  deckSize: 30,
  energy: 2,
  handSize: 2,
  id: "player-1",
  power: { Body: 1 },
  runeDeckSize: 12,
  trashSize: 0,
  victoryPoints: 0,
  xp: 0,
};

function makeBasicState(): StateResponse {
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
        number: 3,
        activePlayer: "player-1",
        phase: "main",
        phaseLabel: "Main",
      },
      phaseStrip: [
        { id: "main", label: "Main" },
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

describe("iter-9 gap 3 — canAfford helper", () => {
  it("returns true when player has enough energy and no power cost", () => {
    expect(canAfford({ energyCost: 1 }, { energy: 2, power: {} })).toBe(true);
  });
  it("returns false when energy is insufficient", () => {
    expect(canAfford({ energyCost: 3 }, { energy: 1, power: {} })).toBe(false);
  });
  it("returns false when a required power glyph is missing", () => {
    expect(
      canAfford(
        { energyCost: 0, powerCost: ["Body"] },
        { energy: 5, power: {} },
      ),
    ).toBe(false);
  });
  it("returns true when player has all required power glyphs", () => {
    expect(
      canAfford(
        { energyCost: 1, powerCost: ["Body", "Mind"] },
        { energy: 2, power: { Body: 1, Mind: 1 } },
      ),
    ).toBe(true);
  });
  it("counts duplicate power requirements correctly", () => {
    expect(
      canAfford(
        { powerCost: ["Body", "Body"] },
        { energy: 0, power: { Body: 1 } },
      ),
    ).toBe(false);
    expect(
      canAfford(
        { powerCost: ["Body", "Body"] },
        { energy: 0, power: { Body: 2 } },
      ),
    ).toBe(true);
  });
  it("treats no-cost cards as always affordable", () => {
    expect(canAfford({}, { energy: 0, power: {} })).toBe(true);
  });
});

describe("iter-9 gap 3 — unaffordable hand chip overlay", () => {
  it("adds .hand-chip-unaffordable + badge when player can't pay energy cost", () => {
    const card: HandCard = {
      definitionId: "def-1",
      energyCost: 5,
      id: "h1",
      name: "Big Spell",
    };
    render(
      <PlayerPanel
        player={samplePlayer}
        isActive
        victoryScore={8}
        hand={[card]}
        onPlayCard={() => {}}
        canPlay
      />,
    );
    const chip = screen.getByTestId("hand-chip-h1");
    expect(chip.className).toContain("hand-chip-unaffordable");
    expect(chip.getAttribute("data-affordable")).toBe("false");
    expect(screen.getByTestId("hand-chip-unaffordable-h1")).toBeInTheDocument();
  });

  it("does NOT add unaffordable class when player has enough resources", () => {
    const card: HandCard = {
      definitionId: "def-2",
      energyCost: 1,
      id: "h2",
      name: "Cheap Card",
      powerCost: ["Body"],
    };
    render(
      <PlayerPanel
        player={samplePlayer}
        isActive
        victoryScore={8}
        hand={[card]}
        onPlayCard={() => {}}
        canPlay
      />,
    );
    const chip = screen.getByTestId("hand-chip-h2");
    expect(chip.className).not.toContain("hand-chip-unaffordable");
    expect(chip.getAttribute("data-affordable")).toBe("true");
    expect(screen.queryByTestId("hand-chip-unaffordable-h2")).toBeNull();
  });

  it("marks unaffordable even when canPlay=false (resource gap is stable)", () => {
    const card: HandCard = {
      definitionId: "def-3",
      energyCost: 9,
      id: "h3",
      name: "Bigger Spell",
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
    expect(chip.className).toContain("hand-chip-unaffordable");
    expect(chip.getAttribute("data-affordable")).toBe("false");
  });
});

describe("iter-9 gap 2 — TurnBanner", () => {
  it("renders turn number, active player id + avatar, phase, and status pill", () => {
    render(
      <TurnBanner
        turnNumber={7}
        phaseLabel="Channel"
        activePlayerId="player-2"
        status="playing"
        winner={null}
      />,
    );
    expect(screen.getByTestId("turn-banner-turn").textContent).toContain("Turn 7");
    expect(screen.getByTestId("turn-banner-active-name").textContent).toBe(
      "player-2",
    );
    expect(screen.getByTestId("turn-banner-avatar").textContent).toBe("2");
    expect(screen.getByTestId("turn-banner-phase").textContent).toBe("Channel");
    expect(screen.getByTestId("turn-banner-status").textContent).toBe("playing");
  });

  it("shows winner row and finished status when winner is set", () => {
    render(
      <TurnBanner
        turnNumber={12}
        phaseLabel="Cleanup"
        activePlayerId="player-1"
        status="playing"
        winner="player-1"
      />,
    );
    expect(screen.getByTestId("turn-banner-winner").textContent).toContain(
      "player-1",
    );
    expect(screen.getByTestId("turn-banner-status").textContent).toBe("finished");
  });
});

describe("iter-9 gap 1 — Right rail restructure (collapsible sections)", () => {
  it("renders rail-section-combat and rail-section-chain as <details> with TurnBanner above", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(makeBasicState()), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("board-side")).toBeInTheDocument();
    });

    // TurnBanner appears in the rail.
    expect(screen.getByTestId("turn-banner")).toBeInTheDocument();
    expect(screen.getByTestId("turn-banner-turn").textContent).toContain(
      "Turn 3",
    );

    // Combat + Chain rendered as collapsible sections (no active combat
    // Or chain here, so they render the empty-state variant).
    const combat = screen.getByTestId("rail-section-combat");
    expect(combat.tagName.toLowerCase()).toBe("details");
    expect(combat.className).toContain("rail-section-empty");

    const chain = screen.getByTestId("rail-section-chain");
    expect(chain.tagName.toLowerCase()).toBe("details");
    expect(chain.className).toContain("rail-section-empty");

    // Move log wrapped in a flex-filling container.
    expect(screen.getByTestId("move-log-fill")).toBeInTheDocument();
  });
});
