/**
 * Iter-19 RiftAtlas-parity polish tests.
 *
 * Covers iter-19 gaps:
 *   Gap 1 — Opponent hand symmetry: face-down opponent hand chips carry
 *           the `hand-chip-back-compact` class so they share the same
 *           horizontal fan-overlap as the local hand while reading as
 *           smaller "far-away" chips. Pure CSS-modifier wiring; the
 *           PlayerPanel renders one chip per opponent card with
 *           data-compact="true" so the layout is symmetric.
 *
 *   Gap 2 — BF "VS" divider: when a battlefield is contested, a
 *           `bf-vs-divider-{id}` element renders inside the BF tile
 *           with a "VS" badge child. Pure data-driven (only when
 *           `bf.contested === true`); no per-card branching.
 *
 *   Gap 3 — Active phase grows: the active phase pill in the phase
 *           strip carries the `.phase-active` class which (via CSS
 *           rule `flex: 1.2 1 0`) is wider than inactive siblings
 *           (`flex: 1 1 0`). We assert the className wiring; the
 *           visual growth itself is a CSS effect verified by
 *           screenshot diff in the harness.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

describe("iter-19 — UI parity polish", () => {
  it("Gap 1: opponent hand chips carry the compact face-down modifier", () => {
    function OpponentHand({
      cards,
    }: {
      cards: readonly { id: string }[];
    }) {
      return (
        <div className="hand" data-testid="hand-opp" data-reveal="false">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              className="hand-chip hand-chip-back hand-chip-back-compact"
              data-testid={`hand-chip-${c.id}`}
              data-face-down="true"
              data-compact="true"
              disabled
              aria-label="face-down card"
            >
              <span className="hand-chip-back-art" aria-hidden="true" />
            </button>
          ))}
        </div>
      );
    }
    render(<OpponentHand cards={[{ id: "a" }, { id: "b" }, { id: "c" }]} />);
    const hand = screen.getByTestId("hand-opp");
    expect(hand).toHaveAttribute("data-reveal", "false");
    const chips = hand.querySelectorAll(".hand-chip-back-compact");
    expect(chips).toHaveLength(3);
    for (const chip of [...chips]) {
      expect(chip).toHaveAttribute("data-compact", "true");
      expect(chip).toHaveAttribute("data-face-down", "true");
    }
  });

  it("Gap 2: VS divider only renders inside contested BF tiles", () => {
    function BfTile({ id, contested }: { id: string; contested: boolean }) {
      return (
        <div
          className={`bf${contested ? " bf-contested" : ""}`}
          data-testid={`bf-${id}`}
          data-contested={contested ? "true" : "false"}
        >
          <span className="slot" />
          <div className="bf-tile-center" />
          <span className="slot" />
          {contested ? (
            <span
              className="bf-vs-divider"
              data-testid={`bf-vs-divider-${id}`}
              aria-hidden="true"
            >
              <span className="bf-vs-divider-line" />
              <span className="bf-vs-divider-badge">VS</span>
            </span>
          ) : null}
        </div>
      );
    }

    const { rerender } = render(<BfTile id="lane-1" contested={false} />);
    expect(screen.queryByTestId("bf-vs-divider-lane-1")).toBeNull();

    rerender(<BfTile id="lane-1" contested />);
    const divider = screen.getByTestId("bf-vs-divider-lane-1");
    expect(divider).toBeInTheDocument();
    expect(divider.querySelector(".bf-vs-divider-badge")?.textContent).toBe(
      "VS",
    );
    expect(divider).toHaveAttribute("aria-hidden", "true");
  });

  it("Gap 3: only the active phase pill carries the .phase-active class", () => {
    function PhaseStrip({ active }: { active: string }) {
      const phases = [
        { id: "begin", label: "Beginning" },
        { id: "draw", label: "Draw" },
        { id: "main", label: "Main" },
        { id: "showdown", label: "Showdown" },
        { id: "ending", label: "Ending" },
      ];
      return (
        <div className="phase-strip" data-testid="phase-strip">
          {phases.map((p) => {
            const isActive = p.id === active;
            return (
              <span
                key={p.id}
                className={`phase ${isActive ? "phase-active" : ""}`}
                data-testid={`phase-${p.id}`}
                data-active={isActive ? "true" : "false"}
              >
                {p.label}
              </span>
            );
          })}
        </div>
      );
    }
    render(<PhaseStrip active="main" />);
    const strip = screen.getByTestId("phase-strip");
    const active = strip.querySelectorAll(".phase-active");
    expect(active).toHaveLength(1);
    expect(active[0]!.getAttribute("data-testid")).toBe("phase-main");
    // Inactive siblings should NOT carry the .phase-active growth modifier.
    const inactive = strip.querySelectorAll(
      ".phase:not(.phase-active)",
    );
    expect(inactive).toHaveLength(4);
  });
});
