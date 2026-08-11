/**
 * Game creation from decks and the pregame flow (battlefield select,
 * sideboard, mulligan, transition to play), including the pregame WebSocket
 * handlers.
 *
 * ## Sideboarding (assumed organized-play policy — NOT Core Rules)
 *
 * The Core Rules (rule 103 deck construction, 485/486 modes of play) define no
 * sideboard, and no tournament-rules digest ships in this repo, so this
 * implements the widely published Riftbound OP policy and documents the
 * assumptions here (mirrored in README.md §Sideboarding):
 *
 * - A deck MAY register a sideboard of up to DECK_RULES.sideboardMax (10)
 *   cards of Main Deck types only (units / spells / gear — no legend, champion
 *   slot, battlefields or runes). The 3-copies-per-name limit (rule 103.2.b,
 *   Chosen Champion included) is counted across main deck + sideboard. Like
 *   every construction rule this is ADVISORY (server/deck-rules.ts): an
 *   oversized or off-identity sideboard still loads and plays, flagged as not
 *   tournament-legal; only `enforceLegality` lobbies refuse it.
 * - Sideboarding happens BETWEEN the games of a match — before game 2 and
 *   game 3 of a Bo3 — never before game 1: game 1 is always played with the
 *   registered main deck (you have seen nothing of the opponent yet, and OP
 *   policy gives no pre-match swap window). So a Bo3 game 1, a Bo1 Duel, and
 *   the sandbox (Goldfish / Claude) all go straight from the reveal to the
 *   mulligan even when sideboards are registered. The one exception is the
 *   explicit lobby / API option `sideboardBeforeGame1` (default false) — a
 *   testing / kitchen-table switch that opens the swap window before game 1.
 * - When the window IS open (game ≥ 2, or `sideboardBeforeGame1`): once both
 *   players' Legends, Chosen Champions and the battlefields for this game are
 *   revealed (Duel: the random pick, rule 485.5; Match: after
 *   `battlefield_select`, 486.5) and BEFORE opening hands are drawn /
 *   mulligans taken, each player may swap cards 1-for-1 between main deck and
 *   sideboard — so main-deck size and sideboard size are invariant. Swaps are
 *   simultaneous and hidden: the opponent learns only choosing/locked, never
 *   counts or identities. There is no timer; play continues when both have
 *   locked in, at which point each main deck is rebuilt from the post-swap
 *   list, shuffled with the engine RNG, and the opening hands are drawn (rule
 *   116) for the mulligan (117).
 * - The phase exists only when at least one seat has a non-empty sideboard;
 *   otherwise the flow is exactly as before. Seats with nothing to swap, and
 *   the sandbox opponent seat (Goldfish / Claude), lock in immediately.
 * - Nothing is persisted: swaps are per game. `session.postSideboardDecks`
 *   keeps the post-swap configuration for the next game of the match.
 *   server/match.ts `startNextGame` builds game N+1 with `createGameFromDecks(
 *   post[P1] ?? decks[P1], post[P2] ?? decks[P2], …, { gameNumber: N + 1 })` —
 *   `gameNumber > 1` is what arms this phase (the gate lives in
 *   `sideboardWindowOpen`; the mechanics below are game-number agnostic).
 *
 * ## Match game pregame order (rules 113 → 117)
 * battlefield_select (113 / 486.5) → sideboard (game 2+) → initiative (115:
 * d20 roll for game 1 when the lobby did not roll, previous game's LOSER
 * chooses for games 2–3 — README §Match play) → hands drawn (116) → mulligan.
 */

import { getGlobalCardRegistry, riftboundDefinition } from "@tcg/riftbound";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "@tcg/riftbound";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import type { ServerWebSocket } from "bun";
import { type LogEntry, actorName, makeLogEntry } from "../src/narrator";
import { chooseBotBattlefield, runOpponent } from "./ai-opponent";
import { allCards, makeLookupPayload, registerCard, registry } from "./cards";
import { MAX_SIDEBOARD_SIZE, summarizeLegality, validateDeckConfig } from "./deck-rules";
import { gameLogger } from "./log";
import { matchSummary, newMatchState } from "./match-state";
import { buildAvailableMoves, buildGameSnapshot } from "./snapshot";
import {
  type DeckConfig,
  type GameSession,
  type InitiativeState,
  type PregameState,
  type SideboardCardRef,
  type SideboardSeatState,
  type WsData,
  broadcast,
  gameSessions,
  getInternalSnapshot,
  lobbies,
  lobbyByCode,
} from "./state";

/**
 * Is the sideboard swap window open for this game? Only BETWEEN games of a
 * match (game 2+); never before game 1 unless the lobby / API explicitly set
 * `sideboardBeforeGame1` (see the policy note at the top of this file).
 */
export function sideboardWindowOpen(options?: { gameNumber?: number; sideboardBeforeGame1?: boolean }): boolean {
  const gameNumber = Math.max(1, Math.floor(options?.gameNumber ?? 1));
  return gameNumber > 1 || options?.sideboardBeforeGame1 === true;
}

