/**
 * Slice 5 (UX affordances) — UI tests.
 *
 * Covers:
 *   1. Smart showdown assist block in CombatPanel — verifies the
 *      predicted-outcome dl renders with correct totals + lethal hint.
 *   2. Might-counter badge on BattlefieldList — verifies the +N pill
 *      surfaces when effective might differs from base.
 *   3. data-card-id / data-zone-id hooks present on the elements that
 *      the PlayPage delegated ping handler walks up looking for.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CombatPanel } from "../components/CombatPanel";
import { BattlefieldList } from "../components/BattlefieldList";
import type { BattlefieldUnit, CombatView, GameViewBattlefield } from "../lib/api";

describe("Slice 5 — smart showdown assist", () => {
  it("renders predicted outcome with attacker/defender totals and lethal hint", () => {
    const combat: CombatView = {
      attackers: [
        { controller: "player-1", definitionId: "scout", id: "atk-1", might: 2, name: "Scout" },
        { controller: "player-1", definitionId: "raider", id: "atk-2", might: 1, name: "Raider" },
      ],
      attackingPlayer: "player-1",
      battlefieldId: "bf-1",
      defenders: [
        { controller: "player-2", definitionId: "warden", id: "def-1", might: 4, name: "Warden" },
      ],
      defendingPlayer: "player-2",
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(<CombatPanel combat={combat} localPlayerId="player-1" />);

    expect(screen.getByTestId("combat-panel-assist")).toBeInTheDocument();
    expect(screen.getByTestId("combat-assist-attacker-total").textContent)
      .toContain("3");
    expect(screen.getByTestId("combat-assist-defender-total").textContent)
      .toContain("4");
    // 4 >= 3 → attackers wipe.
    expect(screen.getByTestId("combat-assist-lethal").textContent)
      .toContain("Attackers wipe");
  });

  it("reports mutual destruction when totals match", () => {
    const combat: CombatView = {
      attackers: [
        { controller: "player-1", definitionId: "scout", id: "atk-1", might: 3, name: "Scout" },
      ],
      attackingPlayer: "player-1",
      battlefieldId: "bf-1",
      defenders: [
        { controller: "player-2", definitionId: "warden", id: "def-1", might: 3, name: "Warden" },
      ],
      defendingPlayer: "player-2",
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(<CombatPanel combat={combat} localPlayerId="player-1" />);
    expect(screen.getByTestId("combat-assist-lethal").textContent)
      .toContain("Mutual destruction");
  });

  it("surfaces player damage when attackers are uncontested", () => {
    const combat: CombatView = {
      attackers: [
        { controller: "player-1", definitionId: "scout", id: "atk-1", might: 5, name: "Scout" },
      ],
      attackingPlayer: "player-1",
      battlefieldId: "bf-1",
      defenders: [],
      defendingPlayer: "player-2",
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(<CombatPanel combat={combat} localPlayerId="player-1" />);
    expect(screen.getByTestId("combat-assist-player-damage")).toBeInTheDocument();
    expect(screen.getByTestId("combat-assist-player-damage").textContent)
      .toContain("+5");
  });

  it("does not render the assist block when both sides are empty", () => {
    const combat: CombatView = {
      attackers: [],
      attackingPlayer: "player-1",
      battlefieldId: "bf-1",
      defenders: [],
      defendingPlayer: "player-2",
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(<CombatPanel combat={combat} localPlayerId="player-1" />);
    expect(screen.queryByTestId("combat-panel-assist")).not.toBeInTheDocument();
  });
});

describe("Slice 5 — might counter badge", () => {
  function mkBf(units: BattlefieldUnit[]): GameViewBattlefield {
    return {
      contested: false,
      controller: null,
      id: "bf-1",
      name: "Test BF",
      units,
    };
  }

  it("renders a +N pill when effective might > base might", () => {
    const units: BattlefieldUnit[] = [
      {
        baseMight: 2,
        controller: "player-1",
        definitionId: "scout",
        id: "u-buffed",
        might: 4,
        name: "Buffed Scout",
      },
    ];
    render(
      <BattlefieldList
        battlefields={[mkBf(units)]}
        localPlayerId="player-1"
      />,
    );
    const badge = screen.getByTestId("bf-might-counter-u-buffed");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("+2");
    expect(badge.className).toContain("bf-might-counter-pos");
  });

  it("renders a -N pill when effective might < base might", () => {
    const units: BattlefieldUnit[] = [
      {
        baseMight: 5,
        controller: "player-1",
        definitionId: "scout",
        id: "u-debuffed",
        might: 2,
        name: "Hexed Scout",
      },
    ];
    render(
      <BattlefieldList
        battlefields={[mkBf(units)]}
        localPlayerId="player-1"
      />,
    );
    const badge = screen.getByTestId("bf-might-counter-u-debuffed");
    expect(badge.textContent).toBe("-3");
    expect(badge.className).toContain("bf-might-counter-neg");
  });

  it("does not render a badge when effective equals base", () => {
    const units: BattlefieldUnit[] = [
      {
        baseMight: 3,
        controller: "player-1",
        definitionId: "scout",
        id: "u-clean",
        might: 3,
        name: "Plain Scout",
      },
    ];
    render(
      <BattlefieldList
        battlefields={[mkBf(units)]}
        localPlayerId="player-1"
      />,
    );
    expect(screen.queryByTestId("bf-might-counter-u-clean")).not.toBeInTheDocument();
  });

  it("does not render a badge when baseMight is missing (synthetic deck)", () => {
    const units: BattlefieldUnit[] = [
      {
        controller: "player-1",
        definitionId: "scout",
        id: "u-no-base",
        might: 3,
        name: "Synthetic Scout",
      },
    ];
    render(
      <BattlefieldList
        battlefields={[mkBf(units)]}
        localPlayerId="player-1"
      />,
    );
    expect(screen.queryByTestId("bf-might-counter-u-no-base")).not.toBeInTheDocument();
  });
});

describe("Slice 5 — ping target hooks", () => {
  it("BF unit chips carry data-card-id for delegated ping lookup", () => {
    const units: BattlefieldUnit[] = [
      {
        controller: "player-1",
        definitionId: "scout",
        id: "u-pingable",
        might: 2,
        name: "Pingable Scout",
      },
    ];
    render(
      <BattlefieldList
        battlefields={[
          {
            contested: false,
            controller: null,
            id: "bf-1",
            name: "Test BF",
            units,
          },
        ]}
        localPlayerId="player-1"
      />,
    );
    const chip = screen.getByTestId("bf-unit-u-pingable");
    expect(chip.getAttribute("data-card-id")).toBe("u-pingable");
  });

  it("BF tile carries data-zone-id matching its battlefield id", () => {
    render(
      <BattlefieldList
        battlefields={[
          {
            contested: false,
            controller: null,
            id: "bf-7",
            name: "Test BF",
            units: [],
          },
        ]}
        localPlayerId="player-1"
      />,
    );
    const tile = screen.getByTestId("bf-bf-7");
    expect(tile.getAttribute("data-zone-id")).toBe("battlefield-bf-7");
  });

  it("combat-panel unit row carries data-card-id", () => {
    const combat: CombatView = {
      attackers: [
        {
          controller: "player-1",
          definitionId: "scout",
          id: "atk-pingable",
          might: 2,
          name: "Scout",
        },
      ],
      attackingPlayer: "player-1",
      battlefieldId: "bf-1",
      defenders: [],
      defendingPlayer: "player-2",
      focusOwner: "player-1",
      isCombat: true,
      phase: "main",
    };
    render(<CombatPanel combat={combat} localPlayerId="player-1" />);
    const unit = screen.getByTestId("combat-unit-atk-pingable");
    expect(unit.getAttribute("data-card-id")).toBe("atk-pingable");
  });
});
