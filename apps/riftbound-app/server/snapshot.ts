/**
 * Game snapshot + move enumeration + match-log narration for the UI.
 */

import type { Card } from "@tcg/riftbound-types/cards";
import { getGlobalCardRegistry } from "@tcg/riftbound";
import type { RiftboundCardMeta } from "@tcg/riftbound";
import type { PlayerId } from "@tcg/core";
import { type LogEntry, actorName, makeLogEntry } from "../src/narrator";
import { registry } from "./cards";
import { type GameSession, getInternalSnapshot } from "./state";

/**
 * Build available moves for a player using the engine's move enumeration system.
 *
 * Each move definition in the riftbound engine has enumerator and condition functions
 * that generate and validate all legal parameter combinations.
 */
export function buildAvailableMoves(session: GameSession, playerId: string) {
  return session.engine
    .enumerateMoves(playerId as PlayerId, { validOnly: true })
    .map((m) => ({ moveId: m.moveId, params: m.params as Record<string, unknown>, playerId: m.playerId as string }));
}

/**
 * Format a move into a Rift Atlas-style narrated log line.
 *
 * The resulting string reads like "Lillia played Swift Scout to base" — the
 * actor label is the player's display name (resolved from `playerNames`),
 * and the rest of the sentence describes the action in plain language.
 *
 * Returns an empty string for noisy system moves (zone shuffles, phase
 * advances, initial draws, etc.) so the match log stays readable.
 */