/** Create a game from two deck configurations */
export function createGameFromDecks(
  deck1: DeckConfig,
  deck2: DeckConfig,
  seed?: string,
  options?: {
    gameMode?: "duel" | "match";
    firstPlayer?: string;
    sandbox?: boolean;
    /**
     * Goldfish — active: one human plays both seats. The session stays a
     * sandbox (practice tools, REST hooks) but NO bot answers for player-2:
     * `pregame.sandbox` is false (both seats pick battlefields / sideboard /
     * mulligan themselves) and `session.hotSeat` is set (no driver, seat switching).
     */
    hotSeat?: boolean;
    names?: Record<string, string>;
    /** Initiative roll results for match log narration. */
    initiativeRoll?: { p1Roll: number; p2Roll: number; winner: string };
    /** 1-based game number within the match (default 1). Game 2+ opens the sideboard window. */
    gameNumber?: number;
    /** Testing / kitchen-table switch: allow sideboarding before game 1 too (default false). */
    sideboardBeforeGame1?: boolean;
    /**
     * Decide the first player INSIDE the pregame (phase `initiative`, after
     * battlefields + sideboarding, before hands are drawn — rules 113→116):
     * `roll` = d20 each, higher roll chooses (game 1 of a lobby Match, a
     * rematch); `loser_chooses` = the previous game's loser chooses (games 2–3,
     * server/match.ts). Absent ⇒ `firstPlayer` is fixed now (Bo1 lobby roll,
     * REST, tests) and there is no such phase.
     */
    initiative?: { kind: "roll" } | { kind: "loser_chooses"; chooser: string; afterGame?: number };
    /** rule 486.5 — per seat, battlefield ids already used this match: still listed, not selectable. */
    excludedBattlefields?: Record<string, readonly string[]>;
  },
): GameSession {
  const P1 = "player-1";
  const P2 = "player-2";
  const gameNumber = Math.max(1, Math.floor(options?.gameNumber ?? 1));
  const hotSeat = options?.hotSeat === true;
  /** A bot (Goldfish / Claude) answers for player-2 — false for duels AND for the active Goldfish. */
  const botSeated = (options?.sandbox ?? false) && !hotSeat;
  const initiative: InitiativeState | undefined = options?.initiative
    ? options.initiative.kind === "roll"
      ? { chooser: null, decided: false, kind: "roll" }
      : { ...(options.initiative.afterGame ? { afterGame: options.initiative.afterGame } : {}), chooser: options.initiative.chooser, decided: false, kind: "loser_chooses" }
    : undefined;

  // Deck construction legality (rule 103: copy limit, 40-card minimum, domain
  // identity, sideboard policy…) is ADVISORY — see server/deck-rules.ts. Only
  // refuse what cannot be seated at all; everything else plays, with a
  // shared-log note (no card names: lists stay private) when a deck is flagged.
  const legalityNotes: string[] = [];
  for (const [pid, deck] of [[P1, deck1], [P2, deck2]] as const) {
    if (!Array.isArray(deck?.mainDeckCardIds) || deck.mainDeckCardIds.length === 0) {
      throw new Error(`Cannot create game: ${pid} has an empty main deck (0 cards)`);
    }
    if (deck.sideboardCardIds !== undefined && !Array.isArray(deck.sideboardCardIds)) {
      throw new Error(`Cannot create game: ${pid} sideboardCardIds must be an array of card ids`);
    }
    const report = validateDeckConfig(deck, { mode: options?.gameMode ?? "duel" });
    if (!report.legal) {
      const who = options?.names?.[pid] ?? (pid === P1 ? "Player 1" : "Player 2");
      legalityNotes.push(`⚠ ${who}'s deck is not tournament-legal (${summarizeLegality(report)}) — allowed in this game.`);
    }
  }

  const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Player 1" },
      { id: P2, name: "Player 2" },
    ],
    { seed: seed ?? crypto.randomUUID() },
  );

  const cardReg = getGlobalCardRegistry();
  // rule 762: "name a card" enumerates the format-legal pool. The registry is
  // keyed by card INSTANCE and is never cleared between games on this server,
  // so without this the nameable set would be both decks (leaking the
  // opponent's list) plus leftovers from earlier games.
  cardReg.setNameCatalog(allCards as unknown as { name?: string; cardType?: string; tags?: readonly string[] }[]);
  const internal = getInternalSnapshot(engine);
  const log: LogEntry[] = legalityNotes.map((n) => makeLogEntry(n));

  const decks: [string, DeckConfig][] = [[P1, deck1], [P2, deck2]];
  // A sideboard phase runs only BETWEEN games (game 2+, or the explicit
  // `sideboardBeforeGame1` opt-in) and only if some seat brought a sideboard;
  // then the opening hands wait until sideboarding completes (completeSideboard).
  // Game 1 always plays the registered main deck — sideboards ride along
  // untouched in `session.decks` for the next game of the match.
  const sideboarding = sideboardWindowOpen(options) && decks.some(([, d]) => (d.sideboardCardIds?.length ?? 0) > 0);
  // rule 116 after 115: hands wait for sideboarding and/or the first-player decision.
  const deferHands = sideboarding || initiative !== undefined;
  const sideboardSeats: Record<string, SideboardSeatState> = {};
  for (const [pid, deck] of decks) {
    // Register and initialize main deck
    const mainDeckIds: string[] = [];
    for (let i = 0; i < deck.mainDeckCardIds.length; i++) {
      const defId = deck.mainDeckCardIds[i];
      const cardId = `${pid}-main-${i}-${defId}`;
      const def = registry.get(defId);
      mainDeckIds.push(cardId);
      registerCard(internal, cardId, defId, pid, "mainDeck");
      if (def) {
        cardReg.register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId));
      }
    }
    engine.executeMove("initializeMainDeck", {
      params: { cardIds: mainDeckIds, playerId: pid },
      playerId: pid as PlayerId,
    });
    if (sideboarding) {
      // Sideboard cards get instance ids now but stay OUT of the engine until
      // (unless) they are swapped in — no snapshot can ever carry them.
      const side: SideboardCardRef[] = (deck.sideboardCardIds ?? []).map((defId, i) => ({ defId, id: `${pid}-side-${i}-${defId}` }));
      sideboardSeats[pid] = {
        deck,
        // A seat with nothing to swap has nothing to decide; the sandbox
        // opponent seat (Goldfish / Claude) never sideboards for now.
        // TODO(vs-Claude): model-driven sideboarding hook — ask the seat's
        // driver for swaps here instead of auto-locking.
        locked: side.length === 0 || (botSeated && pid === P2),
        main: mainDeckIds.map((id, i) => ({ defId: deck.mainDeckCardIds[i] as string, id })),
        side,
      };
    }

    // Register and initialize rune deck
    const runeDeckIds: string[] = [];
    for (let i = 0; i < deck.runeDeckCardIds.length; i++) {
      const defId = deck.runeDeckCardIds[i];
      const cardId = `${pid}-rune-${i}-${defId}`;
      const def = registry.get(defId);
      runeDeckIds.push(cardId);
      registerCard(internal, cardId, defId, pid, "runeDeck");
      if (def) {
        cardReg.register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId, {
          cardType: "rune",
          energyCost: 0,
        }));
      }
    }
    engine.executeMove("initializeRuneDeck", {
      params: { playerId: pid, runeIds: runeDeckIds },
      playerId: pid as PlayerId,
    });

    // Place Champion Legend in Legend Zone (Rule 111)
    if (deck.legendId) {
      const defId = deck.legendId;
      const cardId = `${pid}-legend-${defId}`;
      const def = registry.get(defId);
      registerCard(internal, cardId, defId, pid, "legendZone");
      if (def) {
        cardReg.register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId, {
          energyCost: undefined as unknown as number,
        }));
      }
      engine.executeMove("placeLegend", {
        params: { legendId: cardId },
        playerId: pid as PlayerId,
      });
    }

    // Place Chosen Champion in Champion Zone (Rule 112)
    if (deck.championId) {
      const defId = deck.championId;
      const cardId = `${pid}-champion-${defId}`;
      const def = registry.get(defId);
      registerCard(internal, cardId, defId, pid, "championZone");
      if (def) {
        cardReg.register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId));
      }
      engine.executeMove("placeChampion", {
        params: { championId: cardId },
        playerId: pid as PlayerId,
      });
    }

    // Shuffle before drawing (Rule 114)
    engine.executeMove("shuffleDecks", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });

    // Draw initial hand of 4 (Rule 116) — after sideboarding / the first-player step when those run (enterMulligan).
    if (!deferHands) {
      engine.executeMove("drawInitialHand", {
        params: { playerId: pid },
        playerId: pid as PlayerId,
      });
    }

    log.push(
      makeLogEntry(
        `${options?.names?.[pid] ?? (pid === P1 ? "Player 1" : "Player 2")} deck loaded.`,
      ),
    );
  }

  const gameMode = options?.gameMode ?? "duel";
  const firstPlayer = options?.firstPlayer ?? P1;
  const secondPlayer = firstPlayer === P1 ? P2 : P1;
  const isSandbox = options?.sandbox ?? false;

  // rule 485.5 — Duel (Bo1): the GAME selects 1 of each player's 3 battlefields
  // at random (engine move `selectRandomBattlefield`, seeded engine RNG — same
  // seed ⇒ same board) and places it now; no choice UI is shown (DESIGN.md
  // §Pregame). Match (486.5) — and the sandbox's Bo3 option — defer to the
  // manual `battlefield_select` pregame phase instead.
  const randomSelections: Record<string, string> = {};
  if (gameMode === "duel") {
    // Fallback: a deck without battlefields draws its three candidates from the full pool.
    const allBattlefields = allCards.filter((c) => c.cardType === "battlefield").map((c) => c.id);
    const rng = engine.getRNG();
    const candidatesFor = (deck: DeckConfig): string[] => {
      const own = [...new Set(deck.battlefieldIds)];
      return own.length > 0 ? own : rng.shuffle(allBattlefields).slice(0, 3);
    };
    const bfIds: string[] = [];
    for (const [pid, deck] of decks) {
      const defIds = candidatesFor(deck);
      const cardIds: string[] = [];
      for (const defId of defIds) {
        const cardId = `${pid}-bf-${defId}`;
        // The two the game does not keep end up "set aside" (rule 485.5: removed, not trashed).
        registerCard(internal, cardId, defId, pid, "setAside");
        // Rule 419.4.a / 383.2.c: battlefield-card triggered abilities (e.g. Abandoned
        // Hall unl-205) must be visible to the trigger runner, so register the
        // definition in the engine's global card registry like every other card.
        const def = registry.get(defId);
        if (def) cardReg.register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId));
        cardIds.push(cardId);
      }
      if (cardIds.length === 0) {continue;}
      const result = engine.executeMove("selectRandomBattlefield", {
        params: { battlefieldIds: cardIds, playerId: pid },
        playerId: pid as PlayerId,
      });
      let kept = engine.getState().setup?.battlefieldChoices?.[pid];
      if (!result.success || !kept) {
        // Engine refused (should not happen in a fresh setup): fall back to a
        // server-side crypto-random pick placed directly.
        kept = cardIds[crypto.getRandomValues(new Uint32Array(1))[0]! % cardIds.length]!;
        engine.executeMove("placeBattlefields", {
          params: { battlefieldIds: [kept] },
          playerId: pid as PlayerId,
        });
      }
      bfIds.push(kept);
      randomSelections[pid] = kept.replace(`${pid}-bf-`, "");
    }

    // Create per-battlefield zones (dynamic zones for unit placement)
    for (const bfCardId of bfIds) {
      internal.zones[`battlefield-${bfCardId}`] = { cardIds: [], config: { faceDown: false, id: `battlefield-${bfCardId}`, name: `Battlefield ${bfCardId}`, ordered: false, visibility: "public" } };
      // Rule 811.1.b: every battlefield has a facedown sub-zone for [Hidden] cards (rule 107.3.a).
      internal.zones[`facedown-${bfCardId}`] = { cardIds: [], config: { faceDown: true, id: `facedown-${bfCardId}`, maxSize: 1, name: `Facedown at ${bfCardId}`, ordered: false, visibility: "private" } };
    }
    for (const [pid, defId] of Object.entries(randomSelections)) {
      const name = registry.get(defId)?.name ?? defId;
      log.push(makeLogEntry(`${options?.names?.[pid] ?? (pid === P1 ? "Player 1" : "Player 2")}'s battlefield was selected at random: ${name}.`));
    }
  }

  // rule 486.5 — battlefields used earlier this match (in a game somebody won)
  // stay listed but cannot be picked; if that would leave a seat no choice at
  // all (short / duplicate battlefield list) the restriction is waived for it.
  const battlefieldExcluded: Record<string, string[]> = {};
  for (const [pid, deck] of decks) {
    const ex = [...new Set(options?.excludedBattlefields?.[pid] ?? [])].filter((id) => deck.battlefieldIds.includes(id));
    if (ex.length > 0 && deck.battlefieldIds.some((id) => !ex.includes(id))) {battlefieldExcluded[pid] = ex;}
  }

  const pregame: PregameState = {
    ...(Object.keys(battlefieldExcluded).length > 0 ? { battlefieldExcluded } : {}),
    battlefieldOptions: {
      [P1]: deck1.battlefieldIds,
      [P2]: deck2.battlefieldIds,
    },
    battlefieldRandom: gameMode === "duel",
    battlefieldSelections: gameMode === "duel" ? { ...randomSelections } : {},
    firstPlayer,
    gameMode,
    handsDrawn: !deferHands,
    ...(initiative ? { initiative } : {}),
    mulliganComplete: new Set(),
    phase: gameMode === "match" ? "battlefield_select" : "mulligan",
    sandbox: botSeated,
    secondPlayer,
    ...(sideboarding ? { sideboard: sideboardSeats } : {}),
  };

  const firstPlayerName = options?.names?.[firstPlayer]
    ?? (firstPlayer === P1 ? "Player 1" : "Player 2");

  // Narrate the d20 initiative roll if supplied by the lobby
  const roll = options?.initiativeRoll;
  if (roll) {
    const winnerId = roll.winner;
    const loserId = winnerId === P1 ? P2 : P1;
    const winnerName = options?.names?.[winnerId]
      ?? (winnerId === P1 ? "Player 1" : "Player 2");
    const loserName = options?.names?.[loserId]
      ?? (loserId === P1 ? "Player 1" : "Player 2");
    const winnerRoll = winnerId === P1 ? roll.p1Roll : roll.p2Roll;
    const loserRoll = winnerId === P1 ? roll.p2Roll : roll.p1Roll;

    log.push(makeLogEntry(`${winnerName} rolled a d20.`));
    log.push(
      makeLogEntry(
        `${winnerName} rolled ${winnerRoll}. ${loserName} rolled ${loserRoll}.`,
      ),
    );
    log.push(
      makeLogEntry(
        `${winnerName} wins initiative (${winnerRoll} vs ${loserRoll}) and decides who plays first.`,
      ),
    );
  }

  // With an in-pregame first-player step the choice is logged when it is made (chooseFirstPlayer).
  if (!initiative) {
    log.push(
      makeLogEntry(
        `Chose ${firstPlayerName} to take the first turn.`,
      ),
    );
  }

  const names = options?.names ?? { [P1]: "Player 1", [P2]: "Player 2" };
  const session: GameSession = {
    clients: new Map(),
    decks: { [P1]: deck1, [P2]: deck2 },
    engine,
    gameMode,
    gameNumber,
    ...(hotSeat ? { hotSeat: true } : {}),
    log,
    playerNames: names,
    players: [P1, P2],
    pregame,
    sandbox: isSandbox,
    seq: 0,
    ...(options?.sideboardBeforeGame1 === true ? { sideboardBeforeGame1: true } : {}),
  };
  session.match = newMatchState(gameMode);
  // Duel: legends, champions and the random battlefields are all known now —
  // sideboard (if anyone can) before the mulligan. Match waits for battlefield_select.
  if (gameMode === "duel") {advancePastReveal(session);}
  return session;
}

