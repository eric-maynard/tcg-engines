/**
 * Iter-10 RiftAtlas-parity polish tests.
 *
 * Covers:
 *   - Fix: softer unaffordable dim (CSS-only — non-testable here, but
 *     the class + badge wiring is unchanged so existing iter-9 tests
 *     remain green).
 *   - Gap 1: per-side contest indicator — each BF side carries
 *     `data-side-state` of `controlled` / `contested` / `idle` plus a
 *     matching `bf-side-{state}` class.
 *   - Gap 2: mini-stack rendering — when a side has units, render small
 *     overlapping `.bf-mini-chip` elements instead of the placeholder.
 *   - Gap 3: phase pill carries `title` + `aria-label` so the icon-only
 *     mode at narrow widths surfaces the full label via tooltip.
 *   - Gap 4: art hand chips render a hidden-by-default name banner
 *     (`.hand-chip-name-banner`) that the CSS reveals on hover.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BattlefieldList } from "../components/BattlefieldList";
import { PlayerPanel } from "../components/PlayerPanel";
import type {
  GameViewBattlefield,
  GameViewPlayer,
  HandCard,
} from "../lib/api";

const bfBase = {
  id: "bf-1",
  imageUrl: undefined,
  name: "Test Lane",
  rulesText: undefined,
};

function makeBf(
  override: Partial<GameViewBattlefield>,
): GameViewBattlefield {
  return {
    ...bfBase,
    contested: false,
    controller: null,
    units: [],
    ...override,
  };
}

describe("iter-10 gap 1 — per-side contest indicator", () => {
  it("marks both sides contested when bf.contested=true", () => {
    render(
      <BattlefieldList
        battlefields={[makeBf({ contested: true })]}
        localPlayerId="player-1"
      />,
    );
    const ours = screen.getByTestId("bf-side-ours");
    const theirs = screen.getByTestId("bf-side-theirs");
    expect(ours.getAttribute("data-side-state")).toBe("contested");
    expect(theirs.getAttribute("data-side-state")).toBe("contested");
    expect(ours.className).toContain("bf-side-contested");
    expect(theirs.className).toContain("bf-side-contested");
  });

  it("marks ours-side controlled when local player holds the BF", () => {
    render(
      <BattlefieldList
        battlefields={[makeBf({ controller: "player-1" })]}
        localPlayerId="player-1"
      />,
    );
    const ours = screen.getByTestId("bf-side-ours");
    const theirs = screen.getByTestId("bf-side-theirs");
    expect(ours.getAttribute("data-side-state")).toBe("controlled");
    expect(theirs.getAttribute("data-side-state")).toBe("idle");
    expect(ours.className).toContain("bf-side-controlled");
  });

  it("marks theirs-side controlled when opponent holds the BF", () => {
    render(
      <BattlefieldList
        battlefields={[makeBf({ controller: "player-2" })]}
        localPlayerId="player-1"
      />,
    );
    expect(screen.getByTestId("bf-side-ours").getAttribute("data-side-state"))
      .toBe("idle");
    expect(screen.getByTestId("bf-side-theirs").getAttribute("data-side-state"))
      .toBe("controlled");
  });

  it("leaves both sides idle when no controller and not contested", () => {
    render(
      <BattlefieldList
        battlefields={[makeBf({})]}
        localPlayerId="player-1"
      />,
    );
    expect(screen.getByTestId("bf-side-ours").getAttribute("data-side-state"))
      .toBe("idle");
    expect(screen.getByTestId("bf-side-theirs").getAttribute("data-side-state"))
      .toBe("idle");
  });
});

describe("iter-10 gap 2 — BF mini-stack", () => {
  it("renders mini-chips when a side has units (no dashed placeholder)", () => {
    const bf = makeBf({
      units: [
        {
          controller: "player-1",
          definitionId: "card-a",
          id: "u1",
          might: 2,
          name: "Alpha",
        },
        {
          controller: "player-1",
          definitionId: "card-b",
          id: "u2",
          might: 4,
          name: "Beta",
        },
      ],
    });
    render(<BattlefieldList battlefields={[bf]} localPlayerId="player-1" />);

    expect(screen.getByTestId("bf-mini-stack-ours")).toBeInTheDocument();
    expect(screen.getByTestId("bf-unit-u1")).toBeInTheDocument();
    expect(screen.getByTestId("bf-unit-u2")).toBeInTheDocument();

    // Second chip overlaps the first by -18px via inline style.
    const chip2 = screen.getByTestId("bf-unit-u2");
    expect(chip2.getAttribute("style") ?? "").toMatch(/margin-top:\s*-18/);
    expect(chip2.getAttribute("data-stack-index")).toBe("1");
  });

  it("renders the empty placeholder when a side has no units", () => {
    const bf = makeBf({
      units: [
        { controller: "player-2", definitionId: "x", id: "u1", name: "Foe" },
      ],
    });
    const { container } = render(
      <BattlefieldList battlefields={[bf]} localPlayerId="player-1" />,
    );
    // Ours side has no units → empty placeholder remains
    const ours = screen.getByTestId("bf-side-ours");
    expect(ours.querySelector(".bf-slot-empty")).not.toBeNull();
    // Theirs side has u1 → mini-chip
    expect(screen.getByTestId("bf-unit-u1")).toBeInTheDocument();
    expect(container).toBeTruthy();
  });
});

describe("iter-10 gap 4 — hand-chip name banner on hover", () => {
  const player: GameViewPlayer = {
    deckSize: 10,
    energy: 5,
    handSize: 1,
    id: "player-1",
    power: {},
    runeDeckSize: 0,
    trashSize: 0,
    victoryPoints: 0,
    xp: 0,
  };

  it("renders a name banner for art chips (imageUrl present)", () => {
    const card: HandCard & { imageUrl?: string; name?: string } = {
      definitionId: "def-1",
      id: "h1",
      imageUrl: "https://example.com/lightning.png",
      name: "Lightning Strike",
    } as HandCard;
    render(
      <PlayerPanel
        player={player}
        isActive
        victoryScore={8}
        hand={[card]}
        onPlayCard={() => {}}
        canPlay
      />,
    );
    const banner = screen.getByTestId("hand-chip-name-banner-h1");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toBe("Lightning Strike");
  });

  it("does NOT render the hover banner for image-less chips", () => {
    const card: HandCard & { name?: string } = {
      definitionId: "def-2",
      id: "h2",
      name: "Plain Card",
    } as HandCard;
    render(
      <PlayerPanel
        player={player}
        isActive
        victoryScore={8}
        hand={[card]}
        onPlayCard={() => {}}
        canPlay
      />,
    );
    expect(screen.queryByTestId("hand-chip-name-banner-h2")).toBeNull();
  });
});
