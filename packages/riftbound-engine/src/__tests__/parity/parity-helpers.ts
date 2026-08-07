/**
 * Server-path parity helpers.
 *
 * Two live engines built from ONE scenario spec:
 *   - `harness`: the L2 Game (verbs → EngineBackend → TurnDriver.applyMove)
 *   - `server` : a ServerLikeDriver that sequences the engine exactly the way
 *                apps/riftbound-app/server does after the single-path refactor
 *                (ws-game.ts / routes-game.ts → turn.ts applySessionMove →
 *                TurnDriver.applyMove; sandbox Goldfish policy on top).
 *
 * `expectParity()` asserts both engines offer the IDENTICAL validOnly
 * `enumerateMoves` menu (moveId + canonical params) for a seat.
 */

import { expect } from "bun:test";
import type { PlayerId } from "@tcg/core";
import type { CardDefinitionRegistry } from "../../operations/card-lookup";
import { getGlobalCardRegistry, setGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundGameState } from "../../types";
import type { Game, Scenario, Seat } from "../../harness";
import { applyMove, buildScenarioEngine, loadDefaultCardPool } from "../../harness";
import type { ApplyMoveResult, HarnessEngine } from "../../harness";
import { canonicalJson } from "../../harness/internal";

export interface MenuEntry {
  readonly moveId: string;
  readonly params: Record<string, unknown>;
  /** `moveId:canonical-json(params)` — the comparison key. */
  readonly key: string;
}