export function formatMoveLog(
  moveId: string,
  playerId: string,
  params: Record<string, unknown>,
  playerNames: Record<string, string>,
): string {
  const actor = actorName(playerId, playerNames);

  const resolveCard = (id: unknown): string => {
    if (typeof id !== "string") {return String(id ?? "");}
    const defId = id.replace(/^player-[12]-(?:main|rune)-\d+-/, "");
    const def = registry.get(defId);
    return def?.name ?? defId;
  };

  const resolveBattlefield = (id: unknown): string => {
    if (typeof id !== "string") {return String(id ?? "");}
    const defId = id.replace(/^player-[12]-bf-/, "");
    const def = registry.get(defId);
    return def?.name ?? defId;
  };

  switch (moveId) {
    case "playUnit": {
      const location = params.location === "base" || !params.location
        ? "base"
        : resolveBattlefield(params.location);
      return `${actor} played ${resolveCard(params.cardId)} to ${location}.`;
    }
    case "playSpell": {
      return `${actor} cast ${resolveCard(params.cardId)}.`;
    }
    case "playGear": {
      const unitName = params.targetUnitId
        ? resolveCard(params.targetUnitId)
        : undefined;
      return unitName
        ? `${actor} equipped ${resolveCard(params.cardId)} to ${unitName}.`
        : `${actor} equipped ${resolveCard(params.cardId)}.`;
    }
    case "standardMove": {
      const unitNames = Array.isArray(params.unitIds)
        ? params.unitIds.map(resolveCard).join(", ")
        : "units";
      return `${actor} moved ${unitNames} to ${resolveBattlefield(params.destination)}.`;
    }
    case "exhaustRune": {
      return `${actor} exhausted ${resolveCard(params.runeId)}.`;
    }
    case "readyRune": {
      return `${actor} readied ${resolveCard(params.runeId)}.`;
    }
    case "recycleRune": {
      return `${actor} recycled ${resolveCard(params.runeId)} for ${params.domain ?? "power"}.`;
    }
    case "contestBattlefield": {
      return `${actor} contested ${resolveBattlefield(params.battlefieldId)}.`;
    }
    case "conquerBattlefield": {
      return `${actor} conquered ${resolveBattlefield(params.battlefieldId)}.`;
    }
    case "assignAttacker": {
      return `${actor} assigned ${resolveCard(params.unitId)} as attacker.`;
    }
    case "assignDefender": {
      return `${actor} assigned ${resolveCard(params.unitId)} as defender.`;
    }
    case "resolveCombat":
    case "resolveFullCombat": {
      return `Combat resolved at ${resolveBattlefield(params.battlefieldId)}.`;
    }
    case "scorePoint": {
      return `${actor} scored a point (${params.method ?? "conquest"}).`;
    }
    case "endTurn": {
      return `${actor} ended their turn.`;
    }
    case "channelRunes": {
      const count = Number(params.count ?? 2);
      return `${actor} channeled ${count} rune${count === 1 ? "" : "s"} from their rune deck.`;
    }
    case "drawCard": {
      const count = Number(params.count ?? 1);
      return `${actor} drew ${count} card${count === 1 ? "" : "s"}.`;
    }
    case "scryCard":
    case "lookAtTop": {
      const count = Number(params.count ?? 1);
      return `${actor} looked at top ${count} card${count === 1 ? "" : "s"} of their deck.`;
    }
    case "addResources": {
      return `${actor} gained ${params.energy ?? 0} energy.`;
    }
    case "rollForFirst": {
      return `${actor} rolled a d20.`;
    }
    case "chooseFirstPlayer": {
      const chosen = params.firstPlayerId === playerId ? "themself" : "their opponent";
      const chosenName = typeof params.firstPlayerId === "string"
        ? actorName(params.firstPlayerId, playerNames)
        : chosen;
      return `${actor} chose ${chosenName} to take the first turn.`;
    }
    case "transitionToPlay": {
      return "Both mulligans are complete. Starting the game.";
    }
    case "concede": {
      return `${actor} conceded.`;
    }
    case "passChainPriority": {
      return `${actor} passed priority.`;
    }
    case "passShowdownFocus": {
      return `${actor} passed focus${
        params.battlefieldId ? ` at ${resolveBattlefield(params.battlefieldId)}` : ""
      }.`;
    }
    case "resolveChain": {
      return "Chain resolved.";
    }
    case "startShowdown": {
      return `Showdown started at ${resolveBattlefield(params.battlefieldId)}.`;
    }
    case "endShowdown": {
      return `Showdown ended${
        params.battlefieldId ? ` at ${resolveBattlefield(params.battlefieldId)}` : ""
      }.`;
    }
    case "killUnit": {
      return `${resolveCard(params.cardId)} was destroyed.`;
    }
    case "discardCard": {
      return `${actor} discarded ${resolveCard(params.cardId)}.`;
    }
    case "recallUnit": {
      return `${actor} recalled ${resolveCard(params.unitId)}.`;
    }
    case "hideCard": {
      return `${actor} hid a card at ${resolveBattlefield(params.battlefieldId)}.`;
    }
    case "revealHidden": {
      return `${actor} revealed ${resolveCard(params.cardId)}.`;
    }
    case "mulligan": {
      const keep = Array.isArray(params.keepCards) ? params.keepCards.length : 0;
      const redrawn = keep; // Number sent back = number redrawn after mulligan move
      return `${actor} finalized mulligan (${redrawn} recycled, ${redrawn} redrawn).`;
    }
    case "addToken": {
      const tokenName = String(params.tokenName ?? "token");
      const rawCount = Number(params.count ?? 1);
      const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
      const zoneLabel = typeof params.zoneId === "string" && params.zoneId.startsWith("battlefield-")
        ? resolveBattlefield(params.zoneId.replace(/^battlefield-/, ""))
        : (params.zoneId as string) ?? "base";
      if (count === 1) {
        return `${actor} added a ${tokenName} token to ${zoneLabel}.`;
      }
      return `${actor} added ${count} ${tokenName} tokens to ${zoneLabel}.`;
    }
    case "addCounter": {
      const delta = Number(params.delta ?? 0);
      const counterType = String(params.counterType ?? "counter");
      const cardName = resolveCard(params.cardId);
      if (delta >= 0) {
        return `${actor} added +${delta} ${counterType} counter${delta === 1 ? "" : "s"} to ${cardName}.`;
      }
      return `${actor} removed ${-delta} ${counterType} counter${-delta === 1 ? "" : "s"} from ${cardName}.`;
    }
    case "modifyBuff": {
      const m = Number(params.deltaMight ?? 0);
      const t = Number(params.deltaToughness ?? 0);
      const cardName = resolveCard(params.cardId);
      const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
      return `${actor} buffed ${cardName} by ${fmt(m)}/${fmt(t)}.`;
    }
    case "duplicateCard": {
      const cardName = resolveCard(params.cardId);
      const dest = typeof params.destinationZone === "string" && params.destinationZone.startsWith("battlefield-")
        ? resolveBattlefield(params.destinationZone.replace(/^battlefield-/, ""))
        : (params.destinationZone as string) ?? "base";
      return `${actor} duplicated ${cardName} into ${dest}.`;
    }
    case "labelCard": {
      const cardName = resolveCard(params.cardId);
      const label = String(params.label ?? "");
      return `${actor} labeled ${cardName} as "${label}".`;
    }
    case "transferControl": {
      const cardName = resolveCard(params.cardId);
      const newCtrl = typeof params.newControllerId === "string"
        ? actorName(params.newControllerId, playerNames)
        : "another player";
      return `${actor} transferred control of ${cardName} to ${newCtrl}.`;
    }
    case "peekTopN": {
      const count = Number(params.count ?? 1);
      return `${actor} looked at the top ${count} card${count === 1 ? "" : "s"} of their deck.`;
    }
    case "placeCardsOnTopOfDeckInOrder": {
      const count = Array.isArray(params.cardIds) ? params.cardIds.length : 0;
      return `${actor} placed ${count} card${count === 1 ? "" : "s"} on top of their deck.`;
    }
    case "revealTopToOpponent": {
      const count = Number(params.count ?? 1);
      return `${actor} revealed the top ${count} card${count === 1 ? "" : "s"} of their deck to their opponent.`;
    }
    case "recycleMany": {
      const count = Array.isArray(params.cardIds) ? params.cardIds.length : 0;
      return `${actor} recycled ${count} card${count === 1 ? "" : "s"}.`;
    }
    case "sendToHand": {
      return `${actor} moved ${resolveCard(params.cardId)} to hand.`;
    }
    default: {
      // Hide noisy system moves from the log
      const hiddenMoves = new Set([
        "emptyRunePool", "shuffleDecks", "placeBattlefields", "drawInitialHand",
        "placeChampion", "placeLegend", "initializeRuneDeck", "readyAll",
        "advancePhase", "clearDamage",
      ]);
      if (hiddenMoves.has(moveId)) {return "";}
      return `${actor}: ${moveId.replace(/([A-Z])/g, " $1").toLowerCase().trim()}.`;
    }
  }
}

