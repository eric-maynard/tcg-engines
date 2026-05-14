import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import { TargetPicker } from "../components/TargetPicker";
import type { MoveResponse, StateResponse } from "../lib/api";

/**
 * Phase B batch 24 BBB tests.
 *
 * Verifies that clicking a SPELL hand-chip (cardType === "spell") opens the
 * TargetPicker rather than directly POSTing playFromHand — and that picking
 * a unit forwards the chosen `targets` array in the move body.
 *
 * Also includes a pure-component render test that exercises the friendly /
 * enemy ordering and the "Skip targets" affordance without bootstrapping
 * the full PlayPage.
 */

const battlefieldsWithUnits = [
  {
    contested: false,
    controller: "player-1",
    id: "player-1-bf-1",
    units: [
      {
        id: "u-friendly-1",
        definitionId: "scout",
        name: "Loyal Scout",
        controller: "player-1",
        might: 2,
      },
    ],
  },
  {
    contested: false,
    controller: "player-2",
    id: "player-2-bf-1",
    units: [
      {
        id: "u-enemy-1",
        definitionId: "raider",
        name: "Cruel Raider",
        controller: "player-2",
        might: 3,
      },
    ],
  },
] as const;

const fakeView = {
  battlefields: battlefieldsWithUnits,
  gameId: "g1",
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
      energy: 3,
      power: {},
    },
    {
      id: "player-2",
      victoryPoints: 0,
      xp: 0,
      handSize: 0,
      deckSize: 30,
      runeDeckSize: 12,
      trashSize: 0,
      energy: 0,
      power: {},
    },
  ],
  status: "playing",
  turn: {
    number: 1,
    activePlayer: "player-1",
    phase: "main",
    phaseLabel: "Main",
  },
  victoryScore: 8,
  winner: null,
} as const;

const spellHandState: StateResponse = {
  hand: {
    "player-1": [
      {
        id: "card-spell",
        definitionId: "spark-shot",
        name: "Spark Shot",
        cardType: "spell",
        // No legalLocations — spell-typed cards in real life don't enumerate
        // location-style legal moves.
        legalLocations: [],
        rulesText: "Deal 2 damage to target enemy unit.",
        abilities: ["[Spell] Deal 2 damage to target enemy unit"],
        // Phase B batch 25 DDD: enrichment used by the SPA to decide whether
        // to open the TargetPicker and which ids are legal to render.
        requiresTarget: true,
        legalTargets: [["u-enemy-1"]],
      },
    ],
    "player-2": [],
  },
  isGameOver: false,
  trail: [],
  view: fakeView,
};

const okMoveResponse: MoveResponse = {
  hand: { "player-1": [], "player-2": [] },
  isGameOver: false,
  ok: true,
  trail: [],
  view: fakeView,
};