// ============================================================================
// Sideboarding (policy: see top of file)
// ============================================================================

export type SideboardResult = { ok: true } | { ok: false; error: string };

/**
 * Called once the information sideboarding is based on (both legends,
 * champions, this game's battlefields) is public: enter the `sideboard`
 * phase if some seat still has a decision to make, else go (through
 * completeSideboard when a sideboard phase was armed) straight to the mulligan.
 */
export function advancePastReveal(session: GameSession): void {
  const { pregame } = session;
  if (!pregame) {return;}
  const seats = pregame.sideboard;
  if (seats && !session.players.every((p) => seats[p]?.locked)) {
    pregame.phase = "sideboard";
    session.log.push(makeLogEntry("Sideboarding — each player may swap cards between main deck and sideboard, then lock in."));
    return;
  }
  if (seats) {completeSideboard(session);}
  advancePastSideboard(session);
}

/**
 * Decks are final (sideboarding done or skipped): decide who goes first if
 * this pregame owns that decision (phase `initiative` — rule 115 comes after
 * 113/114 and before the draw, 116), else straight to the mulligan.
 */
export function advancePastSideboard(session: GameSession): void {
  const { pregame } = session;
  if (!pregame) {return;}
  if (pregame.initiative && !pregame.initiative.decided) {
    enterInitiative(session);
    return;
  }
  enterMulligan(session);
}

