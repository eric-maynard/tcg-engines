/**
 * Helpers for the card-integration harness.
 *
 * Goal: spin up a real <PlayPage> with a chosen card pre-seeded into the
 * player's hand, drive the click-flow (hand chip → picker → target), and
 * capture the resulting `playFromHand` move that would have been sent to the
 * engine — all in-process, no live server.
 *
 * Implementation: PlayPage talks to the server via `fetch` (see `lib/api.ts`).
 * We stub `globalThis.fetch` so that:
 *   - `GET /api/v2/state/:id`  → resolves to a pre-built StateResponse
 *   - `POST /api/v2/move/:id`  → captures the request body into
 *                                `getDispatchedMoves()` and returns an OK
 *                                MoveResponse (same view — the test only
 *                                cares about WHAT was dispatched, not the
 *                                post-move state).
 *
 * This intentionally treats the engine as a black box: the engine + cards
 * packages already have 1874 + 917 unit tests proving state-transition
 * correctness. Here we're verifying the SPA's UI plumbing — click chip,
 * open the right picker, click a legal target, dispatch the right move.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { PlayPage } from "../../PlayPage";
import type {
  BattlefieldUnit,
  GameView,
  GameViewBattlefield,
  HandCard,
  MoveResponse,
  StateResponse,
} from "../../lib/api";

/** Captured `params` from each `POST /api/v2/move/...` call, in order. */
export interface DispatchedMove {
  readonly moveId: string;
  readonly playerId?: string;
  readonly params: Record<string, unknown>;
}

let _dispatched: DispatchedMove[] = [];

export function getDispatchedMoves(): readonly DispatchedMove[] {
  return _dispatched;
}

export function getLastDispatchedMove(): DispatchedMove | undefined {
  return _dispatched[_dispatched.length - 1];
}

export function resetDispatchedMoves(): void {
  _dispatched = [];
}

/** Minimal default GameViewPlayer for the local + opponent seats. */
interface MakeViewOpts {
  readonly localId?: string;
  readonly opponentId?: string;
  readonly battlefields?: readonly GameViewBattlefield[];
  readonly gearsInPlay?: GameView["gearsInPlay"];
  readonly cardsInTrash?: GameView["cardsInTrash"];
  readonly runesInPool?: GameView["runesInPool"];
  readonly chain?: GameView["chain"];
  readonly localBaseUnits?: readonly BattlefieldUnit[];
  readonly opponentBaseUnits?: readonly BattlefieldUnit[];
}

function makeView(opts: MakeViewOpts = {}): GameView {
  const localId = opts.localId ?? "player-1";
  const opponentId = opts.opponentId ?? "player-2";
  return {
    battlefields: opts.battlefields ?? [],
    cardsInTrash: opts.cardsInTrash ?? [],
    chain: opts.chain,
    gameId: "harness-game",
    gearsInPlay: opts.gearsInPlay ?? [],
    phaseStrip: [{ id: "main", label: "Main" }],
    players: [
      {
        id: localId,
        victoryPoints: 0,
        xp: 0,
        handSize: 1,
        deckSize: 30,
        runeDeckSize: 12,
        trashSize: 0,
        energy: 10,
        power: { body: 3, mind: 3, calm: 3, chaos: 3, fury: 3, order: 3 },
        baseUnits: opts.localBaseUnits ?? [],
      },
      {
        id: opponentId,
        victoryPoints: 0,
        xp: 0,
        handSize: 0,
        deckSize: 30,
        runeDeckSize: 12,
        trashSize: 0,
        energy: 0,
        power: {},
        baseUnits: opts.opponentBaseUnits ?? [],
      },
    ],
    runesInPool: opts.runesInPool ?? [],
    status: "playing",
    turn: {
      number: 1,
      activePlayer: localId,
      phase: "main",
      phaseLabel: "Main",
    },
    victoryScore: 8,
    winner: null,
  };
}

export interface RenderOpts {
  readonly card: HandCard;
  readonly localId?: string;
  readonly opponentId?: string;
  /** Friendly + enemy units on each battlefield. */
  readonly battlefields?: readonly GameViewBattlefield[];
  /** Gears in play (used by gear-target spells like Turn to Dust). */
  readonly gearsInPlay?: GameView["gearsInPlay"];
  /** Cards in trash zones (used by card-in-trash spells like Morbid Return). */
  readonly cardsInTrash?: GameView["cardsInTrash"];
  /** Runes in the rune pool (used by rune-target spells). */
  readonly runesInPool?: GameView["runesInPool"];
  /** Chain (spell stack) snapshot — used by spell-target spells. */
  readonly chain?: GameView["chain"];
  /** Extra hand cards alongside the focus card, if needed. */
  readonly extraHand?: readonly HandCard[];
  /** Opponent hand cards (face-down by default in the SPA). */
  readonly opponentHand?: readonly HandCard[];
}

/**
 * Render `<PlayPage>` with `card` in the local player's hand, a stubbed
 * `fetch` that captures dispatched moves, and a pre-built `GameView` that
 * mirrors the requested battlefield + gear state.
 *
 * Returns the chosen `localId`/`opponentId` for assertions plus the testing-
 * library `screen` for convenience.
 */
