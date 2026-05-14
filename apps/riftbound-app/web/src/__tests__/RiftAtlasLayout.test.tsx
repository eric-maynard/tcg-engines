/**
 * RiftAtlas-style layout tests (Phase B batch 23 XX).
 *
 * Covers:
 *   - PlayerPanel renders card.name (not the instance UUID) in hand chips
 *     when the API provides it (WW#5).
 *   - PlayerPanel falls back to definitionId when name is absent.
 *   - BaseZone renders units and the empty state.
 *   - MoveLog shows the resolved card name instead of the raw cardId
 *     (WW#5) and continues to expose the raw params via the title attr.
 *   - PlayPage renders the new layout regions (seat-opponent, board,
 *     seat-self, battlefield-band) in RiftAtlas table-top order.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlayPage } from "../PlayPage";
import { BaseZone } from "../components/BaseZone";
import { MoveLog, buildCardNameMap } from "../components/MoveLog";
import type {
  BattlefieldUnit,
  HandCard,
  StateResponse,
  TrailStep,
} from "../lib/api";

const view = {
  battlefields: [
    {
      id: "player-1-bf-1",
      controller: "player-1",
      contested: false,
      units: [
        {
          id: "player-1-main-0-ogn-003-298",
          definitionId: "ogn-003",
          controller: "player-1",
          name: "Swift Scout",
          might: 2,
        },
      ],
    },
  ],
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

const stateWithNamed: StateResponse = {
  hand: {
    "player-1": [
      {
        id: "hand-1",
        definitionId: "aggressive-warrior",
        name: "Aggressive Warrior",
        energyCost: 2,
        might: 3,
      },
    ],
    "player-2": [],
  },
  isGameOver: false,
  trail: [
    {
      seq: 1,
      playerId: "player-1",
      moveId: "playFromHand",
      params: { cardId: "player-1-main-0-ogn-003-298", location: "base" },
      success: true,
    },
  ],
  view,
};

describe("PlayerPanel — card name vs UUID (WW#5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders card.name on the hand chip, not the instance UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(stateWithNamed), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);

    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-hand-1")).toBeInTheDocument();
    });

    const chip = screen.getByTestId("hand-chip-hand-1");
    // Card name is shown
    expect(chip.textContent).toContain("Aggressive Warrior");
    // Raw definition-id should NOT leak into the visible label when a
    // Name is available.
    expect(chip.textContent).not.toContain("aggressive-warrior");
    // Cost + might are NOT rendered as overlay badges — the card image
    // Already shows those values (Eric mandate 1:37PM 5/13). When
    // ImageUrl is present, only the image renders inside the chip.
    expect(screen.queryByTestId("hand-chip-cost-hand-1")).toBeNull();
    expect(screen.queryByTestId("hand-chip-might-hand-1")).toBeNull();
  });

  it("falls back to definitionId when name is missing", async () => {
    const noNameState: StateResponse = {
      ...stateWithNamed,
      hand: {
        "player-1": [
          {
            definitionId: "fallback-card",
            id: "hand-2",
          },
        ],
        "player-2": [],
      },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(noNameState), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-hand-2")).toBeInTheDocument();
    });
    const chip = screen.getByTestId("hand-chip-hand-2");
    expect(chip.textContent).toContain("fallback-card");
  });
});

describe("BaseZone (WW#1)", () => {
  it("renders the empty state when no units are in base", () => {
    render(<BaseZone playerId="player-1" units={[]} />);
    expect(screen.getByTestId("base-zone-player-1")).toBeInTheDocument();
    expect(screen.getByTestId("base-zone-player-1-empty")).toHaveTextContent(
      "(empty)",
    );
  });

  it("renders units with their card name and might", () => {
    const units: BattlefieldUnit[] = [
      {
        controller: "player-1",
        definitionId: "ogn-003",
        id: "unit-1",
        might: 2,
        name: "Swift Scout",
      },
    ];
    render(<BaseZone playerId="player-1" units={units} />);
    const unit = screen.getByTestId("base-zone-unit-unit-1");
    expect(unit).toBeInTheDocument();
    expect(unit.textContent).toContain("Swift Scout");
    expect(unit.textContent).toContain("2");
    // Raw definitionId should NOT appear visibly when name is set.
    expect(unit.textContent).not.toContain("ogn-003");
  });
});

describe("MoveLog (WW#5)", () => {
  it("renders the card name instead of the raw cardId UUID", () => {
    const trail: TrailStep[] = [
      {
        moveId: "playFromHand",
        params: { cardId: "player-1-main-0-ogn-003-298", location: "base" },
        playerId: "player-1",
        seq: 1,
        success: true,
      },
    ];
    const cardNames = {
      "player-1-main-0-ogn-003-298": "Swift Scout",
    };
    render(<MoveLog trail={trail} cardNames={cardNames} />);
    const step = screen.getByTestId("step-1");
    expect(step.textContent).toContain("Swift Scout");
    // UUID should no longer appear in the visible text (params are
    // Still available via the title tooltip).
    expect(step.textContent).not.toContain("player-1-main-0-ogn-003-298");
    // Title preserves raw params for debuggability.
    expect(step.getAttribute("title")).toContain(
      "player-1-main-0-ogn-003-298",
    );
  });

  it("falls back to the raw cardId when no name is known", () => {
    const trail: TrailStep[] = [
      {
        moveId: "playFromHand",
        params: { cardId: "unknown-instance-id" },
        playerId: "player-2",
        seq: 2,
        success: true,
      },
    ];
    render(<MoveLog trail={trail} cardNames={{}} />);
    const step = screen.getByTestId("step-2");
    expect(step.textContent).toContain("unknown-instance-id");
  });
});

describe("buildCardNameMap", () => {
  it("walks hand + battlefield units to build a unified lookup", () => {
    const hand: Record<string, readonly HandCard[]> = {
      "player-1": [
        { definitionId: "d1", id: "h1", name: "Hand Card One" },
        { definitionId: "d2", id: "h2" },
      ],
    };
    const battlefields = [
      {
        contested: false,
        controller: "player-1",
        id: "bf",
        units: [
          {
            id: "u1",
            definitionId: "du1",
            controller: "player-1",
            name: "Unit One",
          },
        ],
      },
    ];
    const map = buildCardNameMap(hand, battlefields);
    expect(map["h1"]).toBe("Hand Card One");
    expect(map["h2"]).toBe("d2"); // Fallback to definitionId
    expect(map["u1"]).toBe("Unit One");
  });
});

describe("PlayPage layout regions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the RiftAtlas-style seat + battlefield-band layout", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(stateWithNamed), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("play-page")).toBeInTheDocument();
    });

    // Top-level board grid.
    expect(screen.getByTestId("board")).toBeInTheDocument();
    expect(screen.getByTestId("board-side")).toBeInTheDocument();
    // Opponent at top, self at bottom, battlefield row in middle.
    expect(screen.getByTestId("seat-opponent")).toBeInTheDocument();
    expect(screen.getByTestId("battlefield-band")).toBeInTheDocument();
    expect(screen.getByTestId("seat-self")).toBeInTheDocument();
    // Base zones present for both players (WW#1 fix — they may be empty
    // Until YY threads base-zone units through the API).
    expect(screen.getByTestId("base-zone-player-1")).toBeInTheDocument();
    expect(screen.getByTestId("base-zone-player-2")).toBeInTheDocument();
    // Battlefield units render with card.name.
    const unit = screen.getByTestId(
      "bf-unit-player-1-main-0-ogn-003-298",
    );
    expect(unit.textContent).toContain("Swift Scout");
    expect(unit.textContent).not.toContain("ogn-003");
  });
});

describe("Hand chip visual structure (batch 26 III)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders hand-chip as image-only when imageUrl is present (Eric mandate 1:37PM: card art already shows cost+might)", async () => {
    const stateWithImage: StateResponse = {
      ...stateWithNamed,
      hand: {
        "player-1": [
          {
            definitionId: "aggressive-warrior",
            energyCost: 2,
            id: "hand-1",
            imageUrl: "https://example.com/cards/aggressive-warrior.png",
            might: 3,
            name: "Aggressive Warrior",
          },
        ],
        "player-2": [],
      },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(stateWithImage), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-hand-1")).toBeInTheDocument();
    });

    const chip = screen.getByTestId("hand-chip-hand-1");
    expect(chip.className).toContain("hand-chip");
    // With imageUrl present, the chip should render the image only —
    // Cost/name/might overlays are removed since the card art shows them.
    expect(chip.querySelector(".hand-chip-image")).not.toBeNull();
    expect(chip.querySelector(".hand-chip-cost")).toBeNull();
    expect(chip.querySelector(".hand-chip-might")).toBeNull();
  });
});

describe("BattlefieldPicker title (WW#5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses card.name in 'Where to play X?' title", async () => {
    const stateWithMultiLoc: StateResponse = {
      hand: {
        "player-1": [
          {
            id: "hand-3",
            definitionId: "aggressive-warrior",
            name: "Aggressive Warrior",
            legalLocations: ["base", "player-1-bf-1"],
          },
        ],
        "player-2": [],
      },
      isGameOver: false,
      trail: [],
      view,
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(stateWithMultiLoc), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayPage sessionId="abc" />);
    await waitFor(() => {
      expect(screen.getByTestId("hand-chip-hand-3")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hand-chip-hand-3"));
    const title = screen.getByTestId("battlefield-picker-title");
    expect(title.textContent).toBe("Where to play Aggressive Warrior?");
  });
});