/** d20 each, re-rolled on ties (rule 115: any fair random method). */
function rollInitiative(): { p1Roll: number; p2Roll: number } {
  let p1Roll = 0;
  let p2Roll = 0;
  do {
    p1Roll = Math.floor(Math.random() * 20) + 1;
    p2Roll = Math.floor(Math.random() * 20) + 1;
  } while (p1Roll === p2Roll);
  return { p1Roll, p2Roll };
}

/**
 * Enter the first-player step. `roll`: roll now, the higher roll becomes the
 * chooser (narrated like the lobby roll). `loser_chooses`: the chooser is
 * already known. Either way the phase then waits for `chooseFirstPlayer`
 * (the bot seat answers through runBotPregame).
 */
export function enterInitiative(session: GameSession): void {
  const { pregame } = session;
  const ini = pregame?.initiative;
  if (!pregame || !ini) {return;}
  const [P1, P2] = session.players;
  if (ini.kind === "roll" && !ini.chooser) {
    const { p1Roll, p2Roll } = rollInitiative();
    ini.p1Roll = p1Roll;
    ini.p2Roll = p2Roll;
    ini.chooser = p1Roll > p2Roll ? P1 : P2;
    const loser = ini.chooser === P1 ? P2 : P1;
    const w = actorName(ini.chooser, session.playerNames);
    const l = actorName(loser, session.playerNames);
    const wr = ini.chooser === P1 ? p1Roll : p2Roll;
    const lr = ini.chooser === P1 ? p2Roll : p1Roll;
    session.log.push(makeLogEntry(`${w} rolled a d20.`));
    session.log.push(makeLogEntry(`${w} rolled ${wr}. ${l} rolled ${lr}.`));
    session.log.push(makeLogEntry(`${w} wins initiative (${wr} vs ${lr}) and decides who plays first.`));
  } else if (ini.kind === "loser_chooses" && ini.chooser) {
    session.log.push(makeLogEntry(`${actorName(ini.chooser, session.playerNames)} lost game ${ini.afterGame ?? (session.gameNumber ?? 2) - 1} and decides who plays first.`));
  }
  pregame.phase = "initiative";
}

export type ChooseFirstResult = { ok: true } | { ok: false; error: string };

/**
 * The chooser names who takes the first turn (`firstPlayerId` = a seat id).
 * Refused outside the step / from the wrong seat / twice. Then hands are
 * drawn and the mulligan begins. Callers bump `seq` and broadcast.
 */
export function chooseFirstPlayer(session: GameSession, playerId: string, firstPlayerId: string): ChooseFirstResult {
  const pregame = session.pregame;
  const ini = pregame?.initiative;
  if (!pregame || !ini || pregame.phase !== "initiative" || ini.decided) {
    return { error: "Not choosing who goes first right now", ok: false };
  }
  if (ini.chooser !== playerId) {
    return { error: `Only ${actorName(ini.chooser ?? "", session.playerNames)} chooses who goes first`, ok: false };
  }
  if (!session.players.includes(firstPlayerId)) {
    return { error: "Unknown seat", ok: false };
  }
  ini.decided = true;
  pregame.firstPlayer = firstPlayerId;
  pregame.secondPlayer = session.players.find((p) => p !== firstPlayerId) ?? pregame.secondPlayer;
  session.log.push(makeLogEntry(`Chose ${actorName(firstPlayerId, session.playerNames)} to take the first turn.`, { rewindable: false }));
  enterMulligan(session);
  return { ok: true };
}

/** Draw the opening hands if they were deferred (rule 116), then the mulligan (117). */
export function enterMulligan(session: GameSession): void {
  const { pregame, engine } = session;
  if (!pregame) {return;}
  if (pregame.handsDrawn === false) {
    for (const pid of session.players) {
      engine.executeMove("drawInitialHand", { params: { playerId: pid }, playerId: pid as PlayerId });
    }
    pregame.handsDrawn = true;
  }
  pregame.phase = "mulligan";
}

/**
 * Swap one main-deck card for one sideboard card (1-for-1, so both sizes are
 * invariant). Validates phase, seat, lock, that `outId` is currently in THIS
 * seat's main list and `inId` in THIS seat's side list (foreign / unknown ids
 * are therefore rejected), and rule 103.2.b on the resulting main deck.
 * Re-swapping (undo) is just another swap until the seat locks in.
 */
export function swapSideboard(session: GameSession, playerId: string, outId: unknown, inId: unknown): SideboardResult {
  const pregame = session.pregame;
  if (!pregame || pregame.phase !== "sideboard" || !pregame.sideboard) {
    return { error: "Not in the sideboard phase", ok: false };
  }
  const seat = pregame.sideboard[playerId];
  if (!seat) {return { error: "Not a seated player", ok: false };}
  if (seat.locked) {return { error: "Sideboard already locked in", ok: false };}
  if (typeof outId !== "string" || typeof inId !== "string" || !outId || !inId) {
    return { error: "A swap is 1-for-1: name one main-deck card (out) and one sideboard card (in)", ok: false };
  }
  const outIdx = seat.main.findIndex((c) => c.id === outId);
  if (outIdx === -1) {return { error: "That card is not in your main deck", ok: false };}
  const inIdx = seat.side.findIndex((c) => c.id === inId);
  if (inIdx === -1) {return { error: "That card is not in your sideboard", ok: false };}
  const outCard = seat.main[outIdx] as SideboardCardRef;
  const inCard = seat.side[inIdx] as SideboardCardRef;
  // Rule 103.2.b on the post-swap deck is advisory like the rest of deck
  // construction (server/deck-rules.ts) — the swap is 1-for-1, so sizes are
  // invariant and nothing here can make the game unplayable.
  // Swap in place so both lists keep their order in the overlay.
  seat.main[outIdx] = inCard;
  seat.side[inIdx] = outCard;
  return { ok: true };
}

