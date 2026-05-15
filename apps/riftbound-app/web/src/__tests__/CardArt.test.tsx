/**
 * Card-art rendering tests (Phase B batch 26 JJJ).
 *
 * Verifies that:
 *   - Hand chips render an <img> when HandCard.imageUrl is present.
 *   - Hand chips fall back to text-only when imageUrl is missing.
 *   - Battlefield tiles render the BF card image as a background.
 *
 * The data plumbing (imageUrl threaded through engine-session +
 * /api/v2/state) is covered by the engine-session lib test. Here we just
 * confirm the components react correctly when the field is present.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayerPanel } from "../components/PlayerPanel";
import { BattlefieldList } from "../components/BattlefieldList";
import type {
  GameViewBattlefield,
  GameViewPlayer,
  HandCard,
} from "../lib/api";

const player: GameViewPlayer = {
  baseUnits: [],
  deckSize: 30,
  energy: 3,
  handSize: 2,
  id: "p1",
  power: {},
  runeDeckSize: 12,
  trashSize: 0,
  victoryPoints: 0,
  xp: 0,
};

const SAMPLE_IMG =
  "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/abc-744x1039.png";

describe("Card art — hand chips", () => {
  it("renders an <img> when HandCard.imageUrl is provided", () => {
    const hand: HandCard[] = [
      {
        definitionId: "ogn-001-298",
        energyCost: 5,
        id: "p1-main-1-ogn-001-298",
        imageUrl: SAMPLE_IMG,
        might: 5,
        name: "Blazing Scorcher",
      },
    ];
    render(
      <PlayerPanel
        player={player}
        isActive
        victoryScore={8}
        hand={hand}
        onPlayCard={vi.fn()}
        canPlay
      />,
    );
    const img = screen.getByTestId(
      "hand-chip-image-p1-main-1-ogn-001-298",
    ) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe(SAMPLE_IMG);
    expect(img.getAttribute("alt")).toBe("Blazing Scorcher");
  });

  it("renders face-down card-backs when revealHand=false (opponent seat)", () => {
    const hand: HandCard[] = [
      {
        definitionId: "ogn-001-298",
        id: "p2-main-1-ogn-001-298",
        imageUrl: SAMPLE_IMG,
        name: "Blazing Scorcher",
      },
      {
        definitionId: "ogn-002-298",
        id: "p2-main-2-ogn-002-298",
        name: "Brazen Buccaneer",
      },
    ];
    render(
      <PlayerPanel
        player={{ ...player, id: "p2" }}
        isActive={false}
        victoryScore={8}
        hand={hand}
        onPlayCard={vi.fn()}
        canPlay={false}
        revealHand={false}
      />,
    );
    // Real card art must not leak.
    expect(
      screen.queryByTestId("hand-chip-image-p2-main-1-ogn-001-298"),
    ).toBeNull();
    // The face-down chips still render (so opponent hand silhouette is visible).
    const chip1 = screen.getByTestId("hand-chip-p2-main-1-ogn-001-298");
    expect(chip1).toHaveAttribute("data-face-down", "true");
    expect(chip1).toBeDisabled();
    expect(chip1).not.toHaveTextContent("Blazing Scorcher");
    const chip2 = screen.getByTestId("hand-chip-p2-main-2-ogn-002-298");
    expect(chip2).toHaveAttribute("data-face-down", "true");
    expect(chip2).not.toHaveTextContent("Brazen Buccaneer");
    // Hand container exposes the reveal flag for layout assertions.
    expect(screen.getByTestId("hand-p2")).toHaveAttribute(
      "data-reveal",
      "false",
    );
  });

  it("falls back to text chip when imageUrl is missing", () => {
    const hand: HandCard[] = [
      {
        definitionId: "ogn-002-298",
        energyCost: 3,
        id: "p1-main-2-ogn-002-298",
        name: "Brazen Buccaneer",
      },
    ];
    render(
      <PlayerPanel
        player={player}
        isActive
        victoryScore={8}
        hand={hand}
        onPlayCard={vi.fn()}
        canPlay
      />,
    );
    expect(
      screen.queryByTestId("hand-chip-image-p1-main-2-ogn-002-298"),
    ).toBeNull();
    const chip = screen.getByTestId("hand-chip-p1-main-2-ogn-002-298");
    expect(chip).toHaveAttribute("data-has-image", "false");
    expect(chip).toHaveTextContent("Brazen Buccaneer");
  });
});

describe("Card art — battlefield tiles", () => {
  it("renders a BF card image when battlefield.imageUrl is present", () => {
    const battlefields: GameViewBattlefield[] = [
      {
        contested: false,
        controller: null,
        id: "ogn-296-298",
        imageUrl: SAMPLE_IMG,
        name: "The Grand Plaza",
        units: [],
      },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    const bfImg = screen.getByTestId("bf-image-ogn-296-298") as HTMLImageElement;
    expect(bfImg).toBeInTheDocument();
    expect(bfImg.getAttribute("src")).toBe(SAMPLE_IMG);
    const tile = screen.getByTestId("bf-ogn-296-298");
    expect(tile).toHaveAttribute("data-has-image", "true");
    expect(tile).toHaveTextContent("The Grand Plaza");
  });

  it("renders verbatim rulesText on the BF tile including newlines", () => {
    const RULES = "Action: Pay 2 energy.\nEach player draws a card.";
    const battlefields: GameViewBattlefield[] = [
      {
        contested: false,
        controller: null,
        id: "ogn-297-298",
        name: "Plundered Outpost",
        rulesText: RULES,
        units: [],
      },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    const pre = screen.getByTestId("bf-rules-text-ogn-297-298");
    expect(pre).toBeInTheDocument();
    // Verbatim — textContent preserves the newline.
    expect(pre.textContent).toBe(RULES);
    expect(pre.textContent).toContain("\n");
  });

  it("omits the rules-text panel when rulesText is missing", () => {
    const battlefields: GameViewBattlefield[] = [
      {
        contested: false,
        controller: null,
        id: "bf-empty-rules",
        units: [],
      },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    expect(screen.queryByTestId("bf-rules-text-bf-empty-rules")).toBeNull();
  });

  it("renders a unit image when bf.units[i].imageUrl is present", () => {
    const battlefields: GameViewBattlefield[] = [
      {
        contested: false,
        controller: "p1",
        id: "bf-1",
        units: [
          {
            id: "u-1",
            definitionId: "ogn-001-298",
            controller: "p1",
            name: "Blazing Scorcher",
            might: 5,
            imageUrl: SAMPLE_IMG,
          },
        ],
      },
    ];
    render(<BattlefieldList battlefields={battlefields} />);
    const img = screen.getByTestId("bf-unit-image-u-1") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(SAMPLE_IMG);
  });
});
