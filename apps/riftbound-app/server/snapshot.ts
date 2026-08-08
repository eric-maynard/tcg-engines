/**
 * Game snapshot + move enumeration + match-log narration for the UI.
 */

import type { Card } from "@tcg/riftbound-types/cards";
import {
  computePlayResourceCost,
  effectiveVictoryScore,
  getGlobalCardRegistry,
  modeOptionLabel,
} from "@tcg/riftbound";
import type { CostReductionContext, RiftboundCardMeta } from "@tcg/riftbound";
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
    .map((m) => ({ moveId: m.moveId, params: m.params as Record<string, unknown>, playerId: m.playerId as string }))
    // rule 355.3 — the engine also plans one playSpell per pre-named mode of a
    // "Choose one —" spell (agents/tests name it up front). The board UI plays
    // the printed variant and answers the engine's labelled mode → target
    // prompts, so the per-mode variants would only crowd the targeting flow.
    .filter((m) => !(m.moveId === "playSpell" && m.params.mode !== undefined));
}

/**
 * rule 355.3 — a "Choose one —" prompt names its modes by their printed
 * bullets (or a rendering of the instruction), never by raw effect ids; a
 * choose-target prompt may carry its own title.
 */
function enrichPendingChoice(pending: unknown): unknown {
  const pc = pending as { type?: string; effect?: { options?: unknown[] } } | undefined;
  if (pc?.type === "choose-mode" && Array.isArray(pc.effect?.options)) {
    return {
      ...pc,
      optionLabels: pc.effect.options.map((_unused, i) => modeOptionLabel(pc.effect, i)),
    };
  }
  return pending;
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
      if (unitName) {
        return `${actor} equipped ${resolveCard(params.cardId)} to ${unitName}.`;
      }
      // rule 821: only Equipment is "equipped" — plain Gear (Petricite
      // Monument) is played to the base like any other card.
      const gearId =
        typeof params.cardId === "string"
          ? params.cardId.replace(/^player-[12]-(?:main|rune)-\d+-/, "")
          : "";
      const isEquipment = registry.get(gearId)?.cardType === "equipment";
      return isEquipment
        ? `${actor} equipped ${resolveCard(params.cardId)}.`
        : `${actor} played ${resolveCard(params.cardId)} to base.`;
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
    // rule 424.1: revealing presents the card to ALL players, so a pick made
    // out of a revealed set has to name the card in the shared log — otherwise
    // the opponent never learns which card was taken.
    case "resolvePendingChoice": {
      const picked: string[] = [];
      if (typeof params.pickedCardId === "string") {
        picked.push(resolveCard(params.pickedCardId));
      }
      if (Array.isArray(params.pickedCardIds)) {
        for (const id of params.pickedCardIds) {
          picked.push(resolveCard(id));
        }
      }
      if (picked.length > 0) {
        return `${actor} chose ${picked.join(", ")}.`;
      }
      if (typeof params.pickedName === "string" && params.pickedName) {
        return `${actor} chose ${params.pickedName}.`;
      }
      if (typeof params.accept === "boolean") {
        return `${actor} ${params.accept ? "accepted" : "declined"} an optional effect.`;
      }
      return `${actor} resolved a choice.`;
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
/**
 * Key for a session.log line that must read right after the move the engine
 * just recorded (the AI seat's "🤖 …" rationale lines): buildHistoryLog
 * splices `after-replay-<i>` entries in behind replay entry i instead of
 * grouping them with the setup lines, and drops them if that move is rewound.
 */
export function anchorKeyAfterLastMove(session: GameSession, suffix = ""): string {
  let index = -1;
  try {
    index = session.engine.getReplayHistory().length - 1;
  } catch { /* History not available */ }
  return `after-replay-${index}${suffix ? `-${suffix}` : ""}`;
}

export function buildHistoryLog(session: GameSession): LogEntry[] {
  const anchored = new Map<number, LogEntry[]>();
  const entries: LogEntry[] = []; // Manual entries (setup messages) first
  for (const entry of session.log) {
    const m = entry.key?.match(/^after-replay-(-?\d+)/);
    if (!m) {
      entries.push(entry);
      continue;
    }
    const idx = Number(m[1]);
    if (idx < 0) {
      entries.push(entry);
      continue;
    }
    const list = anchored.get(idx) ?? [];
    list.push(entry);
    anchored.set(idx, list);
  }
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
      if (text) {
        entries.push(
          makeLogEntry(text, {
            key: `replay-${index}`,
            rewindable: REWINDABLE_MOVE_IDS.has(entry.moveId),
            timestampMs: entry.timestamp,
          }),
        );
      }
      for (const a of anchored.get(index) ?? []) {
        entries.push(a);
      }
    });
  } catch { /* History not available */ }
  // rule 424.1 — a reveal presents the card to ALL players. Reveals that park
  // no prompt (Diana, Lunari) are invisible in the move-derived narration
  // above, so name them from the engine's shared reveal record.
  try {
    const state = session.engine.getState() as unknown as {
      publicReveals?: { playerId: string; cardIds: readonly string[] }[];
    };
    (state.publicReveals ?? []).forEach((rev, index) => {
      const names = rev.cardIds.map((id) => {
        const defId = String(id).replace(/^player-[12]-(?:main|rune)-\d+-/, "");
        return registry.get(defId)?.name ?? defId;
      });
      if (names.length === 0) {return;}
      entries.push(
        makeLogEntry(
          `${actorName(rev.playerId, session.playerNames)} revealed ${names.join(", ")}.`,
          { key: `reveal-${index}` },
        ),
      );
    });
  } catch { /* Reveal record not available */ }
  return entries.slice(-80);
}

