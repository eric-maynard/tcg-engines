/**
 * CombatPanel — Phase B batch 25 EEE.
 *
 * Pins the rendered output for the populated case so regressions in the
 * attacker/defender partition or focus rendering are caught early.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CombatPanel } from "../components/CombatPanel";
import type { ActionsLegal, BattlefieldUnit, CombatView } from "../lib/api";

const ALL_LEGAL: ActionsLegal = {
  assignAttacker: true,
  assignDefender: true,
  contestBattlefield: true,
  endTurn: true,
  passChainPriority: true,
  passShowdownFocus: true,
  resolveCombat: true,
  startShowdown: true,
  stepBot: false,
};

describe("CombatPanel", () => {
  it("renders attackers + defenders with names, plus focus + battlefield", () => {
    const combat: CombatView = {
      attackers: [
        {
          controller: "player-1",
          definitionId: "swift-scout",
          id: "atk-1",
          might: 2,
          name: "Swift Scout",
        },
      ],
      attackingPlayer: "player-1",
      battlefieldId: "bf-1",
      defenders: [
        {
          controller: "player-2",
          definitionId: "warden",
          id: "def-1",
          might: 4,
          name: "Warden of the Gate",
        },
      ],
      defendingPlayer: "player-2",
      focusOwner: "player-2",
      isCombat: true,
      phase: "main",
    };

    render(<CombatPanel combat={combat} />);

    expect(screen.getByTestId("combat-panel")).toBeInTheDocument();
    expect(screen.getByText("Swift Scout")).toBeInTheDocument();
    expect(screen.getByText("Warden of the Gate")).toBeInTheDocument();
    expect(screen.getByTestId("combat-unit-atk-1")).toBeInTheDocument();
    expect(screen.getByTestId("combat-unit-def-1")).toBeInTheDocument();
    expect(screen.getByTestId("combat-focus").textContent).toContain(
      "player-2",
    );
    expect(screen.getByTestId("combat-attacker-player").textContent).toContain(
      "player-1",
    );
    expect(screen.getByTestId("combat-defender-player").textContent).toContain(
      "player-2",
    );
    // Battlefield id surfaced as a data attribute (test hook for downstream).
    expect(
      screen.getByTestId("combat-panel").getAttribute("data-battlefield-id"),
    ).toBe("bf-1");
  });

  it("renders nothing when combat is undefined", () => {
    const { container } = render(<CombatPanel combat={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("fires onAssignAttacker with unit id when the attacker button is clicked", () => {
    const combat: CombatView = {
      attackers: [],
      battlefieldId: "bf-1",
      defenders: [],
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    const assignable: BattlefieldUnit[] = [
      { controller: "player-1", definitionId: "scout", id: "u-1", name: "Scout" },
      { controller: "player-1", definitionId: "ranger", id: "u-2", name: "Ranger" },
    ];
    const onAssignAttacker = vi.fn();
    render(
      <CombatPanel
        combat={combat}
        localPlayerId="player-1"
        assignableUnits={assignable}
        actionsLegal={ALL_LEGAL}
        onAssignAttacker={onAssignAttacker}
      />,
    );
    fireEvent.click(screen.getByTestId("assign-attacker-u-1"));
    expect(onAssignAttacker).toHaveBeenCalledWith("u-1");
    fireEvent.click(screen.getByTestId("assign-attacker-u-2"));
    expect(onAssignAttacker).toHaveBeenCalledWith("u-2");
  });

  it("Pass Focus button is disabled when local seat does not have focus", () => {
    const combat: CombatView = {
      attackers: [],
      battlefieldId: "bf-1",
      defenders: [],
      focusOwner: "player-2", // Opponent has focus
      isCombat: true,
      phase: "main",
    };
    const onPassFocus = vi.fn();
    render(
      <CombatPanel
        combat={combat}
        localPlayerId="player-1"
        actionsLegal={ALL_LEGAL}
        onPassFocus={onPassFocus}
      />,
    );
    const btn = screen.getByTestId("combat-pass-focus");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPassFocus).not.toHaveBeenCalled();
  });

  it("Resolve Combat fires onResolveCombat with the showdown battlefield id", () => {
    const combat: CombatView = {
      attackers: [],
      battlefieldId: "bf-7",
      defenders: [],
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    const onResolveCombat = vi.fn();
    render(
      <CombatPanel
        combat={combat}
        localPlayerId="player-1"
        actionsLegal={ALL_LEGAL}
        onResolveCombat={onResolveCombat}
      />,
    );
    fireEvent.click(screen.getByTestId("combat-resolve"));
    expect(onResolveCombat).toHaveBeenCalledWith("bf-7");
  });

  // Defect-3 fix: priority/focus popup banner.
  it("priority prompt shows 'You have priority' when local seat has focus", () => {
    const combat: CombatView = {
      attackers: [],
      battlefieldId: "bf-1",
      defenders: [],
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(
      <CombatPanel
        combat={combat}
        localPlayerId="player-1"
        actionsLegal={ALL_LEGAL}
        onPassFocus={() => {}}
      />,
    );
    const prompt = screen.getByTestId("priority-prompt");
    expect(prompt).toBeInTheDocument();
    expect(prompt.getAttribute("data-focus")).toBe("ours");
    expect(screen.getByTestId("priority-prompt-title").textContent).toContain(
      "You have priority",
    );
    // Pass Priority button is enabled and live.
    expect(screen.getByTestId("priority-prompt-pass")).not.toBeDisabled();
  });

  it("priority prompt shows 'Waiting for opponent' when opponent has focus", () => {
    const combat: CombatView = {
      attackers: [],
      battlefieldId: "bf-1",
      defenders: [],
      focusOwner: "player-2",
      isCombat: true,
      phase: "main",
    };
    render(
      <CombatPanel
        combat={combat}
        localPlayerId="player-1"
        actionsLegal={ALL_LEGAL}
        onPassFocus={() => {}}
      />,
    );
    const prompt = screen.getByTestId("priority-prompt");
    expect(prompt.getAttribute("data-focus")).toBe("theirs");
    expect(screen.getByTestId("priority-prompt-title").textContent).toContain(
      "Waiting for opponent",
    );
    // No Pass Priority button when opponent holds focus.
    expect(screen.queryByTestId("priority-prompt-pass")).toBeNull();
  });

  it("priority prompt is omitted when no localPlayerId is provided", () => {
    const combat: CombatView = {
      attackers: [],
      battlefieldId: "bf-1",
      defenders: [],
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(<CombatPanel combat={combat} />);
    expect(screen.queryByTestId("priority-prompt")).toBeNull();
  });

  it("priority prompt Pass button fires onPassFocus when local seat has focus", () => {
    const combat: CombatView = {
      attackers: [],
      battlefieldId: "bf-1",
      defenders: [],
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    const onPassFocus = vi.fn();
    render(
      <CombatPanel
        combat={combat}
        localPlayerId="player-1"
        actionsLegal={ALL_LEGAL}
        onPassFocus={onPassFocus}
      />,
    );
    fireEvent.click(screen.getByTestId("priority-prompt-pass"));
    expect(onPassFocus).toHaveBeenCalledTimes(1);
  });

  it("renders empty placeholders when one side has no units", () => {
    const combat: CombatView = {
      attackers: [
        {
          controller: "player-1",
          definitionId: "scout",
          id: "atk-only",
          name: "Scout",
        },
      ],
      battlefieldId: "bf-x",
      defenders: [],
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(<CombatPanel combat={combat} />);
    expect(screen.getByTestId("combat-defenders-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("combat-attackers-empty")).toBeNull();
  });
});