/**
 * Apply a batch of 1-for-1 swaps atomically: every `{out, in}` is validated
 * and applied in order (so a later swap may name a card an earlier one moved);
 * on the first failure the seat's lists are restored and that error returned.
 * This is what the overlay's Lock in sends — it edits quantities locally and
 * turns the deltas into swaps only at lock time (`sideboard_lock` + `swaps`).
 */
export function applySideboardSwaps(session: GameSession, playerId: string, swaps: unknown): SideboardResult & { applied?: number } {
  const pregame = session.pregame;
  if (!pregame || pregame.phase !== "sideboard" || !pregame.sideboard) {
    return { error: "Not in the sideboard phase", ok: false };
  }
  const seat = pregame.sideboard[playerId];
  if (!seat) {return { error: "Not a seated player", ok: false };}
  if (swaps === undefined || swaps === null) {return { applied: 0, ok: true };}
  if (!Array.isArray(swaps)) {return { error: "swaps must be a list of {out, in} pairs", ok: false };}
  const mainBefore = [...seat.main];
  const sideBefore = [...seat.side];
  for (let i = 0; i < swaps.length; i++) {
    const s = swaps[i] as { out?: unknown; in?: unknown } | null;
    const r = swapSideboard(session, playerId, s?.out, s?.in);
    if (!r.ok) {
      seat.main = mainBefore;
      seat.side = sideBefore;
      return { error: `swap ${i + 1} of ${swaps.length}: ${r.error}`, ok: false };
    }
  }
  return { applied: swaps.length, ok: true };
}

/**
 * Lock a seat's configuration. In sandbox games the other (Goldfish / Claude)
 * seat locks with it. When every seat is locked the decks are rebuilt,
 * shuffled, hands drawn, and the pregame moves on to the mulligan.
 * Returns true when this call completed the phase.
 */
export function lockSideboard(session: GameSession, playerId: string): SideboardResult & { completed?: boolean } {
  const pregame = session.pregame;
  if (!pregame || pregame.phase !== "sideboard" || !pregame.sideboard) {
    return { error: "Not in the sideboard phase", ok: false };
  }
  const seats = pregame.sideboard;
  const seat = seats[playerId];
  if (!seat) {return { error: "Not a seated player", ok: false };}
  if (seat.locked) {return { ok: true };}
  seat.locked = true;
  // Shared log: no counts, no identities — only that the seat is done.
  session.log.push(makeLogEntry(`${actorName(playerId, session.playerNames)} locked in their deck.`, { rewindable: false }));
  if (pregame.sandbox) {
    for (const other of session.players) {
      if (other !== playerId && seats[other] && !seats[other].locked) {
        seats[other].locked = true;
        session.log.push(makeLogEntry(`${actorName(other, session.playerNames)} locked in their deck.`));
      }
    }
  }
  if (!session.players.every((p) => seats[p]?.locked)) {return { ok: true };}
  completeSideboard(session);
  advancePastSideboard(session);
  return { completed: true, ok: true };
}

/**
 * Every seat locked: rebuild each main deck in the engine from the post-swap
 * list (main-origin cards now in the sideboard leave the engine entirely;
 * side-origin cards now in the main deck are registered and added), shuffle
 * with the engine RNG, draw the opening hands (rule 116), and record the
 * post-swap deck configs for a Bo3 follow-up game.
 */
export function completeSideboard(session: GameSession): void {
  const pregame = session.pregame;
  const seats = pregame?.sideboard;
  if (!pregame || !seats) {return;}
  const { engine } = session;
  const internal = getInternalSnapshot(engine);
  const cardReg = getGlobalCardRegistry();
  const post: Record<string, DeckConfig> = {};
  const drawNow = !(pregame.initiative && !pregame.initiative.decided);

  for (const pid of session.players) {
    const seat = seats[pid];
    if (!seat) {continue;}
    const keep = new Set(seat.main.map((c) => c.id));
    const deckZone = internal.zones.mainDeck;
    if (deckZone) {
      // Swapped-out cards: gone from the deck zone and the instance tables.
      const mine = deckZone.cardIds.filter((id) => internal.cards[id]?.owner === pid);
      for (const id of mine) {
        if (keep.has(id)) {continue;}
        deckZone.cardIds.splice(deckZone.cardIds.indexOf(id), 1);
        delete internal.cards[id];
        delete internal.cardMetas[id];
      }
    }
    // Swapped-in cards: register + add through the engine's own deck seeding.
    const added: string[] = [];
    for (const c of seat.main) {
      if (internal.cards[c.id]) {continue;}
      registerCard(internal, c.id, c.defId, pid, "mainDeck");
      const def = registry.get(c.defId);
      if (def) {cardReg.register(c.id, makeLookupPayload(def as unknown as Record<string, unknown>, c.id));}
      added.push(c.id);
    }
    if (added.length > 0) {
      engine.executeMove("initializeMainDeck", {
        params: { cardIds: added, playerId: pid },
        playerId: pid as PlayerId,
      });
    }
    // Shuffle (rule 114) with the seeded engine RNG, then the opening hand (116)
    // — unless the first player is still to be decided (115 before 116: enterMulligan draws then).
    engine.executeMove("shuffleDecks", { params: { playerId: pid }, playerId: pid as PlayerId });
    if (drawNow) {engine.executeMove("drawInitialHand", { params: { playerId: pid }, playerId: pid as PlayerId });}
    post[pid] = {
      ...seat.deck,
      mainDeckCardIds: seat.main.map((c) => c.defId),
      sideboardCardIds: seat.side.map((c) => c.defId),
    };
  }
  session.postSideboardDecks = post;
  if (drawNow) {pregame.handsDrawn = true;}
  session.log.push(makeLogEntry(drawNow ? "Sideboarding complete. Decks shuffled; opening hands drawn." : "Sideboarding complete. Decks shuffled."));
}

/** Public card descriptor for the acting seat's own overlay lists. */
function describeSideboardCard(c: SideboardCardRef) {
  const def = registry.get(c.defId);
  return {
    cardType: def?.cardType ?? "unknown",
    defId: c.defId,
    energyCost: def?.energyCost,
    id: c.id,
    name: def?.name ?? c.defId,
    rulesText: def?.rulesText ?? "",
  };
}

/**
 * Sideboard section of the pregame payload for `playerId`: `you` carries ONLY
 * this seat's own lists; `opponent` carries only public information (legend,
 * chosen champion, this game's battlefield(s), choosing|locked).
 */