/** Sorted, canonical validOnly menu of `seat` on `engine`. */
export function menuOf(engine: HarnessEngine, seat: Seat): MenuEntry[] {
  return engine
    .enumerateMoves(seat as PlayerId, { validOnly: true })
    .map((m) => {
      const params = (m.params ?? {}) as Record<string, unknown>;
      return { key: `${m.moveId}:${canonicalJson(params)}`, moveId: m.moveId, params };
    })
    .toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Drives a raw RuleEngine the way the app server does: every client move and
 * every Goldfish action is one `applyMove` call (move + automatic procedures);
 * clients only ever send moves the server enumerated for them.
 */
export class ServerLikeDriver {
  readonly engine: HarnessEngine;
  readonly players: readonly Seat[];
  private readonly registry: CardDefinitionRegistry;

  constructor(engine: HarnessEngine, players: readonly Seat[]) {
    this.engine = engine;
    this.players = players;
    this.registry = getGlobalCardRegistry();
  }

  /** The engine reads a process-global card registry; re-install ours (two engines coexist per test). */
  activate(): void {
    if (getGlobalCardRegistry() !== this.registry) {
      setGlobalCardRegistry(this.registry);
    }
  }

  get state(): RiftboundGameState {
    this.activate();
    return this.engine.getState();
  }

  menu(seat: Seat): MenuEntry[] {
    this.activate();
    return menuOf(this.engine, seat);
  }

  /** ws-game.ts `type:"move"` handler ≡ turn.ts applySessionMove ≡ TurnDriver.applyMove. */
  move(seat: Seat, moveId: string, params: Record<string, unknown>): ApplyMoveResult {
    this.activate();
    return applyMove(this.engine, this.players, seat, moveId, { playerId: seat, ...params });
  }

  /** move() that must succeed. */
  do(seat: Seat, moveId: string, params: Record<string, unknown> = {}): ApplyMoveResult {
    const r = this.move(seat, moveId, params);
    if (!r.success) {
      throw new Error(`server path rejected ${moveId} for ${seat}: ${r.error ?? r.errorCode ?? "unknown"}`);
    }
    return r;
  }

  /**
   * What the web client does: pick one of the ENUMERATED moves (by moveId +
   * predicate over its params) and send it back verbatim.
   */
  send(seat: Seat, moveId: string, match: (params: Record<string, unknown>) => boolean = () => true): ApplyMoveResult {
    const entry = this.menu(seat).find((m) => m.moveId === moveId && match(m.params));
    if (!entry) {
      const legal = this.menu(seat).map((m) => m.key);
      throw new Error(`server path: no enumerated ${moveId} for ${seat} matching predicate; legal:\n  ${legal.join("\n  ")}`);
    }
    return this.do(seat, moveId, entry.params);
  }

  /** Pass priority / focus for whoever holds it until the position is open (bounded). */
  settlePassive(maxSteps = 40): void {
    for (let i = 0; i < maxSteps; i++) {
      const st = this.state;
      if (st.status !== "playing" || st.pendingChoice) {
        return;
      }
      const chain = st.interaction?.chain;
      if (chain?.active && chain.activePlayer) {
        this.do(chain.activePlayer, "passChainPriority");
        continue;
      }
      const sd = st.interaction?.showdownStack?.at(-1);
      if (sd?.active && sd.focusPlayer) {
        this.do(sd.focusPlayer, "passShowdownFocus");
        continue;
      }
      return;
    }
  }

  /**
   * Port of apps/riftbound-app/server/turn.ts `sandboxAutoPlay` policy (minus
   * websockets/logging): the Goldfish passes, answers its prompts with the
   * first enumerated choice, begins/conquers when asked, and ends its turn.
   */
  goldfish(goldfish: Seat, maxIterations = 20): void {
    const human = this.players.find((p) => p !== goldfish);
    for (let i = 0; i < maxIterations; i++) {
      const st = this.state;
      if (st.status !== "playing") {
        return;
      }
      const chain = st.interaction?.chain;
      if (
        chain?.active &&
        human &&
        chain.activePlayer === human &&
        st.turn.activePlayer === goldfish &&
        chain.items.length > 0 &&
        chain.items.every((it) => it.controller === goldfish && (it as { triggered?: boolean }).triggered)
      ) {
        if (this.move(human, "passChainPriority", {}).success) {
          continue;
        }
      }
      if (chain?.active && chain.activePlayer === goldfish) {
        if (this.move(goldfish, "passChainPriority", {}).success) {
          continue;
        }
      }
      const menu = this.menu(goldfish);
      const pending = st.pendingChoice as { prompter?: string; playerId?: string } | undefined;
      if (pending && (pending.prompter ?? pending.playerId) === goldfish) {
        const pick = menu.find((m) => m.moveId === "resolvePendingChoice");
        if (pick && this.move(goldfish, "resolvePendingChoice", pick.params).success) {
          continue;
        }
      }
      const passFocus = menu.find((m) => m.moveId === "passShowdownFocus");
      if (passFocus && this.move(goldfish, "passShowdownFocus", passFocus.params).success) {
        continue;
      }
      if (st.turn.activePlayer === goldfish) {
        const begin = menu.find((m) => m.moveId === "startShowdown");
        if (begin && this.move(goldfish, "startShowdown", begin.params).success) {
          continue;
        }
        const conquer = menu.find((m) => m.moveId === "conquerBattlefield" && m.params.playerId === goldfish);
        if (conquer && this.move(goldfish, "conquerBattlefield", conquer.params).success) {
          continue;
        }
        if (this.move(goldfish, "endTurn", {}).success) {
          continue;
        }
      }
      return;
    }
  }
}

/** The two paths over one scenario. */
export class ParityPair {
  readonly harness: Game;
  readonly server: ServerLikeDriver;

  private constructor(harness: Game, server: ServerLikeDriver) {
    this.harness = harness;
    this.server = server;
  }

  /** `make` is called twice so both engines start from byte-identical specs (same seed). */
  static async build(make: () => Scenario): Promise<ParityPair> {
    const harness = await make().build();
    const pool = await loadDefaultCardPool();
    const built = buildScenarioEngine(make().toSpec(), pool);
    const server = new ServerLikeDriver(built.engine, built.spec.players);
    return new ParityPair(harness, server);
  }

  harnessMenu(seat: Seat): MenuEntry[] {
    return menuOf(this.harness.engine, seat);
  }

  serverMenu(seat: Seat): MenuEntry[] {
    return this.server.menu(seat);
  }

  /**
   * Assert the seat's menu is identical on both paths and return it. With
   * several seats, checks each and returns the first seat's menu.
   */
  expectParity(...seats: Seat[]): MenuEntry[] {
    let first: MenuEntry[] | undefined;
    for (const seat of seats) {
      const h = this.harnessMenu(seat).map((m) => m.key);
      const s = this.serverMenu(seat).map((m) => m.key);
      expect(s, `server-path menu for ${seat} must equal harness menu`).toEqual(h);
      first ??= this.harnessMenu(seat);
    }
    return first ?? [];
  }

  /** Same public game state on both paths (turn / interaction / battlefields / points). */
  expectSamePosition(): void {
    const pickPos = (st: RiftboundGameState) => ({
      battlefields: st.battlefields,
      interaction: st.interaction,
      pendingChoice: st.pendingChoice ?? null,
      points: Object.fromEntries(Object.entries(st.players).map(([id, p]) => [id, p.victoryPoints])),
      status: st.status,
      turn: st.turn,
    });
    expect(canonicalJson(pickPos(this.server.state))).toEqual(canonicalJson(pickPos(this.harness.gameState)));
  }
}

/** Menu queries. */
export const has = (menu: readonly MenuEntry[], moveId: string, match: (p: Record<string, unknown>) => boolean = () => true): boolean =>
  menu.some((m) => m.moveId === moveId && match(m.params));

export const playLocations = (menu: readonly MenuEntry[], cardId: string): string[] =>
  menu
    .filter((m) => m.moveId === "playUnit" && m.params.cardId === cardId)
    .map((m) => String(m.params.location))
    .toSorted();
