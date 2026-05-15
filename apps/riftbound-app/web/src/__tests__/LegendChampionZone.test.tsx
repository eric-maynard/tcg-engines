/**
 * LegendChampionZone — Iter-LegendChampion (admin priority 2026-05-15).
 *
 * The component renders two slots side-by-side (LEGEND + CHAMPION). When the
 * engine view's `legend` / `champion` field is `null`, the slot renders an
 * empty dashed placeholder so the zone is ALWAYS visible — never collapses
 * to zero height. These tests pin both states.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LegendChampionZone } from "../components/LegendChampionZone";
import type { BattlefieldUnit } from "../lib/api";

const legendCard: BattlefieldUnit = {
  controller: "player-1",
  definitionId: "diana-lunari",
  id: "card-legend-1",
  might: 3,
  name: "Diana, Lunari",
};

const championCard: BattlefieldUnit = {
  controller: "player-1",
  definitionId: "ezreal-dashing",
  id: "card-champion-1",
  might: 3,
  name: "Ezreal, Dashing",
};

describe("LegendChampionZone", () => {
  it("renders both slots with cards when populated", () => {
    render(
      <LegendChampionZone
        playerId="player-1"
        legend={legendCard}
        champion={championCard}
        side="self"
      />,
    );

    // Both card names render.
    expect(screen.getByText("Diana, Lunari")).toBeInTheDocument();
    expect(screen.getByText("Ezreal, Dashing")).toBeInTheDocument();

    // Slot tags are visible.
    expect(screen.getByText("LEGEND")).toBeInTheDocument();
    expect(screen.getByText("CHAMPION")).toBeInTheDocument();

    // Test ids for downstream queries.
    expect(
      screen.getByTestId("lc-slot-legend-player-1"),
    ).toHaveAttribute("data-empty", "false");
    expect(
      screen.getByTestId("lc-slot-champion-player-1"),
    ).toHaveAttribute("data-empty", "false");
  });

  it("renders empty placeholder slots when both cards are null", () => {
    render(
      <LegendChampionZone
        playerId="player-2"
        legend={null}
        champion={null}
        side="opponent"
      />,
    );

    // Empty slots still render the tag chips so the zone is visible.
    expect(screen.getByText("LEGEND")).toBeInTheDocument();
    expect(screen.getByText("CHAMPION")).toBeInTheDocument();

    // Both slots are marked empty.
    expect(
      screen.getByTestId("lc-slot-legend-player-2"),
    ).toHaveAttribute("data-empty", "true");
    expect(
      screen.getByTestId("lc-slot-champion-player-2"),
    ).toHaveAttribute("data-empty", "true");

    // Empty placeholder renders.
    expect(
      screen.getByTestId("lc-slot-placeholder-legend-player-2"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("lc-slot-placeholder-champion-player-2"),
    ).toBeInTheDocument();
  });

  it("renders card image when imageUrl is present", () => {
    const withImage: BattlefieldUnit = {
      ...legendCard,
      imageUrl: "https://example.com/legend.png",
    };
    render(
      <LegendChampionZone
        playerId="player-1"
        legend={withImage}
        champion={null}
        side="self"
      />,
    );
    const img = screen.getByTestId("lc-slot-image-legend-player-1");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/legend.png");
  });
});
