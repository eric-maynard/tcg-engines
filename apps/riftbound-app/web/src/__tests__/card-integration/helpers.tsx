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
  readonly pendingChoice?: GameView["pendingChoice"];
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
    pendingChoice: opts.pendingChoice,
    phaseStrip: [{ id: "main", label: "Main" }],
    players: [
      {
        baseUnits: opts.localBaseUnits ?? [],
        deckSize: 30,
        energy: 10,
        handSize: 1,
        id: localId,
        power: { body: 3, mind: 3, calm: 3, chaos: 3, fury: 3, order: 3 },
        runeDeckSize: 12,
        trashSize: 0,
        victoryPoints: 0,
        xp: 0,
      },
      {
        baseUnits: opts.opponentBaseUnits ?? [],
        deckSize: 30,
        energy: 0,
        handSize: 0,
        id: opponentId,
        power: {},
        runeDeckSize: 12,
        trashSize: 0,
        victoryPoints: 0,
        xp: 0,
      },
    ],
    runesInPool: opts.runesInPool ?? [],
    status: "playing",
    turn: {
      activePlayer: localId,
      number: 1,
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
  /** Optional pending-choice snapshot pre-seeded on the view (e.g. Stacked Deck's look-and-pick). */
  readonly pendingChoice?: GameView["pendingChoice"];
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
    pendingChoice: opts.pendingChoice,
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

/* ============================================================================
 * Engine-assert harness (iter-S)
 *
 * Up to now this file proved the SPA dispatched the right move; we never
 * actually fed that move into a real `RiftboundEngine` to check the post-move
 * state. Eric asked for FE↔BE parity — each card-integration test should run
 * the same scenario as the corresponding engine test and assert end state.
 *
 * `applyDispatchedMoveToEngine` does the round-trip:
 *   1. Boots a fresh `EngineSession` (real-decks off so we can place exactly
 *      what we want).
 *   2. Calls `seedSingleCardCast` to install the card-under-test in
 *      `player-1`'s hand plus a friendly + enemy prop unit on a battlefield.
 *      This is the SAME seed the `/api/v2/scenario/cast-card` endpoint (used
 *      by the random-card-flow puppeteer tester) calls.
 *   3. Translates the FE-side dispatched move's `cardId` and `targets` from
 *      the synthesized test ids (e.g. `instance-sabotage`, `u-friendly-1`) to
 *      the engine-side seeded instance ids (`castdemo-ogn-156-298-player-1`,
 *      `castdemo-friendly-player-1`).
 *   4. Dispatches via the same `tryPlayFromHand` helper the v2 server uses,
 *      so we run through the exact same play-move routing logic.
 *   5. Returns `{ session, state, snapshot, error, success }` for assertions.
 *
 * Intentionally returns BOTH the public `GameView` (`state`) and the raw
 * `InternalSnapshot` (`snapshot`) so tests can drop into either layer
 * depending on what they're asserting. Trash / hand / deck contents are most
 * directly checked via `snapshot.zones[...]` + `snapshot.cards[...]` because
 * `GameView` only surfaces sizes.
 * ========================================================================== */

import { EngineSession, getInternalSnapshot } from "../../../../lib/engine-session";
import { tryPlayFromHand } from "../../../../lib/server-helpers";

/** Result of replaying a dispatched move through a real engine session. */
export interface EngineApplyResult {
  /** The session (so a follow-up assertion can poke deeper if needed). */
  readonly session: EngineSession;
  /** Public game view AFTER the move applied. */
  readonly state: ReturnType<EngineSession["getView"]>;
  /** Internal zones+cards snapshot AFTER the move applied. */
  readonly snapshot: {
    zones: Record<string, { cardIds: string[] }>;
    cards: Record<string, { owner: string; controller: string; zone: string; definitionId: string }>;
  };
  /** Public game view BEFORE the move applied (sanity reference). */
  readonly stateBefore: ReturnType<EngineSession["getView"]>;
  /** True iff the engine accepted the move. */
  readonly success: boolean;
  /** Engine-side error message when `success === false`. */
  readonly error?: string;
  /** Seeded id of the focus card on the engine side (in `casterId`'s hand). */
  readonly engineCardId: string;
  /** Seeded id of the prop friendly unit (on first battlefield). */
  readonly friendlyUnitId: string;
  /** Seeded id of the prop enemy unit (on first battlefield). */
  readonly enemyUnitId: string;
}

/** Mapping the FE-side test ids use → engine-side seeded ids. */
export interface EngineApplyOpts {
  /** Real card definition id, e.g. `sabotage.id`. */
  readonly cardId: string;
  /** Dispatched move from `getLastDispatchedMove()`. */
  readonly dispatched: DispatchedMove;
  /**
   * Mapping for `params.targets[]`: from the FE-side synthesized id (e.g.
   * `"u-friendly-1"` or `"player-2"`) to the engine-side id. The helper
   * pre-populates the well-known unit / player ids so most tests can pass
   * `{}` and let the defaults work:
   *
   *   - `"u-friendly-1"` → seeded friendly unit id
   *   - `"u-enemy-1"`    → seeded enemy unit id
   *   - `"player-1"`     → caster id (left as-is)
   *   - `"player-2"`     → opponent id (left as-is)
   *
   * Tests with custom-named units / gears / cards-in-trash should pass
   * explicit mappings.
   */
  readonly targetIdMap?: Record<string, string>;
  /** Optional caster id; defaults to `player-1`. */
  readonly casterId?: string;
  /**
   * Optional pre-apply mutations on the seeded internal state. Used by
   * scenarios like Morbid Return where the engine-side scenario needs a
   * specific card in trash before the move is applied.
   *
   * Receives the mutable internal snapshot — same surface `seedSingleCardCast`
   * uses. Mutations apply directly; no need to return anything.
   */
  readonly seedMutate?: (
    snapshot: ReturnType<typeof getInternalSnapshot>,
    seeded: { engineCardId: string; friendlyUnitId: string; enemyUnitId: string },
  ) => void;
}

/**
 * Run the FE-dispatched move through a real `RiftboundEngine` and return
 * before/after state. See module doc for the full round-trip.
 */
export function applyDispatchedMoveToEngine(
  opts: EngineApplyOpts,
): EngineApplyResult {
  const casterId = opts.casterId ?? "player-1";
  const opponentId = casterId === "player-1" ? "player-2" : "player-1";

  // 1. Fresh engine session (synthetic decks — `seedSingleCardCast` will
  //    Place real card definitions on top).
  const session = new EngineSession({
    playerIds: [casterId, opponentId] as [string, string],
    seed: `engine-assert-${opts.cardId}-${Date.now()}`,
  });

  // 2. Seed the focus card in caster's hand + prop friendly/enemy units.
  const seed = session.seedSingleCardCast({
    cardId: opts.cardId,
    casterId,
    energy: 10,
  });
  if (!seed.seeded || !seed.instanceId) {
    throw new Error(
      `applyDispatchedMoveToEngine: seedSingleCardCast failed for ${opts.cardId}`,
    );
  }

  const engineCardId = seed.instanceId;
  const friendlyUnitId = `castdemo-friendly-${casterId}`;
  const enemyUnitId = `castdemo-enemy-${opponentId}`;

  // 3. Optional pre-apply mutations (e.g. seed a card into trash for
  //    Morbid Return).
  if (opts.seedMutate) {
    const snap = getInternalSnapshot(session.engine);
    opts.seedMutate(snap, { enemyUnitId, engineCardId, friendlyUnitId });
  }

  const stateBefore = session.getView();

  // 4. Translate the FE-dispatched move into engine-side ids.
  const defaultMap: Record<string, string> = {
    "u-friendly-1": friendlyUnitId,
    "u-enemy-1": enemyUnitId,
    [casterId]: casterId,
    [opponentId]: opponentId,
  };
  const idMap: Record<string, string> = { ...defaultMap, ...opts.targetIdMap };
  const remapTarget = (id: unknown): unknown => {
    if (typeof id !== "string") {return id;}
    return idMap[id] ?? id;
  };
  const fe = opts.dispatched;
  const targets = Array.isArray(fe.params.targets)
    ? (fe.params.targets as unknown[]).map(remapTarget)
    : fe.params.targets;
  const remappedParams: Record<string, unknown> = {
    ...fe.params,
    cardId: engineCardId,
    playerId: casterId,
    ...(targets !== undefined ? { targets } : {}),
  };

  // 5. Dispatch via the same routing helper the v2 server uses for
  //    `playFromHand`.
  const r = tryPlayFromHand(session, casterId, remappedParams);

  const snapshot = getInternalSnapshot(session.engine);
  const state = session.getView();
  return {
    enemyUnitId,
    engineCardId,
    error: r.error,
    friendlyUnitId,
    session,
    snapshot,
    state,
    stateBefore,
    success: r.ok,
  };
}

/**
 * Convenience: read every card-id currently in a given zone, optionally
 * filtered by owner. Returns a fresh array.
 */
export function getZoneCardIds(
  snapshot: { zones: Record<string, { cardIds: string[] }>; cards: Record<string, { owner: string }> },
  zoneId: string,
  owner?: string,
): string[] {
  const zone = snapshot.zones[zoneId];
  if (!zone) {return [];}
  if (!owner) {return [...zone.cardIds];}
  return zone.cardIds.filter((cid) => snapshot.cards[cid]?.owner === owner);
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
