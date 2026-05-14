/**
 * Iter-12 RiftAtlas-parity polish tests.
 *
 * Covers four gaps:
 *   - Goal 1: showdown timeline breadcrumb (Declare Attackers → Declare
 *     Defenders → Strikes → Resolution) rendered just below the
 *     TurnBanner whenever view.combat is set. Current phase is bold +
 *     accent; earlier steps render a checkmark; future steps are muted.
 *   - Goal 2: role-change flash — units that newly gain an attacker or
 *     defender badge get a transient `.bf-unit-role-flash` class for
 *     ~800ms (gold flash + scale animation). Tracked via diff against
 *     prev attacker/defender id sets held in a `useRef`.
 *   - Goal 4 (optional): phase strip carries a `data-phase-tip` attribute
 *     with a richer description for hover-tooltip CSS.
 */

import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ShowdownBreadcrumb } from "../components/ShowdownBreadcrumb";
import { BattlefieldList } from "../components/BattlefieldList";
import type { BattlefieldUnit, GameViewBattlefield } from "../lib/api";

function makeUnit(
  override: Partial<BattlefieldUnit> & { id: string },
): BattlefieldUnit {
  return {
    controller: "player-1",
    definitionId: "card-x",
    ...override,
  };
}

function makeBf(
  override: Partial<GameViewBattlefield>,
): GameViewBattlefield {
  return {
    contested: false,
    controller: null,
    id: "bf-1",
    name: "Lane 1",
    units: [],
    ...override,
  };
}

describe("iter-12 Goal 1 — ShowdownBreadcrumb", () => {
  it("renders all four canonical steps", () => {
    render(<ShowdownBreadcrumb currentPhase="declare-attackers" />);
    expect(screen.getByTestId("sb-step-declare-attackers")).toBeInTheDocument();
    expect(screen.getByTestId("sb-step-declare-defenders")).toBeInTheDocument();
    expect(screen.getByTestId("sb-step-strikes")).toBeInTheDocument();
    expect(screen.getByTestId("sb-step-resolution")).toBeInTheDocument();
  });

  it("marks the current phase active, earlier as done, later as future", () => {
    render(<ShowdownBreadcrumb currentPhase="strikes" />);
    expect(
      screen.getByTestId("sb-step-declare-attackers").getAttribute("data-state"),
    ).toBe("done");
    expect(
      screen.getByTestId("sb-step-declare-defenders").getAttribute("data-state"),
    ).toBe("done");
    expect(
      screen.getByTestId("sb-step-strikes").getAttribute("data-state"),
    ).toBe("active");
    expect(
      screen.getByTestId("sb-step-resolution").getAttribute("data-state"),
    ).toBe("future");
  });

  it("falls back to all-future when phase id is unknown", () => {
    render(<ShowdownBreadcrumb currentPhase="totally-made-up-phase" />);
    expect(
      screen.getByTestId("sb-step-declare-attackers").getAttribute("data-state"),
    ).toBe("future");
    expect(
      screen.getByTestId("sb-step-resolution").getAttribute("data-state"),
    ).toBe("future");
  });

  it("aliases work — 'attackers' alone resolves to declare-attackers", () => {
    render(<ShowdownBreadcrumb currentPhase="attackers" />);
    expect(
      screen.getByTestId("sb-step-declare-attackers").getAttribute("data-state"),
    ).toBe("active");
  });

  it("shows a checkmark marker for done steps", () => {
    render(<ShowdownBreadcrumb currentPhase="resolution" />);
    const done = screen.getByTestId("sb-step-declare-attackers");
    expect(done.textContent).toContain("✓");
  });
});

describe("iter-12 Goal 2 — role-change flash", () => {
  it("flashes a unit that newly enters attackerIds", () => {
    vi.useFakeTimers();
    try {
      const bf = makeBf({
        id: "bf-1",
        units: [
          makeUnit({ controller: "player-1", id: "u1", name: "Alpha" }),
          makeUnit({ controller: "player-2", id: "u2", name: "Beta" }),
        ],
      });

      const { rerender } = render(
        <BattlefieldList
          battlefields={[bf]}
          localPlayerId="player-1"
          activeBattlefieldId="bf-1"
          combatPhase="declare-attackers"
          attackerIds={[]}
        />,
      );

      // First render: nothing flashing.
      expect(
        screen.getByTestId("bf-unit-u1").getAttribute("data-role-flash"),
      ).toBe("false");

      // Now u1 enters attackerIds → should flash.
      rerender(
        <BattlefieldList
          battlefields={[bf]}
          localPlayerId="player-1"
          activeBattlefieldId="bf-1"
          combatPhase="declare-attackers"
          attackerIds={["u1"]}
        />,
      );

      // The effect schedules a setState; run timers/microtasks.
      act(() => {
        // Microtask flush for the effect's setState.
      });
      expect(
        screen.getByTestId("bf-unit-u1").getAttribute("data-role-flash"),
      ).toBe("true");
      expect(
        screen.getByTestId("bf-unit-u1").className,
      ).toContain("bf-unit-role-flash");

      // After 800ms, flash clears.
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(
        screen.getByTestId("bf-unit-u1").getAttribute("data-role-flash"),
      ).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not flash units that were already in attackerIds", () => {
    vi.useFakeTimers();
    try {
      const bf = makeBf({
        id: "bf-1",
        units: [makeUnit({ controller: "player-1", id: "u1" })],
      });

      const { rerender } = render(
        <BattlefieldList
          battlefields={[bf]}
          localPlayerId="player-1"
          activeBattlefieldId="bf-1"
          combatPhase="declare-attackers"
          attackerIds={["u1"]}
        />,
      );

      // Initial mount inserts u1 into attackerIds — that IS a transition
      // (prev = empty set), so a flash IS expected. Let it run + clear.
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(
        screen.getByTestId("bf-unit-u1").getAttribute("data-role-flash"),
      ).toBe("false");

      // Re-render with the same attackerIds — should NOT re-flash.
      rerender(
        <BattlefieldList
          battlefields={[bf]}
          localPlayerId="player-1"
          activeBattlefieldId="bf-1"
          combatPhase="strikes"
          attackerIds={["u1"]}
        />,
      );
      expect(
        screen.getByTestId("bf-unit-u1").getAttribute("data-role-flash"),
      ).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flashes a unit that newly enters defenderIds", () => {
    vi.useFakeTimers();
    try {
      const bf = makeBf({
        id: "bf-1",
        units: [makeUnit({ controller: "player-2", id: "u1" })],
      });

      const { rerender } = render(
        <BattlefieldList
          battlefields={[bf]}
          localPlayerId="player-1"
          activeBattlefieldId="bf-1"
          combatPhase="declare-defenders"
          defenderIds={[]}
        />,
      );
      expect(
        screen.getByTestId("bf-unit-u1").getAttribute("data-role-flash"),
      ).toBe("false");

      rerender(
        <BattlefieldList
          battlefields={[bf]}
          localPlayerId="player-1"
          activeBattlefieldId="bf-1"
          combatPhase="declare-defenders"
          defenderIds={["u1"]}
        />,
      );
      expect(
        screen.getByTestId("bf-unit-u1").getAttribute("data-role-flash"),
      ).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });
});
