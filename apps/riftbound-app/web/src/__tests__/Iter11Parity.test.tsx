/**
 * Iter-11 RiftAtlas-parity polish tests.
 *
 * Covers four gaps:
 *   - Gap 1: active-showdown beam + SHOWDOWN phase badge anchored to the
 *     contested BF tile.
 *   - Gap 2: combat-role badges (⚔ attacker / 🛡 defender) rendered on
 *     units present in `combat.attackers` / `combat.defenders` lists.
 *   - Gap 3: hand-chip "selected" state — the chip that opened a picker
 *     stays gold-bordered + lifted until the picker closes.
 *   - Gap 4: faded GAME OVER overlay when view.winner is set, non-
 *     blocking (board stays interactive for review).
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BattlefieldList } from "../components/BattlefieldList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayPage } from "../PlayPage";
import type {
  BattlefieldUnit,
  GameViewBattlefield,
  GameViewPlayer,
  HandCard,
  StateResponse,
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

const samplePlayer: GameViewPlayer = {
  deckSize: 30,
  energy: 9,
  handSize: 1,
  id: "player-1",
  power: { Body: 4, Mind: 4 },
  runeDeckSize: 12,
  trashSize: 0,
  victoryPoints: 0,
  xp: 0,
};

describe("iter-11 gap 1 — active-showdown beam + SHOWDOWN badge", () => {
  it("renders a beam + SHOWDOWN <phase> badge on the active BF tile only", () => {
    const bfs: readonly GameViewBattlefield[] = [
      makeBf({ id: "bf-1" }),
      makeBf({ contested: true, id: "bf-2" }),
    ];
    render(
      <BattlefieldList
        battlefields={bfs}
        localPlayerId="player-1"
        activeBattlefieldId="bf-2"
        combatPhase="declare-attackers"
      />,
    );

    expect(screen.getByTestId("bf-showdown-beam-bf-2")).toBeInTheDocument();
    expect(screen.queryByTestId("bf-showdown-beam-bf-1")).toBeNull();

    const badge = screen.getByTestId("bf-showdown-badge-bf-2");
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute("data-combat-phase")).toBe("declare-attackers");
    expect(badge.textContent).toMatch(/SHOWDOWN/);
    expect(badge.textContent).toMatch(/declare-attackers/);
  });

  it("renders no beam or badge when no battlefield is in active combat", () => {
    render(
      <BattlefieldList
        battlefields={[makeBf({ id: "bf-1" })]}
        localPlayerId="player-1"
      />,
    );
    expect(screen.queryByTestId("bf-showdown-beam-bf-1")).toBeNull();
    expect(screen.queryByTestId("bf-showdown-badge-bf-1")).toBeNull();
  });

  it("omits the SHOWDOWN badge when combatPhase is null even if active", () => {
    render(
      <BattlefieldList
        battlefields={[makeBf({ id: "bf-1" })]}
        localPlayerId="player-1"
        activeBattlefieldId="bf-1"
      />,
    );
    // Beam still renders (highlights the lane), badge does not
    expect(screen.getByTestId("bf-showdown-beam-bf-1")).toBeInTheDocument();
    expect(screen.queryByTestId("bf-showdown-badge-bf-1")).toBeNull();
  });
});

describe("iter-11 gap 2 — combat-role badges on units", () => {
  it("stamps attacker/defender role badges on the right units only", () => {
    const bf = makeBf({
      id: "bf-1",
      units: [
        makeUnit({ controller: "player-1", id: "u1", name: "Alpha" }),
        makeUnit({ controller: "player-2", id: "u2", name: "Beta" }),
        makeUnit({ controller: "player-1", id: "u3", name: "Gamma" }),
      ],
    });

    render(
      <BattlefieldList
        battlefields={[bf]}
        localPlayerId="player-1"
        activeBattlefieldId="bf-1"
        combatPhase="strikes"
        attackerIds={["u1"]}
        defenderIds={["u2"]}
      />,
    );

    const attBadge = screen.getByTestId("bf-unit-role-u1");
    expect(attBadge.getAttribute("data-role")).toBe("attacker");
    const defBadge = screen.getByTestId("bf-unit-role-u2");
    expect(defBadge.getAttribute("data-role")).toBe("defender");

    // U3 is uninvolved — no badge.
    expect(screen.queryByTestId("bf-unit-role-u3")).toBeNull();

    // Data-combat-role attr present on every unit chip.
    expect(screen.getByTestId("bf-unit-u1").getAttribute("data-combat-role"))
      .toBe("attacker");
    expect(screen.getByTestId("bf-unit-u2").getAttribute("data-combat-role"))
      .toBe("defender");
    expect(screen.getByTestId("bf-unit-u3").getAttribute("data-combat-role"))
      .toBe("none");
  });

  it("does NOT stamp role badges on units of an inactive BF tile", () => {
    const bf1 = makeBf({
      id: "bf-1",
      units: [makeUnit({ controller: "player-1", id: "u1" })],
    });
    const bf2 = makeBf({
      id: "bf-2",
      units: [makeUnit({ controller: "player-1", id: "u2" })],
    });
    render(
      <BattlefieldList
        battlefields={[bf1, bf2]}
        localPlayerId="player-1"
        activeBattlefieldId="bf-2"
        combatPhase="strikes"
        attackerIds={["u1", "u2"]}
      />,
    );
    // U1 lives on a non-active tile — no badge.
    expect(screen.queryByTestId("bf-unit-role-u1")).toBeNull();
    // U2 is on the active tile — badge present.
    expect(screen.getByTestId("bf-unit-role-u2")).toBeInTheDocument();
  });
});

describe("iter-11 gap 3 — hand-chip selected outline", () => {
  it("adds .hand-chip-selected when selectedCardId matches", () => {
    const card: HandCard = {
      definitionId: "def-1",
      id: "h1",
      name: "Strike",
    } as HandCard;
    render(
      <PlayerPanel
        player={samplePlayer}
        isActive
        victoryScore={8}
        hand={[card]}
        onPlayCard={() => {}}
        canPlay
        selectedCardId="h1"
      />,
    );
    const chip = screen.getByTestId("hand-chip-h1");
    expect(chip.className).toContain("hand-chip-selected");
    expect(chip.getAttribute("data-selected")).toBe("true");
    // Disabled so it can't be re-clicked while picker is open
    expect(chip).toBeDisabled();
  });

  it("does NOT mark other chips as selected", () => {
    const cards: readonly HandCard[] = [
      { definitionId: "def-1", id: "h1", name: "A" } as HandCard,
      { definitionId: "def-2", id: "h2", name: "B" } as HandCard,
    ];
    render(
      <PlayerPanel
        player={samplePlayer}
        isActive
        victoryScore={8}
        hand={cards}
        onPlayCard={() => {}}
        canPlay
        selectedCardId="h1"
      />,
    );
    expect(screen.getByTestId("hand-chip-h2").getAttribute("data-selected"))
      .toBe("false");
    expect(screen.getByTestId("hand-chip-h2").className).not.toContain(
      "hand-chip-selected",
    );
  });
});

describe("iter-11 gap 3 — selection clears when picker closes (PlayPage)", () => {
  function makeStateWithChoiceCard(): StateResponse {
    const handCard: HandCard = {
      definitionId: "def-1",
      id: "c1",
      legalLocations: ["base", "bf-1"],
      name: "Choice Unit",
    } as HandCard;
    return {
      actionsLegal: {
        endTurn: true,
        stepBot: true,
        assignAttacker: false,
        assignDefender: false,
        contestBattlefield: false,
        passChainPriority: false,
        passShowdownFocus: false,
        resolveCombat: false,
        startShowdown: false,
      },
      hand: { "player-1": [handCard], "player-2": [] },
      isGameOver: false,
      trail: [],
      view: {
        gameId: "g1",
        status: "playing",
        winner: null,
        victoryScore: 8,
        turn: {
          number: 1,
          activePlayer: "player-1",
          phase: "main",
          phaseLabel: "Main",
        },
        phaseStrip: [{ id: "main", label: "Main" }],
        players: [
          {
            id: "player-1",
            victoryPoints: 0,
            xp: 0,
            handSize: 1,
            deckSize: 30,
            runeDeckSize: 12,
            trashSize: 0,
            energy: 9,
            power: { Body: 4 },
          },
          {
            id: "player-2",
            victoryPoints: 0,
            xp: 0,
            handSize: 0,
            deckSize: 30,
            runeDeckSize: 12,
            trashSize: 0,
            energy: 9,
            power: {},
          },
        ],
        battlefields: [
          {
            id: "bf-1",
            name: "Lane",
            controller: null,
            contested: false,
            units: [],
          },
        ],
      },
    };
  }

  it("highlights chip after click, clears after cancel", async () => {
    const state = makeStateWithChoiceCard();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => state,
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="s1" />);

    const chip = await screen.findByTestId("hand-chip-c1");
    expect(chip.getAttribute("data-selected")).toBe("false");

    fireEvent.click(chip);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-c1").getAttribute("data-selected"))
        .toBe("true");
    });
    expect(screen.getByTestId("battlefield-picker")).toBeInTheDocument();

    // Cancel the picker
    fireEvent.click(screen.getByTestId("picker-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("battlefield-picker")).toBeNull();
    });
    expect(screen.getByTestId("hand-chip-c1").getAttribute("data-selected"))
      .toBe("false");

    vi.unstubAllGlobals();
  });
});

describe("iter-11 gap 4 — game-over banner", () => {
  function makeFinishedState(): StateResponse {
    return {
      actionsLegal: {
        endTurn: false,
        stepBot: false,
      },
      hand: { "player-1": [], "player-2": [] },
      isGameOver: true,
      trail: [],
      view: {
        gameId: "g1",
        status: "finished",
        winner: "player-1",
        victoryScore: 8,
        turn: {
          number: 7,
          activePlayer: "player-1",
          phase: "ending",
          phaseLabel: "Ending",
        },
        phaseStrip: [{ id: "ending", label: "Ending" }],
        players: [
          {
            id: "player-1",
            victoryPoints: 8,
            xp: 0,
            handSize: 0,
            deckSize: 0,
            runeDeckSize: 0,
            trashSize: 0,
            energy: 0,
            power: {},
          },
          {
            id: "player-2",
            victoryPoints: 3,
            xp: 0,
            handSize: 0,
            deckSize: 0,
            runeDeckSize: 0,
            trashSize: 0,
            energy: 0,
            power: {},
          },
        ],
        battlefields: [],
      },
    };
  }

  it("renders the GAME OVER banner with the winner name", async () => {
    const state = makeFinishedState();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => state,
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="s1" />);

    const banner = await screen.findByTestId("game-over-banner");
    expect(banner).toBeInTheDocument();
    const winner = screen.getByTestId("game-over-winner");
    expect(winner.textContent).toBe("player-1 Wins");

    // Non-blocking: pointer-events:none keeps board interactive.
    const styles = banner.getAttribute("style") ?? "";
    // Class drives pointer-events; check class is wired so CSS applies.
    expect(banner.className).toContain("game-over-banner");
    expect(styles).toBe("");

    vi.unstubAllGlobals();
  });

  it("does NOT render the banner when winner is null", async () => {
    const state: StateResponse = {
      actionsLegal: { endTurn: true, stepBot: true },
      hand: { "player-1": [] },
      isGameOver: false,
      trail: [],
      view: {
        gameId: "g1",
        status: "playing",
        winner: null,
        victoryScore: 8,
        turn: {
          number: 1,
          activePlayer: "player-1",
          phase: "main",
          phaseLabel: "Main",
        },
        phaseStrip: [{ id: "main", label: "Main" }],
        players: [
          {
            id: "player-1",
            victoryPoints: 0,
            xp: 0,
            handSize: 0,
            deckSize: 1,
            runeDeckSize: 0,
            trashSize: 0,
            energy: 0,
            power: {},
          },
        ],
        battlefields: [],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => state,
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="s1" />);
    await screen.findByTestId("play-page");
    expect(screen.queryByTestId("game-over-banner")).toBeNull();

    vi.unstubAllGlobals();
  });
});

describe("iter-11 BattlefieldList — combat phase defaults", () => {
  // Ensure backward compatibility: existing call sites that don't pass
  // AttackerIds/defenderIds/combatPhase still render correctly.
  it("renders without attackerIds/defenderIds props", () => {
    const bf = makeBf({
      id: "bf-1",
      units: [makeUnit({ controller: "player-1", id: "u1" })],
    });
    render(
      <BattlefieldList
        battlefields={[bf]}
        localPlayerId="player-1"
        activeBattlefieldId="bf-1"
      />,
    );
    // Unit present, role = none
    expect(screen.getByTestId("bf-unit-u1").getAttribute("data-combat-role"))
      .toBe("none");
    expect(screen.queryByTestId("bf-unit-role-u1")).toBeNull();
  });
});
