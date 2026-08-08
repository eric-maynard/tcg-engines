/**
 * Game creation from decks and the pregame flow (battlefield select,
 * mulligan, transition to play), including the pregame WebSocket handlers.
 */

import { getGlobalCardRegistry, riftboundDefinition } from "@tcg/riftbound";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "@tcg/riftbound";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import type { ServerWebSocket } from "bun";
import { type LogEntry, actorName, makeLogEntry } from "../src/narrator";
import { runOpponent } from "./ai-opponent";
import { allCards, makeLookupPayload, registerCard, registry } from "./cards";
import { MIN_MAIN_DECK_SIZE, findCopyLimitViolations } from "./decks";
import { gameLogger } from "./log";
import { buildAvailableMoves, buildGameSnapshot } from "./snapshot";
import { type DeckConfig, type GameSession, type PregameState, type WsData, getInternalSnapshot } from "./state";

/** Create a game from two deck configurations */
export function createGameFromDecks(
  deck1: DeckConfig,
  deck2: DeckConfig,
  seed?: string,
  options?: {
    gameMode?: "duel" | "match";
    firstPlayer?: string;
    sandbox?: boolean;
    names?: Record<string, string>;
    /** Initiative roll results for match log narration. */
    initiativeRoll?: { p1Roll: number; p2Roll: number; winner: string };
  },
): GameSession {
  const P1 = "player-1";
  const P2 = "player-2";

  // Rule 103.2.b: a Main Deck can include up to 3 copies of the same named
  // card — refuse to start a game with an illegal deck.
  for (const [pid, deck] of [[P1, deck1], [P2, deck2]] as const) {
    const violations = findCopyLimitViolations(deck.mainDeckCardIds);
    if (violations.length > 0) {
      throw new Error(`Illegal deck for ${pid}: more than 3 copies of ${violations.join(", ")} (rule 103.2.b)`);
    }
    // Rule 103.2 / 103.2.a.1: Main Deck is at least 40 cards; the Chosen
    // Champion counts toward it even though it starts in the Champion Zone.
    const mainDeckSize = deck.mainDeckCardIds.length + (deck.championId ? 1 : 0);
    if (mainDeckSize < MIN_MAIN_DECK_SIZE) {
      throw new Error(`Illegal deck for ${pid}: main deck has ${mainDeckSize} cards, needs at least ${MIN_MAIN_DECK_SIZE} (rule 103.2)`);
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
  const internal = getInternalSnapshot(engine);
  const log: LogEntry[] = [];

  const decks: [string, DeckConfig][] = [[P1, deck1], [P2, deck2]];
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

    // Draw initial hand of 4 (Rule 116)
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });

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

  // In Duel mode, auto-select 1 random battlefield per player and place them now.
  // In Match mode, defer to pregame battlefield selection.
  if (gameMode === "duel") {
    // Fallback: if a deck has no battlefields, pick from the full card pool
    const allBattlefields = allCards.filter((c) => c.cardType === "battlefield").map((c) => c.id);
    const p1Bfs = deck1.battlefieldIds.length > 0 ? deck1.battlefieldIds : allBattlefields;
    const p2Bfs = deck2.battlefieldIds.length > 0 ? deck2.battlefieldIds : allBattlefields;
    const p1Pick = p1Bfs[Math.floor(Math.random() * p1Bfs.length)];
    const p2Pick = p2Bfs[Math.floor(Math.random() * p2Bfs.length)];
    const bfIds: string[] = [];
    if (p1Pick) {
      const cardId = `${P1}-bf-${p1Pick}`;
      registerCard(internal, cardId, p1Pick, P1, "battlefieldRow");
      // Rule 419.4.a / 383.2.c: battlefield-card triggered abilities (e.g. Abandoned
      // Hall unl-205) must be visible to the trigger runner, so register the
      // definition in the engine's global card registry like every other card.
      const def = registry.get(p1Pick);
      if (def) cardReg.register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId));
      bfIds.push(cardId);
    }
    if (p2Pick) {
      const cardId = `${P2}-bf-${p2Pick}`;
      registerCard(internal, cardId, p2Pick, P2, "battlefieldRow");
      const def = registry.get(p2Pick);
      if (def) cardReg.register(cardId, makeLookupPayload(def as unknown as Record<string, unknown>, cardId));
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

  const pregame: PregameState = {
    battlefieldOptions: {
      [P1]: deck1.battlefieldIds,
      [P2]: deck2.battlefieldIds,
    },
    battlefieldSelections: gameMode === "duel" ? {
      [P1]: deck1.battlefieldIds[Math.floor(Math.random() * deck1.battlefieldIds.length)] ?? "",
      [P2]: deck2.battlefieldIds[Math.floor(Math.random() * deck2.battlefieldIds.length)] ?? "",
    } : {},
    firstPlayer,
    gameMode,
    mulliganComplete: new Set(),
    phase: gameMode === "match" ? "battlefield_select" : "mulligan",
    sandbox: isSandbox,
    secondPlayer,
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

  log.push(
    makeLogEntry(
      `Chose ${firstPlayerName} to take the first turn.`,
    ),
  );

  const names = options?.names ?? { [P1]: "Player 1", [P2]: "Player 2" };
  return { clients: new Map(), engine, log, playerNames: names, players: [P1, P2], pregame, sandbox: isSandbox, seq: 0 };
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
  for (const [, client] of session.clients) {
    const snapshot = buildGameSnapshot(session, client.playerId);
    const pregameData = buildPregamePayload(session, client.playerId);
    const moves = buildAvailableMoves(session, client.playerId);
    try {
      client.ws.send(JSON.stringify({
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
  const bfDetails = bfOptions.map((defId) => {
    const def = registry.get(defId);
    return { id: defId, name: def?.name ?? defId, rulesText: def?.rulesText ?? "" };
  });

  return {
    battlefieldOptions: bfDetails,
    battlefieldSelected: pregame.battlefieldSelections[playerId] ?? null,
    firstPlayer: pregame.firstPlayer,
    gameMode: pregame.gameMode,
    mulliganComplete: [...pregame.mulliganComplete],
    phase: pregame.phase,
    sandbox: pregame.sandbox,
    waitingFor: session.players.filter((p) => !pregame.mulliganComplete.has(p)),
  };
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

  if (msg.type === "pregame_battlefield_select" && session.pregame.phase === "battlefield_select") {
    const bfId = msg.battlefieldId as string;
    const options = session.pregame.battlefieldOptions[playerId] ?? [];
    if (!options.includes(bfId)) {
      ws.send(JSON.stringify({ error: "Invalid battlefield choice", type: "error" }));
    } else {
      session.pregame.battlefieldSelections[playerId] = bfId;
      const bfDef = registry.get(bfId);
      const bfName = bfDef?.name ?? bfId;
      session.log.push(
        makeLogEntry(
          `${actorName(playerId, session.playerNames)} locked in a battlefield (${bfName}).`,
          { rewindable: true },
        ),
      );
      // Check if both players have selected
      const allSelected = session.players.every((p) => session.pregame!.battlefieldSelections[p]);
      if (allSelected) {
        session.pregame.phase = "mulligan";
        session.log.push(
          makeLogEntry(
            "Both battlefields are locked. Roll a d20 to decide first player.",
          ),
        );
      }
      session.seq++;
      broadcastPregameUpdate(session);
    }
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