/**
 * Set of move IDs that represent player-driven actions that should be
 * rewindable. System cleanup moves are not included.
 */
export const REWINDABLE_MOVE_IDS = new Set([
  "playUnit", "playSpell", "playGear", "standardMove", "exhaustRune",
  "readyRune", "recycleRune", "contestBattlefield", "conquerBattlefield",
  "assignAttacker", "assignDefender", "scorePoint", "endTurn",
  "channelRunes", "drawCard", "scryCard", "lookAtTop", "rollForFirst",
  "chooseFirstPlayer", "concede", "startShowdown", "endShowdown",
  "discardCard", "recallUnit", "hideCard", "revealHidden", "mulligan",
  // W10 / W12 sandbox + peek moves — all player-driven, rewindable.
  "addToken", "addCounter", "modifyBuff", "duplicateCard", "labelCard",
  "transferControl", "peekTopN", "placeCardsOnTopOfDeckInOrder",
  "revealTopToOpponent", "recycleMany", "sendToHand",
]);

/**
 * Build the game history log from engine replay history + session log.
 *
 * Combines manually-narrated setup entries (stored on the session) with
 * move-derived narration pulled from the engine's replay history. Each
 * replay move is formatted via {@link formatMoveLog} and tagged with the
 * move's real timestamp and rewindability.
 *
 * Returns the last 80 entries (oldest to newest) as {@link LogEntry}
 * objects ready to be sent in the game snapshot.
 */
export function buildHistoryLog(session: GameSession): LogEntry[] {
  const entries: LogEntry[] = [...session.log]; // Keep manual entries (setup messages)
  try {
    const history = session.engine.getReplayHistory();
    history.forEach((entry, index) => {
      const params = (entry.context?.params as Record<string, unknown>) ?? {};
      const playerId = (entry.context?.playerId as string) ?? "";
      const text = formatMoveLog(
        entry.moveId,
        playerId,
        params,
        session.playerNames,
      );
      if (!text) {return;}
      entries.push(
        makeLogEntry(text, {
          key: `replay-${index}`,
          rewindable: REWINDABLE_MOVE_IDS.has(entry.moveId),
          timestampMs: entry.timestamp,
        }),
      );
    });
  } catch { /* History not available */ }
  return entries.slice(-80);
}