/**
 * rule 356.4 (sfd-076-221 Production Surge) — the client must show what the
 * engine will actually charge, not the printed cost. The engine's static cost
 * reduction needs a board view; build a minimal one over the internal snapshot
 * so `buildGameSnapshot` can price the cards in hand.
 */
function buildCostReductionContext(
  internal: ReturnType<typeof getInternalSnapshot>,
  battlefields: unknown,
): CostReductionContext {
  const controllerOf = (id: string) =>
    internal.cards[id]?.controller ?? internal.cards[id]?.owner ?? "";
  return {
    cards: {
      getCardController: (id: string) => controllerOf(id),
      getCardMeta: (id: string) => internal.cardMetas[id],
      getCardOwner: (id: string) => internal.cards[id]?.owner ?? "",
    },
    draft: { battlefields: battlefields ?? {} },
    zones: {
      getCardsInZone: (zoneId: string, playerId?: string) =>
        Object.entries(internal.cards)
          .filter(([id, c]) =>
            c.zone === zoneId && (playerId === undefined || controllerOf(id) === playerId))
          .map(([id]) => id),
    },
  } as unknown as CostReductionContext;
}

/**
 * rule 356 — the engine's own Total Cost for playing `cardId` from hand right
 * now (energy after discounts/increases; power pips as domain names, any-domain
 * and hybrid pips as "rainbow"). Undefined for non-hand cards / lookups that fail.
 */
export function handPlayCost(
  session: GameSession,
  cardId: string,
): { energy: number; power: string[] } | undefined {
  const state = session.engine.getState();
  const internal = getInternalSnapshot(session.engine);
  const inst = internal.cards[cardId];
  if (!inst || inst.zone !== "hand") {return undefined;}
  const def =
    registry.get(inst.definitionId) ??
    (getGlobalCardRegistry().get(inst.definitionId) as Card | undefined) ??
    (getGlobalCardRegistry().get(cardId) as Card | undefined);
  const costCtx = buildCostReductionContext(internal, state.battlefields);
  return computeHandCost(state, internal, costCtx, cardId, inst.controller ?? inst.owner, def?.energyCost);
}