function buildSideboardPayload(session: GameSession, playerId: string): Record<string, unknown> {
  const pregame = session.pregame!;
  const seats = pregame.sideboard ?? {};
  const me = seats[playerId];
  const oppId = session.players.find((p) => p !== playerId) ?? "";
  const opp = seats[oppId];
  const named = (defId: string | undefined) => (defId ? { id: defId, name: registry.get(defId)?.name ?? defId } : null);
  const oppBf = pregame.battlefieldSelections[oppId];
  return {
    opponent: {
      battlefields: oppBf ? [named(oppBf)] : [],
      champion: named(opp?.deck.championId),
      id: oppId,
      legend: named(opp?.deck.legendId),
      name: session.playerNames[oppId] ?? oppId,
      status: opp?.locked ? "locked" : "choosing",
    },
    you: me
      ? {
          championName: me.deck.championId ? (registry.get(me.deck.championId)?.name ?? null) : null,
          locked: me.locked,
          main: me.main.map(describeSideboardCard),
          mainSize: me.main.length,
          side: me.side.map(describeSideboardCard),
          sideMax: MAX_SIDEBOARD_SIZE,
          sideSize: me.side.length,
          // Origin is encoded in the instance id: side-origin cards now in the
          // main deck are the "ins", main-origin cards now in the sideboard the "outs".
          swaps: {
            ins: me.main.filter((c) => c.id.includes("-side-")).map((c) => c.id),
            outs: me.side.filter((c) => c.id.includes("-main-")).map((c) => c.id),
          },
        }
      : null,
  };
}

/** Send the pregame frame to every connection of ONE seat (swaps are private; the other seat sees no traffic). */
function sendPregameTo(session: GameSession, playerId: string): void {
  for (const [, client] of session.clients) {
    if (client.playerId !== playerId) {continue;}
    try {
      client.ws.send(JSON.stringify({
        match: matchSummary(session),
        moves: buildAvailableMoves(session, client.playerId),
        pregame: buildPregamePayload(session, client.playerId),
        seq: session.seq,
        state: buildGameSnapshot(session, client.playerId),
        type: "sync",
      }));
    } catch { /* Disconnected */ }
  }
}

/**
 * Finalize the pregame phase: place battlefields, transition to playing, channel runes.
 * Called when both players have completed mulligan.
 */
export function finalizePregame(session: GameSession): void {
  const {pregame} = session;
  if (!pregame) {return;}

  const { engine } = session;
  const internal = getInternalSnapshot(engine);
  const [P1, P2] = session.players;

  // For Match mode (Bo3), place battlefields now (Duel already placed them in createGameFromDecks)
  if (pregame.gameMode === "match") {
    const bfIds: string[] = [];
    for (const [pid, defId] of Object.entries(pregame.battlefieldSelections)) {
      const cardId = `${pid}-bf-${defId}`;
      registerCard(internal, cardId, defId, pid, "battlefieldRow");
      // Rule 419.4.a / 383.2.c: register the battlefield card's definition so its
      // triggered/static abilities (Abandoned Hall unl-205 etc.) are visible to
      // the engine's trigger runner.
      const def = registry.get(defId);
      if (def) getGlobalCardRegistry().register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId));
      bfIds.push(cardId);
    }
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: bfIds },
      playerId: P1 as PlayerId,
    });

    // Create per-battlefield zones (dynamic zones for unit placement)
    for (const bfCardId of bfIds) {
      internal.zones[`battlefield-${bfCardId}`] = { cardIds: [], config: { faceDown: false, id: `battlefield-${bfCardId}`, name: `Battlefield ${bfCardId}`, ordered: false, visibility: "public" } };
      // Rule 811.1.b: every battlefield has a facedown sub-zone for [Hidden] cards (rule 107.3.a).
      internal.zones[`facedown-${bfCardId}`] = { cardIds: [], config: { faceDown: true, id: `facedown-${bfCardId}`, maxSize: 1, name: `Facedown at ${bfCardId}`, ordered: false, visibility: "private" } };
    }
  }

  // Transition to playing via the engine's transitionToPlay move so the
  // FlowManager leaves the `setup` segment and enters `mainGame`. The flow
  // Then cascades awaken → beginning → channel (2 runes) → draw (1 card) →
  // Main for the first player. Patching state directly here left the
  // FlowManager stuck in `setup`, so every endTurn's flow.endPhase() cycled
  // Inside setupPhase and never ran mainGame.beginning.onBegin (Temporary
  // Sweep, Hold scoring).
  engine.applyPatches([
    { op: "replace", path: ["setup", "firstPlayer"], value: pregame.firstPlayer },
    { op: "replace", path: ["setup", "secondPlayer"], value: pregame.secondPlayer },
  ]);
  engine.executeMove("transitionToPlay", {
    params: {},
    playerId: pregame.firstPlayer as PlayerId,
  });

  session.log.push(
    makeLogEntry("Both mulligans are complete. Starting the game."),
  );
  delete session.pregame;
  session.seq++;
}

/**
 * Broadcast a pregame update to all connected clients.
 */
export function broadcastPregameUpdate(session: GameSession): void {
  const match = matchSummary(session);
  for (const [, client] of session.clients) {
    const snapshot = buildGameSnapshot(session, client.playerId);
    const pregameData = buildPregamePayload(session, client.playerId);
    const moves = buildAvailableMoves(session, client.playerId);
    try {
      client.ws.send(JSON.stringify({
        match,
        moves,
        pregame: pregameData,
        seq: session.seq,
        state: snapshot,
        type: "sync",
      }));
    } catch { /* Disconnected */ }
  }
}

/**
 * Build pregame payload for a specific player.
 */
export function buildPregamePayload(session: GameSession, playerId: string): Record<string, unknown> | null {
  const {pregame} = session;
  if (!pregame) {return null;}

  // Look up battlefield names for the selection UI
  const bfOptions = pregame.battlefieldOptions[playerId] ?? [];
  const bfUsed = pregame.battlefieldExcluded?.[playerId] ?? [];
  const bfDetails = bfOptions.map((defId) => {
    const def = registry.get(defId);
    // rule 486.5 — `used`: played earlier this match, shown but not selectable.
    return { id: defId, name: def?.name ?? defId, rulesText: def?.rulesText ?? "", ...(bfUsed.includes(defId) ? { used: true } : {}) };
  });
  const ini = pregame.initiative;

  const selectedId = pregame.battlefieldSelections[playerId] ?? null;
  // rule 485.5 — Duel: name every player's randomly selected battlefield so the
  // overlay can say "Battlefield selected at random: X" (both are public once placed).
  const randomSelections = pregame.battlefieldRandom
    ? Object.fromEntries(
        Object.entries(pregame.battlefieldSelections).map(([pid, defId]) => [
          pid,
          { id: defId, name: registry.get(defId)?.name ?? defId },
        ]),
      )
    : undefined;
  return {
    battlefieldOptions: bfDetails,
    ...(pregame.battlefieldRandom ? { battlefieldRandom: true, battlefieldRandomSelections: randomSelections } : {}),
    battlefieldSelected: selectedId,
    battlefieldSelectedName: selectedId ? (registry.get(selectedId)?.name ?? selectedId) : null,
    // Unknown (null) while this pregame still has to decide it (phase `initiative`).
    firstPlayer: ini && !ini.decided ? null : pregame.firstPlayer,
    gameMode: pregame.gameMode,
    gameNumber: session.gameNumber ?? 1,
    ...(ini ? { initiative: { ...ini, firstPlayer: ini.decided ? pregame.firstPlayer : null } } : {}),
    mulliganComplete: [...pregame.mulliganComplete],
    phase: pregame.phase,
    sandbox: pregame.sandbox,
    waitingFor: session.players.filter((p) => !pregame.mulliganComplete.has(p)),
    ...(pregame.phase === "sideboard" ? buildSideboardPayload(session, playerId) : {}),
  };
}