/** Build a renderable game snapshot for the UI */
export function buildGameSnapshot(session: GameSession, viewingPlayer?: string) {
  const { engine } = session;
  const state = engine.getState();
  const internal = getInternalSnapshot(engine);

  // Build zone contents with card details
  const zones: Record<string, {
    id: string;
    definitionId: string;
    owner: string;
    controller: string;
    name: string;
    cardType: string;
    energyCost?: number;
    powerCost?: string[];
    might?: number;
    domain?: unknown;
    rulesText?: string;
    meta: RiftboundCardMeta;
  }[]> = {};

  // rule-108.7.c / rule-128.4: hand is Private Information and decks are
  // secret — outside sandbox (goldfish/hotseat) the viewing player must not
  // receive identities of the opponent's cards in these zones. Card instance
  // ids embed the definition id, so the id is replaced with an opaque one too.
  const redactFor = !session.sandbox && viewingPlayer ? viewingPlayer : undefined;
  const isPrivateZone = (zoneId: string) =>
    zoneId === "hand" || zoneId === "mainDeck" || zoneId === "runeDeck";

  for (const [zoneId, zone] of Object.entries(internal.zones)) {
    zones[zoneId] = zone.cardIds.map((cardId, idx) => {
      const cardInstance = internal.cards[cardId];
      const meta = internal.cardMetas[cardId];
      const owner = cardInstance?.owner ?? "";
      if (redactFor && isPrivateZone(zoneId) && owner !== redactFor) {
        return {
          cardType: "unknown",
          controller: cardInstance?.controller ?? "",
          definitionId: "",
          id: `hidden-${zoneId}-${owner}-${idx}`,
          meta: { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false } as RiftboundCardMeta,
          name: "Hidden card",
          owner,
        };
      }
      // rule-sfd-171-221: tokens minted in-game (definitionId `token-def-<slug>`)
      // are only registered in the engine's global registry, not the static set
      // registry — fall back so the snapshot carries name/type/might instead of
      // the raw instance id and cardType 'unknown'.
      const def = cardInstance
        ? (registry.get(cardInstance.definitionId) ??
            (getGlobalCardRegistry().get(cardInstance.definitionId) as Card | undefined))
        : undefined;

      // Read exhausted state from the counter system's __flags (where setFlag stores it)
      // Rather than the initial meta.exhausted field which may be stale
      const counterState = meta as unknown as { __flags?: Record<string, boolean> } | undefined;
      const exhaustedFromFlags = counterState?.__flags?.exhausted ?? false;
      // rule-ogn-220-298: stun effects setFlag("stunned") into __flags, so the
      // top-level meta.stunned stays stale — lift it like exhausted.
      const stunnedFromFlags = counterState?.__flags?.stunned ?? meta?.stunned ?? false;

      const baseMeta = meta ?? { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false };

      // rule-sfd-068-221: engine keeps Equipment might as a separate term summed
      // from meta.equippedWith via the registry; surface it so the UI's effective
      // Might badge includes attached gear.
      let equipmentMightBonus = 0;
      for (const equipId of baseMeta.equippedWith ?? []) {
        equipmentMightBonus += getGlobalCardRegistry().getMightBonus(equipId as string);
      }

      return {
        cardType: def?.cardType ?? "unknown",
        controller: cardInstance?.controller ?? "",
        definitionId: cardInstance?.definitionId ?? "",
        domain: def?.domain,
        energyCost: def?.energyCost,
        id: cardId,
        meta: { ...baseMeta, equipmentMightBonus, exhausted: exhaustedFromFlags, stunned: stunnedFromFlags },
        might: def && "might" in def ? (def as Record<string, unknown>).might as number : undefined,
        name: def?.name ?? cardId,
        owner: cardInstance?.owner ?? "",
        powerCost: def && "powerCost" in def ? (def as Record<string, unknown>).powerCost as string[] | undefined : undefined,
        rulesText: def?.rulesText,
      };
    });
  }

  return {
    battlefields: state.battlefields,
    canUndo: session.engine.getReplayHistory().length > 0,
    gameId: state.gameId,
    interaction: {
      ...state.interaction,
      // Compute active showdown from stack for client compatibility
      showdown: state.interaction?.showdownStack?.length
        ? state.interaction.showdownStack[state.interaction.showdownStack.length - 1]
        : null,
    },
    log: buildHistoryLog(session),
    pendingChoice: state.pendingChoice,
    playerNames: session.playerNames,
    players: state.players,
    runePools: state.runePools,
    setup: state.setup,
    status: state.status,
    turn: state.turn,
    victoryScore: state.victoryScore,
    winner: state.winner,
    zones,
  };
}