describe("TargetPicker (pure component)", () => {
  it("orders friendly units before enemy units and labels each side", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <TargetPicker
        cardId="card-spell"
        cardLabel="Spark Shot"
        hint="Deal 2 to a unit"
        battlefields={battlefieldsWithUnits}
        casterId="player-1"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const buttons = screen.getAllByRole("button");
    // Expected: friendly unit btn, enemy unit btn, skip btn, cancel btn.
    expect(buttons.length).toBeGreaterThanOrEqual(4);

    const friendly = screen.getByTestId("target-option-u-friendly-1");
    const enemy = screen.getByTestId("target-option-u-enemy-1");
    expect(friendly).toBeInTheDocument();
    expect(enemy).toBeInTheDocument();
    expect(friendly.getAttribute("data-side")).toBe("friendly");
    expect(enemy.getAttribute("data-side")).toBe("enemy");
    // Friendly should come BEFORE enemy in DOM order.
    const order = buttons
      .map((b) => b.getAttribute("data-testid") ?? "")
      .filter((id) => id.startsWith("target-option-"));
    expect(order).toEqual(["target-option-u-friendly-1", "target-option-u-enemy-1"]);
  });

  it("invokes onConfirm with the chosen target id", () => {
    const onConfirm = vi.fn();
    render(
      <TargetPicker
        cardId="card-spell"
        cardLabel="Spark Shot"
        battlefields={battlefieldsWithUnits}
        casterId="player-1"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("target-option-u-enemy-1"));
    expect(onConfirm).toHaveBeenCalledWith(["u-enemy-1"]);
  });

  it("invokes onConfirm with [] when Skip is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <TargetPicker
        cardId="card-spell"
        cardLabel="Spark Shot"
        battlefields={battlefieldsWithUnits}
        casterId="player-1"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("target-skip"));
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it("filters rendered options to legalTargetIds when provided (batch 25 DDD)", () => {
    const onConfirm = vi.fn();
    render(
      <TargetPicker
        cardId="card-spell"
        cardLabel="Spark Shot"
        battlefields={battlefieldsWithUnits}
        casterId="player-1"
        onConfirm={onConfirm}
        onCancel={() => {}}
        // Only the enemy unit is engine-legal — the friendly unit should not
        // Be rendered as an option even though it's on the battlefield.
        legalTargetIds={["u-enemy-1"]}
      />,
    );
    expect(screen.queryByTestId("target-option-u-friendly-1")).toBeNull();
    expect(screen.getByTestId("target-option-u-enemy-1")).toBeInTheDocument();
  });

  it("switches to a multi-pick UI when legalTargets contains a >1 length tuple (batch 26 HHH)", () => {
    const onConfirm = vi.fn();
    render(
      <TargetPicker
        cardId="card-spell"
        cardLabel="Spark Storm"
        battlefields={battlefieldsWithUnits}
        casterId="player-1"
        onConfirm={onConfirm}
        onCancel={() => {}}
        legalTargets={[
          [],
          ["u-friendly-1"],
          ["u-enemy-1"],
          ["u-friendly-1", "u-enemy-1"],
        ]}
      />,
    );

    // Checkbox-based options + Confirm button — NOT single-click options.
    expect(screen.getByTestId("target-checkbox-u-friendly-1")).toBeInTheDocument();
    expect(screen.getByTestId("target-checkbox-u-enemy-1")).toBeInTheDocument();
    expect(screen.getByTestId("target-confirm")).toBeInTheDocument();
    // No "Skip" button in multi mode.
    expect(screen.queryByTestId("target-skip")).toBeNull();

    // Selecting the friendly-only subset is legal — Confirm should fire
    // OnConfirm with that subset.
    fireEvent.click(screen.getByTestId("target-checkbox-u-friendly-1"));
    fireEvent.click(screen.getByTestId("target-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(["u-friendly-1"]);
  });

  it("rejects an illegal multi-pick subset and surfaces a validation error (batch 26 HHH)", () => {
    const onConfirm = vi.fn();
    render(
      <TargetPicker
        cardId="card-spell"
        cardLabel="Spark Storm"
        battlefields={battlefieldsWithUnits}
        casterId="player-1"
        onConfirm={onConfirm}
        onCancel={() => {}}
        // Legal tuples allow either friendly OR enemy alone, OR both —
        // But NOT the empty set.
        legalTargets={[
          ["u-friendly-1"],
          ["u-enemy-1"],
          ["u-friendly-1", "u-enemy-1"],
        ]}
      />,
    );

    // Confirm with NOTHING selected — should NOT call onConfirm and SHOULD
    // Surface a validation error.
    fireEvent.click(screen.getByTestId("target-confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("target-picker-error")).toBeInTheDocument();

    // Now select the legal full subset — error clears and onConfirm fires.
    fireEvent.click(screen.getByTestId("target-checkbox-u-friendly-1"));
    fireEvent.click(screen.getByTestId("target-checkbox-u-enemy-1"));
    fireEvent.click(screen.getByTestId("target-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Order-independent: confirmMulti emits selection in insertion order.
    const arg = onConfirm.mock.calls[0]![0] as string[];
    expect([...arg].toSorted()).toEqual(["u-enemy-1", "u-friendly-1"]);
  });

  it("renders an empty-state message when no units exist on any battlefield", () => {
    const emptyBfs = [
      {
        contested: false,
        controller: null,
        id: "player-1-bf-1",
        units: [],
      },
    ];
    render(
      <TargetPicker
        cardId="card-spell"
        cardLabel="Spark Shot"
        battlefields={emptyBfs}
        casterId="player-1"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId("target-picker-empty")).toBeInTheDocument();
  });
});

describe("TargetPicker integration via PlayPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens TargetPicker when a spell hand-chip is clicked (and units exist on board)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(spellHandState), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="bbb-test" />);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-card-spell")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hand-chip-card-spell"));

    expect(screen.getByTestId("target-picker")).toBeInTheDocument();
    expect(screen.getByTestId("target-picker-hint")).toHaveTextContent(
      /Deal 2 damage to target enemy unit/,
    );

    // No move POSTed yet — only the initial GET.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts playFromHand with params.targets after a target is picked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(spellHandState), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(okMoveResponse), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="bbb-test" />);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-card-spell")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hand-chip-card-spell"));
    fireEvent.click(screen.getByTestId("target-option-u-enemy-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const moveCall = fetchMock.mock.calls[1];
    expect(moveCall[0]).toBe("/api/v2/move/bbb-test");
    const body = JSON.parse(moveCall[1].body as string);
    expect(body.moveId).toBe("playFromHand");
    expect(body.playerId).toBe("player-1");
    expect(body.params.cardId).toBe("card-spell");
    expect(body.params.targets).toEqual(["u-enemy-1"]);

    // Picker should close after confirm.
    expect(screen.queryByTestId("target-picker")).toBeNull();
  });
});