export type BattlefieldResult = { ok: true; completed: boolean } | { ok: false; error: string };

/**
 * Record `playerId`'s battlefield for this game (Match, rule 486.5). The pick
 * is final: a second selection from the same seat is refused. When both seats
 * have chosen, the battlefields are public → sideboard (if anyone can) else
 * mulligan. Callers bump `seq` and broadcast.
 */
export function selectBattlefield(session: GameSession, playerId: string, battlefieldId: unknown): BattlefieldResult {
  const pregame = session.pregame;
  if (!pregame || pregame.phase !== "battlefield_select") {
    return { error: "Not choosing battlefields right now", ok: false };
  }
  if (!session.players.includes(playerId)) {
    return { error: "Not a seated player", ok: false };
  }
  if (pregame.battlefieldSelections[playerId]) {
    return { error: "Battlefield already locked in", ok: false };
  }
  const options = pregame.battlefieldOptions[playerId] ?? [];
  if (typeof battlefieldId !== "string" || !options.includes(battlefieldId)) {
    return { error: "Invalid battlefield choice", ok: false };
  }
  if (pregame.battlefieldExcluded?.[playerId]?.includes(battlefieldId)) {
    return { error: "That battlefield was already used this match — choose one of the others (rule 486.5)", ok: false };
  }
  pregame.battlefieldSelections[playerId] = battlefieldId;
  const bfName = registry.get(battlefieldId)?.name ?? battlefieldId;
  session.log.push(makeLogEntry(`${actorName(playerId, session.playerNames)} locked in a battlefield (${bfName}).`, { rewindable: true }));
  const allSelected = session.players.every((p) => pregame.battlefieldSelections[p]);
  if (!allSelected) {
    return { completed: false, ok: true };
  }
  session.log.push(makeLogEntry("Both battlefields are locked."));
  // Battlefields now public → sideboard (if anyone can), else mulligan.
  advancePastReveal(session);
  return { completed: true, ok: true };
}

/** The seat the sandbox bot (Goldfish / Claude) plays, if this is a sandbox game (none in the active Goldfish's hot seat). */
export function botSeat(session: GameSession): string | undefined {
  return session.sandbox && !session.hotSeat ? session.players[1] : undefined;
}

const botPregameInFlight = new WeakSet<GameSession>();

/**
 * Sandbox games: have the bot seat (Goldfish / Claude) answer whatever the
 * pregame currently asks of it — its battlefield in a Match (486.5; Claude is
 * asked with a bounded call, else a seeded pick), and a no-change sideboard
 * lock-in. The mulligan is answered alongside the human's
 * (handlePregameMessage). Idempotent and re-entrant: safe to call after every
 * pregame transition; at most one bot decision is in flight per game.
 */
export async function runBotPregame(session: GameSession, opts: { gameId?: string } = {}): Promise<void> {
  const seat = botSeat(session);
  const pregame = session.pregame;
  if (!seat || !pregame || !pregame.sandbox || botPregameInFlight.has(session)) {
    return;
  }
  if (pregame.phase === "battlefield_select" && !pregame.battlefieldSelections[seat]) {
    const excluded = pregame.battlefieldExcluded?.[seat] ?? [];
    const options = (pregame.battlefieldOptions[seat] ?? []).filter((id) => !excluded.includes(id));
    if (options.length === 0) {
      return;
    }
    botPregameInFlight.add(session);
    let pick: { defId: string; note: string };
    try {
      pick = await chooseBotBattlefield(session, seat, options);
    } catch (error) {
      console.error("[pregame] bot battlefield pick failed:", (error as Error)?.message ?? error);
      pick = { defId: options[0] as string, note: `${actorName(seat, session.playerNames)} picked a battlefield (fallback).` };
    } finally {
      botPregameInFlight.delete(session);
    }
    // The human may have left (session dropped) or the phase moved while the model thought.
    if (session.pregame !== pregame || pregame.phase !== "battlefield_select" || pregame.battlefieldSelections[seat]) {
      return;
    }
    session.log.push(makeLogEntry(pick.note));
    const r = selectBattlefield(session, seat, pick.defId);
    if (r.ok) {
      if (r.completed && opts.gameId) {gameLogger.logStateChange(opts.gameId, "battlefield_select", pregame.phase);}
      session.seq++;
      broadcastPregameUpdate(session);
    }
  }
  // Sideboard: the bot never swaps — lock in as soon as the phase opens.
  if (session.pregame === pregame && pregame.phase === "sideboard" && pregame.sideboard?.[seat] && !pregame.sideboard[seat].locked) {
    const r = lockSideboard(session, seat);
    if (r.ok) {
      session.seq++;
      broadcastPregameUpdate(session);
    }
  }
  // First player: when the bot is the chooser (won the roll / lost the previous game) it elects to go first (rule 115).
  if (session.pregame === pregame && pregame.phase === "initiative" && pregame.initiative && !pregame.initiative.decided && pregame.initiative.chooser === seat) {
    const how = pregame.initiative.kind === "roll" ? "won the roll" : `lost game ${pregame.initiative.afterGame ?? ""}`.trim();
    session.log.push(makeLogEntry(`${actorName(seat, session.playerNames)} ${how} and chooses to go first.`));
    const r = chooseFirstPlayer(session, seat, seat);
    if (r.ok) {
      if (opts.gameId) {gameLogger.logStateChange(opts.gameId, "initiative", pregame.phase);}
      session.seq++;
      broadcastPregameUpdate(session);
    }
  }
}

/**
 * A seat left before the game started: the match is abandoned for both seats.
 * Everyone connected gets `game_ended`, sockets are closed, the session is
 * dropped and the lobby that spawned it (if any) is freed.
 */
export function abandonPregame(session: GameSession, gameId: string, playerId: string): void {
  const who = actorName(playerId, session.playerNames);
  session.log.push(makeLogEntry(`${who} left before the game started — match abandoned.`));
  gameLogger.logPlayerDisconnected(gameId, playerId, "", "voluntary_leave_pregame");
  gameLogger.logStateChange(gameId, "pregame", "abandoned");
  const reason = playerId === session.players[0] ? "host_left" : "opponent_left";
  broadcast(session, { playerId, pregame: true, reason, type: "game_ended" });
  for (const [, client] of session.clients) {
    try { client.ws.close(1000, "Match abandoned"); } catch { /* */ }
  }
  session.clients.clear();
  delete session.pregame;
  gameSessions.delete(gameId);
  for (const [id, lobby] of lobbies) {
    if (lobby.gameId !== gameId) {continue;}
    for (const sock of [lobby.host.ws, lobby.guest?.ws]) {
      try { sock?.send(JSON.stringify({ reason, type: "lobby_closed" })); } catch { /* */ }
    }
    lobbyByCode.delete(lobby.code);
    lobbies.delete(id);
  }
}