function computeHandCost(
  state: ReturnType<GameSession["engine"]["getState"]>,
  internal: ReturnType<typeof getInternalSnapshot>,
  costCtx: CostReductionContext,
  cardId: string,
  controller: string,
  printed?: number,
): { energy: number; power: string[] } | undefined {
  if (typeof printed !== "number" || !controller) {return undefined;}
  try {
    const cost = computePlayResourceCost(
      state as never,
      controller,
      cardId,
      { board: { cards: costCtx.cards, zones: costCtx.zones } } as never,
      (id: string) => internal.cardMetas[id],
      false,
    );
    const energy = cost.free || cost.ignoreEnergy ? 0 : cost.energy;
    // rule 135.2.e.5 — pips the engine will actually require: named domains,
    // then any-Domain/[rainbow] pips (Empowered surcharges, Deflect, X in
    // Power) and hybrid pips, both shown as [rainbow].
    const power: string[] = [];
    if (!cost.free) {
      for (const [domain, n] of Object.entries(cost.named)) {
        for (let i = 0; i < (n ?? 0); i++) {power.push(domain);}
      }
      for (let i = 0; i < cost.any + (cost.hybrid?.n ?? 0); i++) {power.push("rainbow");}
    }
    return { energy, power };
  } catch {
    return undefined;
  }
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
    effectiveEnergyCost?: number;
    effectivePowerCost?: string[];
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
  // A Claude seat is a real opponent: its hand (and facedown cards) stay
  // private to the human even though the session runs on sandbox plumbing.
  const vsAi = session.opponent?.info.kind === "claude";
  const redactFor = (!session.sandbox || vsAi) && viewingPlayer ? viewingPlayer : undefined;
  const isPrivateZone = (zoneId: string) =>
    zoneId === "hand" || zoneId === "mainDeck" || zoneId === "runeDeck" || (vsAi && zoneId.startsWith("facedown-"));

  const costCtx = buildCostReductionContext(internal, state.battlefields);
  // rule 356 — only hand cards are ever priced by the UI's pay bar, and the
  // quoted price must be the engine's own Total Cost computation: a snapshot
  // that re-derives a subset of the modifications silently disagrees with what
  // legality charges (rule 356.3 enemy cost increases, self conditional
  // "if an enemy unit has died this turn, this costs [2] less", one-shot
  // discounts). `consume: false` keeps one-shot riders unspent.
  const effectiveCostFor = (zoneId: string, cardId: string, controller: string, printed?: number) => {
    if (zoneId !== "hand") {return undefined;}
    return computeHandCost(state, internal, costCtx, cardId, controller, printed);
  };

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
      // rule unl-081-219 / rule 477.1.b.1: a token that "becomes a copy" is
      // registered per INSTANCE id with the copied traits, while the shared
      // `token-def-<slug>` id keeps the literal (0-Might "Reflection") stats.
      // Prefer the by-instance entry so copies render as the copied card.
      const instanceDef = (cardId as string).startsWith("token-")
        ? (getGlobalCardRegistry().get(cardId as string) as Card | undefined)
        : undefined;
      // rule 477.1.b (ven-137-166 Shady Spectacles): a real (non-token) instance
      // that "becomes a copy" is rewritten only in the engine's per-instance
      // registry, so the snapshot must follow the copy source to the copied
      // card's set definition — otherwise the client keeps showing the printed card.
      const copySourceId = getGlobalCardRegistry().copySourceOf(cardId as string);
      const copyDefinitionId = copySourceId
        ? internal.cards[copySourceId]?.definitionId
        : undefined;
      const copyDef = copyDefinitionId
        ? (registry.get(copyDefinitionId) ??
            (getGlobalCardRegistry().get(copySourceId as string) as Card | undefined))
        : undefined;
      const def = cardInstance
        ? (copyDef ??
            instanceDef ??
            registry.get(cardInstance.definitionId) ??
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

      const effectiveCost = effectiveCostFor(
        zoneId,
        cardId,
        cardInstance?.controller ?? owner,
        def?.energyCost,
      );

      return {
        cardType: def?.cardType ?? "unknown",
        controller: cardInstance?.controller ?? "",
        // rule 477.1.b.1: a copy token's own definitionId is the shared
        // `token-def-<slug>` (literal token art/stats) — report the copied
        // card's definition so the client renders the copy, not a blank
        // Reflection.
        definitionId:
          (baseMeta.copyOfCardId
            ? internal.cards[baseMeta.copyOfCardId]?.definitionId
            : undefined) ??
          copyDefinitionId ??
          cardInstance?.definitionId ??
          "",
        domain: def?.domain,
        effectiveEnergyCost: effectiveCost?.energy,
        effectivePowerCost: effectiveCost?.power,
        energyCost: def?.energyCost,
        id: cardId,
        meta: {
          ...baseMeta,
          ...(copySourceId ? { copyOfCardId: copySourceId } : {}),
          equipmentMightBonus,
          exhausted: exhaustedFromFlags,
          stunned: stunnedFromFlags,
        },
        might: def && "might" in def ? (def as Record<string, unknown>).might as number : undefined,
        name: def?.name ?? cardId,
        owner: cardInstance?.owner ?? "",
        powerCost: def && "powerCost" in def ? (def as Record<string, unknown>).powerCost as string[] | undefined : undefined,
        rulesText: def?.rulesText,
      };
    });
  }

  return {
    // Solo opponent descriptor (kind/model/label + live "thinking" flag). The
    // handle's API key is a #private field and toJSON() names only the info.
    ai: session.opponent
      ? { ...session.opponent.info, thinking: session.opponent.thinking }
      : undefined,
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
    pendingChoice: enrichPendingChoice(state.pendingChoice),
    // rule 383.3.d — the soft "order your simultaneous triggers" offer is not a
    // pendingChoice (nothing is blocked); ship it so the client can label the
    // resolvePendingChoice{orderedKeys} variants it enumerates alongside it.
    pendingTriggerOrder: state.pendingChoice ? undefined : state.pendingTriggerOrder,
    playerNames: session.playerNames,
    players: state.players,
    runePools: state.runePools,
    setup: state.setup,
    status: state.status,
    turn: state.turn,
    victoryScore: state.victoryScore,
    // rule 194.3.a — battlefields like Aspirant's Climb raise the threshold
    // without touching victoryScoreModifier, so the raw victoryScore alone is
    // not what the engine wins on. Ship the engine's per-player number.
    victoryScoreEffective: Object.fromEntries(
      Object.keys(state.players ?? {}).map((pid) => [
        pid,
        effectiveVictoryScore(state, pid as PlayerId),
      ]),
    ),
    winner: state.winner,
    zones,
  };
}
