/**
 * Phase B batch 27 iter-3 — RiftAtlas parity gap closures.
 *
 * Covers the new presentational components:
 *   - DeckPile renders the size badge + a label.
 *   - PowerGlyphs renders energy + each power key with a count.
 *   - VpBadge shows current/target and exposes the won state.
 *   - PlayerPanel mounts deck pile + VP badge + phase active marker.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeckPile } from "../components/DeckPile";
import { PowerGlyphs } from "../components/PowerGlyphs";
import { VpBadge } from "../components/VpBadge";
import { PlayPage } from "../PlayPage";
import type { StateResponse } from "../lib/api";

describe("DeckPile", () => {
  it("renders the count badge with the deck size", () => {
    render(<DeckPile size={27} label="deck" testId="dp" />);
    expect(screen.getByTestId("dp")).toBeInTheDocument();
    expect(screen.getByTestId("dp-count")).toHaveTextContent("27");
    expect(screen.getByTestId("dp")).toHaveAttribute("data-size", "27");
  });
});

describe("PowerGlyphs", () => {
  it("renders the energy glyph + one per power key", () => {
    render(
      <PowerGlyphs
        energy={3}
        power={{ body: 1, mind: 2 }}
        testId="pg"
      />,
    );
    expect(screen.getByTestId("pg-energy")).toHaveTextContent("3");
    expect(screen.getByTestId("pg-body")).toHaveTextContent("1");
    expect(screen.getByTestId("pg-mind")).toHaveTextContent("2");
  });

  it("handles an empty power map", () => {
    render(<PowerGlyphs energy={0} power={{}} testId="pg2" />);
    expect(screen.getByTestId("pg2-energy")).toHaveTextContent("0");
  });
});

describe("VpBadge", () => {
  it("shows current and target VPs", () => {
    render(<VpBadge current={2} target={8} testId="vp" />);
    const badge = screen.getByTestId("vp");
    expect(badge).toHaveAttribute("data-current", "2");
    expect(badge).toHaveAttribute("data-target", "8");
    expect(badge.textContent).toContain("2");
    expect(badge.textContent).toContain("8");
    expect(badge.className).not.toContain("vp-badge-won");
  });

  it("marks won when current >= target", () => {
    render(<VpBadge current={8} target={8} testId="vp-won" />);
    expect(screen.getByTestId("vp-won").className).toContain("vp-badge-won");
  });
});

describe("PlayPage RiftAtlas parity wiring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts deck piles, VP badge, power glyphs, and turn marker", async () => {
    const state: StateResponse = {
      hand: { "player-1": [], "player-2": [] },
      isGameOver: false,
      trail: [],
      view: {
        gameId: "g",
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
          { id: "draw", label: "Draw" },
          { id: "main", label: "Main" },
          { id: "end", label: "End" },
        ],
        players: [
          {
            id: "player-1",
            victoryPoints: 1,
            xp: 0,
            handSize: 5,
            deckSize: 30,
            runeDeckSize: 12,
            trashSize: 0,
            energy: 3,
            power: { body: 1 },
          },
          {
            id: "player-2",
            victoryPoints: 0,
            xp: 0,
            handSize: 5,
            deckSize: 28,
            runeDeckSize: 12,
            trashSize: 1,
            energy: 0,
            power: {},
          },
        ],
        battlefields: [],
      },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(state), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("play-page")).toBeInTheDocument();
    });

    // Deck/rune/trash piles for each player.
    expect(screen.getByTestId("deck-pile-player-1")).toBeInTheDocument();
    expect(screen.getByTestId("deck-pile-player-1-count")).toHaveTextContent(
      "30",
    );
    expect(screen.getByTestId("rune-pile-player-1-count")).toHaveTextContent(
      "12",
    );
    expect(screen.getByTestId("trash-pile-player-2-count")).toHaveTextContent(
      "1",
    );

    // VP badges.
    const vp = screen.getByTestId("vp-badge-player-1");
    expect(vp).toHaveAttribute("data-current", "1");
    expect(vp).toHaveAttribute("data-target", "8");

    // Power glyphs — energy always rendered, plus body for player-1.
    expect(
      screen.getByTestId("power-glyphs-player-1-energy"),
    ).toHaveTextContent("3");
    expect(
      screen.getByTestId("power-glyphs-player-1-body"),
    ).toHaveTextContent("1");

    // Turn marker only on the active player.
    expect(screen.getByTestId("turn-marker-player-1")).toBeInTheDocument();
    expect(screen.queryByTestId("turn-marker-player-2")).toBeNull();

    // Phase strip exposes active flag and numbers each step.
    expect(screen.getByTestId("phase-main")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("phase-draw")).toHaveAttribute(
      "data-active",
      "false",
    );
  });
});
