/**
 * BaseZone — Phase B batch 24 AAA.
 *
 * The component previously always rendered "(empty)" because nothing
 * upstream populated its `units` prop. AAA now threads per-player base
 * units through the v2 API (`view.players[].baseUnits`) and PlayPage feeds
 * them in. These tests pin the rendered output for the populated case so
 * regressions are caught early.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BaseZone } from "../components/BaseZone";
import type { BattlefieldUnit } from "../lib/api";

describe("BaseZone", () => {
  it("renders both units with their names when 2 units are present", () => {
    const units: BattlefieldUnit[] = [
      {
        controller: "player-1",
        definitionId: "swift-scout",
        id: "card-1",
        might: 2,
        name: "Swift Scout",
      },
      {
        controller: "player-1",
        definitionId: "warden",
        id: "card-2",
        might: 4,
        name: "Warden of the Gate",
      },
    ];

    render(<BaseZone playerId="player-1" units={units} />);

    // The (empty) placeholder must NOT render when units are present.
    expect(screen.queryByTestId("base-zone-player-1-empty")).toBeNull();

    // Both unit names render verbatim.
    expect(screen.getByText("Swift Scout")).toBeInTheDocument();
    expect(screen.getByText("Warden of the Gate")).toBeInTheDocument();

    // Per-unit chips are addressable by stable test ids.
    expect(screen.getByTestId("base-zone-unit-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("base-zone-unit-card-2")).toBeInTheDocument();

    // The zone is marked non-empty for downstream tests.
    const zone = screen.getByTestId("base-zone-player-1");
    expect(zone.getAttribute("data-base-empty")).toBe("false");
  });

  it("still renders (empty) placeholder when no units are passed", () => {
    render(<BaseZone playerId="player-2" units={[]} />);
    expect(
      screen.getByTestId("base-zone-player-2-empty"),
    ).toBeInTheDocument();
  });
});
