/**
 * DefectFixes tests — three real UX gaps the static-frame QA reviewer missed:
 *   - Defect 1: exhausted units must rotate 90° (TCG convention).
 *   - Defect 2: layout reflows when cards move (fixed-size containers).
 *   - Defect 3: no focus/priority popups during showdowns.
 *
 * Only the parts that can be unit-tested in jsdom are covered here.
 * Visual rotation (defect 1) and layout reflow (defect 2) are also
 * verified via the headless full-game video harness; this file pins the
 * data → DOM contract so future regressions get caught at CI time.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BattlefieldList } from "../components/BattlefieldList";
import { BaseZone } from "../components/BaseZone";
import { CombatPanel } from "../components/CombatPanel";
import type {
  BattlefieldUnit,
  CombatView,
  GameViewBattlefield,
} from "../lib/api";

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
  override: Partial<GameViewBattlefield> & { id: string },
): GameViewBattlefield {
  return {
    contested: false,
    controller: null,
    name: "Lane",
    units: [],
    ...override,
  };
}

describe("defect-1 — exhausted units render rotated", () => {
  it("adds .bf-mini-chip-exhausted class + data-exhausted='true' to exhausted BF units", () => {
    const exhausted = makeUnit({
      controller: "player-1",
      exhausted: true,
      id: "u-tap",
      name: "Tapped Unit",
    });
    const ready = makeUnit({
      controller: "player-1",
      id: "u-ready",
      name: "Ready Unit",
    });
    const bf = makeBf({ id: "bf-1", units: [exhausted, ready] });
    render(
      <BattlefieldList battlefields={[bf]} localPlayerId="player-1" />,
    );

    const tapped = screen.getByTestId("bf-unit-u-tap");
    expect(tapped.className).toMatch(/\bbf-mini-chip-exhausted\b/);
    expect(tapped.getAttribute("data-exhausted")).toBe("true");

    const readyEl = screen.getByTestId("bf-unit-u-ready");
    expect(readyEl.className).not.toMatch(/\bbf-mini-chip-exhausted\b/);
    expect(readyEl.getAttribute("data-exhausted")).toBe("false");
  });

  it("adds .base-zone-unit-exhausted class + data-exhausted='true' on base-zone units", () => {
    const exhausted = makeUnit({
      controller: "player-1",
      exhausted: true,
      id: "b-tap",
      name: "Tapped in Base",
    });
    const ready = makeUnit({
      controller: "player-1",
      id: "b-ready",
      name: "Ready in Base",
    });
    render(
      <BaseZone playerId="player-1" units={[exhausted, ready]} />,
    );

    const tapped = screen.getByTestId("base-zone-unit-b-tap");
    expect(tapped.className).toMatch(/\bbase-zone-unit-exhausted\b/);
    expect(tapped.getAttribute("data-exhausted")).toBe("true");

    const readyEl = screen.getByTestId("base-zone-unit-b-ready");
    expect(readyEl.className).not.toMatch(/\bbase-zone-unit-exhausted\b/);
    expect(readyEl.getAttribute("data-exhausted")).toBe("false");
  });
});

describe("defect-3 — focus/priority popup during showdowns", () => {
  const combatLocalFocus: CombatView = {
    attackers: [],
    battlefieldId: "bf-1",
    defenders: [],
    focusOwner: "player-1",
    isCombat: true,
    phase: "main",
  };
  const combatOpponentFocus: CombatView = {
    attackers: [],
    battlefieldId: "bf-1",
    defenders: [],
    focusOwner: "player-2",
    isCombat: true,
    phase: "main",
  };

  it("renders 'You have priority' banner when local seat has focus", () => {
    render(
      <CombatPanel
        combat={combatLocalFocus}
        localPlayerId="player-1"
        onPassFocus={() => {}}
      />,
    );
    const prompt = screen.getByTestId("priority-prompt");
    expect(prompt.getAttribute("data-focus")).toBe("ours");
    expect(screen.getByTestId("priority-prompt-title").textContent).toMatch(
      /You have priority/i,
    );
  });

  it("renders 'Waiting for opponent' banner when opponent has focus", () => {
    render(
      <CombatPanel
        combat={combatOpponentFocus}
        localPlayerId="player-1"
        onPassFocus={() => {}}
      />,
    );
    const prompt = screen.getByTestId("priority-prompt");
    expect(prompt.getAttribute("data-focus")).toBe("theirs");
    expect(screen.getByTestId("priority-prompt-title").textContent).toMatch(
      /Waiting for opponent/i,
    );
    // No "Pass Priority" button when we don't have focus.
    expect(screen.queryByTestId("priority-prompt-pass")).toBeNull();
  });

  it("omits the prompt entirely when no localPlayerId is provided (spectator)", () => {
    render(<CombatPanel combat={combatLocalFocus} />);
    expect(screen.queryByTestId("priority-prompt")).toBeNull();
  });
});