export async function renderPlayPageWithCard(opts: RenderOpts): Promise<{
  localId: string;
  opponentId: string;
}> {
  resetDispatchedMoves();
  const localId = opts.localId ?? "player-1";
  const opponentId = opts.opponentId ?? "player-2";

  const view = makeView({
    battlefields: opts.battlefields,
    cardsInTrash: opts.cardsInTrash,
    chain: opts.chain,
    gearsInPlay: opts.gearsInPlay,
    localId,
    opponentId,
    runesInPool: opts.runesInPool,
  });
  const state: StateResponse = {
    actionsLegal: {
      assignAttacker: false,
      assignDefender: false,
      contestBattlefield: false,
      endTurn: true,
      passChainPriority: false,
      passShowdownFocus: false,
      resolveCombat: false,
      startShowdown: false,
      stepBot: true,
    },
    hand: {
      [localId]: [opts.card, ...(opts.extraHand ?? [])],
      [opponentId]: opts.opponentHand ?? [],
    },
    isGameOver: false,
    trail: [],
    view,
  };

  const moveResponse: MoveResponse = {
    hand: { [localId]: [], [opponentId]: [] },
    isGameOver: false,
    ok: true,
    trail: [],
    view,
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/v2/state/")) {
      return new Response(JSON.stringify(state), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    if (url.startsWith("/api/v2/move/") && init?.method === "POST") {
      const body = JSON.parse((init.body as string) ?? "{}") as {
        moveId: string;
        playerId?: string;
        params?: Record<string, unknown>;
      };
      _dispatched.push({
        moveId: body.moveId,
        params: body.params ?? {},
        playerId: body.playerId,
      });
      return new Response(JSON.stringify(moveResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    if (url.startsWith("/api/v2/step/") && init?.method === "POST") {
      return new Response(JSON.stringify(moveResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    throw new Error(`Unmocked fetch: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<PlayPage sessionId="harness" />);

  await waitFor(() => {
    if (!screen.queryByTestId(`hand-chip-${opts.card.id}`)) {
      throw new Error("hand chip not yet rendered");
    }
  });

  return { localId, opponentId };
}

/** Click the hand chip for `cardId` (the focus card). */
export function clickHandChip(cardId: string): void {
  fireEvent.click(screen.getByTestId(`hand-chip-${cardId}`));
}

/**
 * Read the visible picker title from the open TargetPicker, or `null` if no
 * picker is open. Use this to assert "the right picker opened".
 */
export function getPickerTitle(): string | null {
  const title = screen.queryByTestId("target-picker-title");
  return title?.textContent ?? null;
}

/** True when the (any-variant) TargetPicker is currently open. */
export function isPickerOpen(): boolean {
  return screen.queryByTestId("target-picker") !== null;
}

/**
 * Return the picker's variant. `null` when no picker is open. Sourced from
 * the `data-variant` attribute on the modal root; the unit picker leaves it
 * unset so we fall back to "unit". Extended (iter-Q) to recognise the new
 * trash/hand/deck/rune/permanent/spell variants.
 */
export type PickerVariant =
  | "unit"
  | "player"
  | "gear"
  | "permanent"
  | "spell"
  | "card-in-trash"
  | "card-in-hand"
  | "card-in-deck"
  | "rune";

export function getPickerVariant(): PickerVariant | null {
  const el = screen.queryByTestId("target-picker");
  if (!el) {return null;}
  const v = el.getAttribute("data-variant");
  switch (v) {
    case "player":
    case "gear":
    case "permanent":
    case "spell":
    case "card-in-trash":
    case "card-in-hand":
    case "card-in-deck":
    case "rune": {
      return v;
    }
    default: {
      return "unit";
    }
  }
}

/**
 * Return the list of clickable target option testid suffixes (the id part
 * after `target-option-`). For the unit picker these are unit instance ids;
 * for the gear picker they're gear instance ids; for the player picker they
 * are the literal strings `player-self` and `player-opponent`.
 */
export function getPickerOptionIds(): string[] {
  const buttons = screen.queryAllByTestId(/^target-option-/);
  return buttons.map((b) => {
    const tid = b.getAttribute("data-testid") ?? "";
    return tid.replace(/^target-option-/, "");
  });
}

/**
 * Click the first available picker option (unit / gear / player). Throws if
 * no options are available. Returns the id that was clicked so the caller
 * can assert it ended up in the dispatched move's `params.targets`.
 *
 * For the player picker this returns the `data-player-id` of the clicked
 * button (the actual player id forwarded to the engine), NOT the literal
 * "player-self" / "player-opponent" testid suffix.
 */
export function clickFirstPickerOption(): string {
  const buttons = screen.queryAllByTestId(/^target-option-/);
  const enabled = buttons.filter((b) => !(b as HTMLButtonElement).disabled);
  if (enabled.length === 0) {
    throw new Error("No enabled target options in picker");
  }
  const btn = enabled[0]!;
  const tid = btn.getAttribute("data-testid") ?? "";
  const id = tid.replace(/^target-option-/, "");
  // Player picker — return the data-player-id instead of the testid suffix.
  const playerId = btn.getAttribute("data-player-id");
  fireEvent.click(btn);
  return playerId ?? id;
}