/**
 * Handle pregame-phase WebSocket messages (battlefield select, mulligan, and
 * the move/resync guard). Returns true if the caller should stop processing
 * this message.
 */
export function handlePregameMessage(
  ws: ServerWebSocket<WsData>,
  msg: Record<string, unknown>,
  session: GameSession,
  gameId: string,
  playerId: string,
): boolean {
  if (!session.pregame) {return false;}

  if (msg.type === "leave_game") {
    // Leaving before the game starts abandons the match for BOTH seats (there
    // is nothing to rejoin): tell everyone, drop the session, free the lobby.
    abandonPregame(session, gameId, playerId);
    return true;
  }

  if (msg.type === "pregame_battlefield_select") {
    // Late / duplicate picks (phase already moved on, seat already locked) get an error frame — never a silent re-choose.
    const result = selectBattlefield(session, playerId, msg.battlefieldId);
    if (!result.ok) {
      ws.send(JSON.stringify({ error: result.error, errorCode: "BATTLEFIELD_SELECT", type: "error" }));
    } else {
      session.seq++;
      broadcastPregameUpdate(session);
      // The bot seat may still owe its pick (or now owes a sideboard lock-in).
      void runBotPregame(session, { gameId });
    }
    return true;
  }

  if (msg.type === "sideboard_swap") {
    const result = swapSideboard(session, playerId, msg.out, msg.in);
    if (!result.ok) {
      ws.send(JSON.stringify({ error: result.error, errorCode: "SIDEBOARD_SWAP", type: "error" }));
    } else {
      session.seq++;
      // Private to the acting seat: the opponent's view (choosing|locked) is unchanged.
      sendPregameTo(session, playerId);
    }
    return true;
  }

  if (msg.type === "sideboard_lock") {
    // Optional batch: `swaps: [{out, in}, …]` is applied atomically first; a
    // bad batch refuses the lock (nothing applied) so the overlay can retry.
    if (msg.swaps !== undefined) {
      const seatLocked = session.pregame.sideboard?.[playerId]?.locked === true;
      const applied = seatLocked ? { ok: true as const } : applySideboardSwaps(session, playerId, msg.swaps);
      if (!applied.ok) {
        ws.send(JSON.stringify({ error: applied.error, errorCode: "SIDEBOARD_LOCK", type: "error" }));
        sendPregameTo(session, playerId);
        return true;
      }
    }
    const result = lockSideboard(session, playerId);
    if (!result.ok) {
      ws.send(JSON.stringify({ error: result.error, errorCode: "SIDEBOARD_LOCK", type: "error" }));
      return true;
    }
    if (result.completed) {gameLogger.logStateChange(gameId, "sideboard", session.pregame.phase);}
    session.seq++;
    broadcastPregameUpdate(session);
    // The bot seat may now owe the first-player choice (games 2–3: it lost the previous game).
    if (result.completed) {void runBotPregame(session, { gameId });}
    return true;
  }

  if (msg.type === "pregame_choose_first") {
    // The chooser (roll winner / previous game's loser) names who goes first:
    // `choice: "self" | "opponent"` relative to the SENDER, or an explicit `firstPlayer` seat id.
    const other = session.players.find((p) => p !== playerId) ?? playerId;
    const first = typeof msg.firstPlayer === "string" ? msg.firstPlayer : msg.choice === "opponent" ? other : playerId;
    const result = chooseFirstPlayer(session, playerId, first);
    if (!result.ok) {
      ws.send(JSON.stringify({ error: result.error, errorCode: "CHOOSE_FIRST", type: "error" }));
      return true;
    }
    gameLogger.logStateChange(gameId, "initiative", "mulligan");
    session.seq++;
    broadcastPregameUpdate(session);
    return true;
  }

  if (msg.type === "pregame_mulligan") {
    if (session.pregame.phase !== "mulligan") {return true;}
    if (session.pregame.mulliganComplete.has(playerId)) {return true;} // Already decided

    const sendBack = (msg.sendBack as string[]) ?? [];
    const actor = actorName(playerId, session.playerNames);
    if (sendBack.length > 0 && sendBack.length <= 2) {
      session.engine.executeMove("mulligan", {
        params: { keepCards: sendBack, playerId },
        playerId: playerId as PlayerId,
      });
      session.log.push(
        makeLogEntry(
          `${actor} finalized mulligan (${sendBack.length} recycled, ${sendBack.length} redrawn).`,
          { rewindable: true },
        ),
      );
    } else {
      session.log.push(
        makeLogEntry(
          `${actor} finalized mulligan (0 recycled, 0 redrawn).`,
          { rewindable: true },
        ),
      );
    }

    session.pregame.mulliganComplete.add(playerId);

    // In sandbox mode, auto-complete the other player's mulligan (keep)
    if (session.pregame.sandbox) {
      const other = session.players.find((p) => p !== playerId);
      if (other && !session.pregame.mulliganComplete.has(other)) {
        session.pregame.mulliganComplete.add(other);
        session.log.push(
          makeLogEntry(
            `${actorName(other, session.playerNames)} finalized mulligan (0 recycled, 0 redrawn).`,
          ),
        );
      }
    }

    // Check if all players have completed mulligan
    const allDone = session.players.every((p) => session.pregame!.mulliganComplete.has(p));
    if (allDone) {
      try {
        finalizePregame(session);
        gameLogger.logStateChange(gameId, "pregame", "playing");
      } catch (error) {
        console.error("[finalizePregame] CRASHED:", error);
        gameLogger.logError(gameId, error, { context: "finalizePregame" });
        // Fallback: just force playing state
        session.engine.applyPatches([
          { op: "replace", path: ["status"], value: "playing" },
          { op: "replace", path: ["turn", "phase"], value: "main" },
          { op: "replace", path: ["turn", "number"], value: 1 },
        ]);
        delete session.pregame;
        session.seq++;
      }
      // Broadcast final game state (no more pregame)
      for (const [, client] of session.clients) {
        const snapshot = buildGameSnapshot(session, client.playerId);
        const clientMoves = buildAvailableMoves(session, client.playerId);
        try {
          client.ws.send(JSON.stringify({
            match: matchSummary(session),
            moves: clientMoves,
            pregame: null,
            seq: session.seq,
            state: snapshot,
            type: "sync",
          }));
        } catch { /* Disconnected */ }
      }
      // The opponent seat may hold the first cursor (it was chosen to go
      // first, or its beginning-step trigger wants an answer).
      if (session.sandbox) {
        runOpponent(session, { gameId, humanSeat: playerId });
      }
    } else {
      session.seq++;
      broadcastPregameUpdate(session);
    }
  }

  // Don't process normal game moves during pregame
  if (msg.type === "move" || msg.type === "resync") {
    if (msg.type === "resync") {
      const snapshot = buildGameSnapshot(session, playerId);
      const moves = buildAvailableMoves(session, playerId);
      ws.send(JSON.stringify({
        match: matchSummary(session),
        moves,
        pregame: buildPregamePayload(session, playerId),
        seq: session.seq,
        state: snapshot,
        type: "sync",
      }));
    }
    return true;
  }

  return false;
}
