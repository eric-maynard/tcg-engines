/**
 * Game snapshot + move enumeration + match-log narration for the UI.
 */

import type { Card } from "@tcg/riftbound-types/cards";
import {
  computePlayResourceCost,
  effectiveVictoryScore,
  getGlobalCardRegistry,
  Harness,
  modeOptionLabel,
} from "@tcg/riftbound";
import type { CostReductionContext, RiftboundCardMeta } from "@tcg/riftbound";
import type { PlayerId } from "@tcg/core";
import { type LogEntry, type LogRevealGate, actorName, makeLogEntry } from "../src/narrator";
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
 * rule 809.1.d / 429.3 — the play-time targets that are LISTED but not payable.
 *
 * A [Deflect]-surcharged candidate the pool cannot cover but a Reaction [Add]
 * still could is a legal choice the player simply cannot afford yet, so it must
 * be shown dimmed with what it needs — hiding it is what made a Deflect body
 * silently vanish from a spell's target glow. These are, by construction, NOT
 * legal moves, so they travel beside `moves` rather than inside it and the
 * client keeps refusing to dispatch them until an Add lands.
 */
/**
 * rule 357.1.a / 429.3 — the hand cards this seat could pay for after ONE
 * Reaction [Add] but cannot pay for right now.
 *
 * The play enumerators credit what an Add could still put in the pool, so these
 * are offered by the enumerator and refused by the move's own `condition`
 * (paying is manual — nothing is auto-tapped). Shipping them is what stops the
 * hand looking inert: the client dims the card and quotes the tap/recycle that
 * unlocks it, instead of the player having to know to tap first.
 */
export function buildReachablePlays(session: GameSession, playerId: string) {
  return Harness.reachablePlaysOf(session.engine, playerId).map((r) => ({
    cardId: r.card,
    moveId: r.moveId,
    needsAdd: r.needsAdd,
  }));
}

/**
 * A refusal must carry its cause.
 *
 * The engine now enumerates a card the STATE forbids as an INVALID move whose
 * `validationError` names the blocking object and its rule (see
 * `game-definition/refusal.ts`). Those rows ride on the snapshot so a click that
 * produces nothing can say WHY — "Lilting Lullaby: you can't play spells this
 * turn (rule 054.1)" — instead of the client guessing from the turn state, which
 * could only ever describe timing and never named the card that did it.
 *
 * By construction these are NOT legal moves: they travel beside `moves` and the
 * client keeps refusing to dispatch them.
 */
export function buildBlockedPlays(session: GameSession, playerId: string) {
  const out: {
    cardId: string;
    moveId: string;
    code: string;
    rule: string;
    reason: string;
    objectId?: string;
    objectName?: string;
  }[] = [];
  const seen = new Set<string>();
  for (const m of session.engine.enumerateMoves(playerId as PlayerId, { validOnly: false })) {
    if (m.isValid) {
      continue;
    }
    // A refused MOVE names its subjects in `unitIds`, not `cardId`, so keying
    // strictly on `cardId` made it structurally impossible for any movement
    // refusal to reach the client — a board unit's illegal drag was swallowed
    // in silence. Blame the unit the refusal is about when the engine named
    // one, so a multi-unit move reports the member that actually refused.
    const params = m.params as { cardId?: unknown; unitIds?: unknown };
    const refusal = Harness.refusalOf(m.validationError);
    if (!refusal) {
      continue;
    }
    const unitIds = Array.isArray(params.unitIds)
      ? params.unitIds.filter((u): u is string => typeof u === "string")
      : [];
    const cardId =
      typeof params.cardId === "string"
        ? params.cardId
        : refusal.objectId && unitIds.includes(refusal.objectId)
          ? refusal.objectId
          : unitIds[0];
    if (typeof cardId !== "string") {
      continue;
    }
    const key = `${m.moveId}|${cardId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      cardId,
      code: refusal.code,
      moveId: m.moveId,
      ...(refusal.objectId ? { objectId: refusal.objectId } : {}),
      ...(refusal.objectName ? { objectName: refusal.objectName } : {}),
      reason: refusal.message,
      rule: refusal.rule,
    });
  }
  return out;
}

export function buildUnaffordableTargets(session: GameSession, playerId: string) {
  const cardIds = new Set<string>();
  for (const m of session.engine.enumerateMoves(playerId as PlayerId, { validOnly: false })) {
    if (m.moveId === "playSpell" && typeof (m.params as { cardId?: unknown }).cardId === "string") {
      cardIds.add((m.params as { cardId: string }).cardId);
    }
  }
  const out: {
    cardId: string;
    targets: string[];
    surcharge: number;
    needsAdd?: { energy?: number; power?: Record<string, number>; reason: string };
  }[] = [];
  for (const cardId of cardIds) {
    for (const t of Harness.surchargedPlayTargetsOf(session.engine, playerId, "playSpell", cardId)) {
      if (t.unaffordable) {
        out.push({
          cardId,
          ...(t.needsAdd ? { needsAdd: t.needsAdd as { energy?: number; power?: Record<string, number>; reason: string } } : {}),
          surcharge: t.surcharge,
          targets: [...t.targets],
        });
      }
    }
  }
  return out;
}

/**
 * rule 302.2 — a keyword is printed on the card and is part of what the player
 * must be able to read off the object (Deflect taxes the OPPONENT, so hiding it
 * charges them for something the board never showed). Definitions declare
 * keywords either on the flat `keywords` array or as
 * `abilities: [{type:"keyword", keyword:X}]` — mirror `CardDefinitionRegistry.
 * hasKeyword`'s two printed sources so tokens (whose only surface is the
 * fallback face) read the same as real cards.
 */
function printedKeywords(def: unknown): string[] | undefined {
  const d = def as
    | { abilities?: { keyword?: string; type?: string }[]; keywords?: string[] }
    | undefined;
  if (!d) {
    return undefined;
  }
  const out: string[] = [];
  for (const k of d.keywords ?? []) {
    if (typeof k === "string" && !out.includes(k)) {
      out.push(k);
    }
  }
  for (const a of d.abilities ?? []) {
    if (a?.type === "keyword" && typeof a.keyword === "string" && !out.includes(a.keyword)) {
      out.push(a.keyword);
    }
  }
  return out.length > 0 ? out : undefined;
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
 * rule 128.4 / 424.1 — a `reveal-and-pick` parked by a LOOK is private: the
 * cards were not revealed, so only the prompter may receive their ids (an
 * instance id embeds the definition id). Every other viewer gets the count.
 */
function redactPrivateChoice(pending: unknown, viewer: string | undefined): unknown {
  const pc = pending as
    | { private?: boolean; prompter?: string; revealed?: unknown[] }
    | undefined;
  if (!pc?.private || !viewer || viewer === pc.prompter) {
    return pending;
  }
  return {
    ...pc,
    revealed: [],
    revealedCount: Array.isArray(pc.revealed) ? pc.revealed.length : 0,
  };
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
  /**
   * The seat this line is being rendered for (rule 128.3). A pick taken out of
   * a PRIVATE look is named only to the seat that looked; every other viewer —
   * including the seatless spectator view — reads the count. Absent = not the
   * chooser, i.e. the redacted rendering.
   */
  viewer?: string,
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
    // Callers hand us either the bare battlefield instance id
    // (`player-1-bf-ogn-277-298`, from standardMove.destination) or the ZONE id
    // for that battlefield (`battlefield-player-1-bf-…`, from playUnit.location).
    // Strip the zone prefix first or the instance-id regex below never matches
    // and the raw zone id leaks into the game log.
    const defId = id.replace(/^battlefield-/, "").replace(/^player-[12]-bf-/, "");
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
        // rule 128.4 — the pick came out of a PRIVATE look (nothing was
        // revealed, 424.1), so the shared log must not name it: the opponent
        // would learn a card that only the looker is allowed to know. The
        // looker's OWN frame still names it — the look happened, and a player
        // may re-read what they were shown.
        if (params.privateChoice === true && viewer !== playerId) {
          return picked.length === 1
            ? `${actor} chose a card.`
            : `${actor} chose ${picked.length} cards.`;
        }
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
/** Where a public reveal was first observed in the replay history. */
interface RevealAnchor {
  index: number;
  timestampMs: number;
}

/** Per-session reveal anchors; keyed weakly so finished games are collectable. */
const revealAnchors = new WeakMap<GameSession, Map<string, RevealAnchor>>();

export function anchorKeyAfterLastMove(session: GameSession, suffix = ""): string {
  let index = -1;
  let serial: number | undefined;
  try {
    const history = session.engine.getReplayHistory();
    index = history.length - 1;
    // The entry's serial pins the line to THAT move: after a rewind a different
    // move can occupy the same index, and the line must not migrate onto it.
    serial = history[index]?.serial;
  } catch { /* History not available */ }
  return `after-replay-${index}${serial !== undefined ? `~${serial}` : ""}${suffix ? `-${suffix}` : ""}`;
}

/**
 * Has a {@link LogRevealGate} opened? A gated line is seat-scoped until then
 * and public afterwards, so the answer is recomputed on every snapshot build
 * rather than frozen into the entry when it was written.
 */
function logGateOpen(session: GameSession, gate: LogRevealGate): boolean {
  switch (gate) {
    case "battlefields-locked": {
      // rule 486.5 — the picks are simultaneous: nothing is published until
      // every seat has locked one in. Past the pregame they are on the board.
      const { pregame } = session;
      if (!pregame) {return true;}
      return session.players.every((p) => Boolean(pregame.battlefieldSelections[p]));
    }
    default: {
      return false;
    }
  }
}

/**
 * rule 128.3 — redact ONE shared-log entry for one viewer.
 *
 * `session.log` is a single stream rendered into every seat's snapshot, so an
 * entry that names something only one seat may know carries a
 * {@link LogVisibility}; this is where it is enforced, exactly as
 * `buildGameSnapshot` enforces per-seat zone redaction. Returns the entry as
 * that viewer may read it, or `undefined` when they may not read it at all.
 */
export function visibleLogEntry(
  session: GameSession,
  entry: LogEntry,
  viewer: string | undefined,
): LogEntry | undefined {
  const rule = entry.visibility;
  if (!rule) {return entry;}
  if (viewer !== undefined && rule.seats.includes(viewer)) {return entry;}
  if (rule.until && logGateOpen(session, rule.until)) {return entry;}
  if (rule.publicText === undefined) {return undefined;}
  return { ...entry, text: rule.publicText, visibility: undefined };
}

export function buildHistoryLog(session: GameSession, viewer?: string): LogEntry[] {
  const anchored = new Map<number, LogEntry[]>();
  const entries: LogEntry[] = []; // Manual entries (setup messages) first
  let history: ReturnType<GameSession["engine"]["getReplayHistory"]> = [];
  try {
    history = session.engine.getReplayHistory();
  } catch { /* History not available */ }
  for (const raw of session.log) {
    // rule 128.3 — the shared stream is redacted per viewer before anything
    // else looks at it, so no later branch can re-admit a withheld line.
    const entry = visibleLogEntry(session, raw, viewer);
    if (!entry) {continue;}
    const m = entry.key?.match(/^after-replay-(-?\d+)(?:~(\d+))?/);
    if (!m) {
      entries.push(entry);
      continue;
    }
    const idx = Number(m[1]);
    if (idx < 0) {
      entries.push(entry);
      continue;
    }
    // Rewind consistency: a line anchored to a move that is no longer applied
    // (rewound, or its slot re-used by a different move) is not shown.
    if (m[2] !== undefined && history[idx]?.serial !== Number(m[2])) {
      continue;
    }
    const list = anchored.get(idx) ?? [];
    list.push(entry);
    anchored.set(idx, list);
  }
  // rule 424.1 — a reveal presents the card to ALL players. Reveals that park
  // no prompt (Diana, Lunari) are invisible in the move-derived narration
  // below, so name them from the engine's shared reveal record. The record
  // carries no replay index, so anchor each reveal to the move that was last
  // recorded when we first saw it and keep that anchor (and its timestamp) for
  // every later rebuild — otherwise reveals pile up at the tail of the log
  // with a fresh clock reading each time.
  try {
    const state = session.engine.getState() as unknown as {
      publicReveals?: { playerId: string; cardIds: readonly string[]; turn?: number }[];
    };
    const anchors = revealAnchors.get(session) ?? new Map<string, RevealAnchor>();
    revealAnchors.set(session, anchors);
    const seen = new Map<string, number>();
    const lastIndex = history.length - 1;
    (state.publicReveals ?? []).forEach((rev, index) => {
      const names = rev.cardIds.map((id) => {
        const defId = String(id).replace(/^player-[12]-(?:main|rune)-\d+-/, "");
        return registry.get(defId)?.name ?? defId;
      });
      if (names.length === 0) {return;}
      // Content-keyed so the anchor survives the record's 20-entry trim (which
      // shifts every index) — the ordinal disambiguates identical reveals.
      const base = `${rev.turn ?? 0}|${rev.playerId}|${rev.cardIds.join(",")}`;
      const ordinal = seen.get(base) ?? 0;
      seen.set(base, ordinal + 1);
      const key = `${base}|${ordinal}`;
      let anchor = anchors.get(key);
      // A rewind shortens the history: re-anchor anything now past its end.
      if (!anchor || anchor.index > lastIndex) {
        anchor = {
          index: lastIndex,
          timestampMs: history[lastIndex]?.timestamp ?? Date.now(),
        };
        anchors.set(key, anchor);
      }
      const entry = makeLogEntry(
        `${actorName(rev.playerId, session.playerNames)} revealed ${names.join(", ")}.`,
        { key: `reveal-${index}`, timestampMs: anchor.timestampMs },
      );
      if (anchor.index < 0) {
        entries.push(entry);
        return;
      }
      const list = anchored.get(anchor.index) ?? [];
      list.push(entry);
      anchored.set(anchor.index, list);
    });
  } catch { /* Reveal record not available */ }
  {
    history.forEach((entry, index) => {
      const params = (entry.context?.params as Record<string, unknown>) ?? {};
      const playerId = (entry.context?.playerId as string) ?? "";
      const text = formatMoveLog(
        entry.moveId,
        playerId,
        params,
        session.playerNames,
        viewer,
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
  }
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
  // rule 723 / 127: a Hidden (facedown) card is private to its owner in EVERY
  // redacted mode (duel and vs-Claude alike) — the opponent's seat receives an
  // opaque stand-in unless an information effect granted that seat a look
  // (state.visibilityGrants, e.g. unl-053-219 "you can look at their facedown
  // cards this turn") or the game has ended (rule 421.4: facedown cards are
  // revealed to all players when the game ends). Deck order is never granted.
  // Goldfish — active (hot seat): the human sees exactly what the seat it is
  // acting as would see — the OTHER seat's hand/decks/facedown cards are redacted.
  const vsAi = session.opponent?.info.kind === "claude";
  const redactFor = (!session.sandbox || vsAi || session.hotSeat) && viewingPlayer ? viewingPlayer : undefined;
  const grantKind = (zoneId: string): "hand" | "facedown" | undefined =>
    zoneId === "hand" ? "hand" : zoneId.startsWith("facedown-") ? "facedown" : undefined;
  const hasGrant = (viewer: string, owner: string, zoneId: string): boolean => {
    const kind = grantKind(zoneId);
    if (!kind) {return false;}
    if (kind === "facedown" && state.status === "finished") {return true;}
    return (state.visibilityGrants ?? []).some(
      (g) => g.viewer === viewer && g.owner === owner && g.zones.includes(kind),
    );
  };
  // rule 128.3 / 108.4.d — deck order is SECRET: no player may look, not even the
  // deck's own owner, so a seat-scoped frame redacts its own Main/Rune Deck too.
  const isSecretZone = (zoneId: string) => zoneId === "mainDeck" || zoneId === "runeDeck" || zoneId === "setAside";
  const isPrivateZone = (zoneId: string) =>
    zoneId === "hand" || isSecretZone(zoneId) || zoneId.startsWith("facedown-");

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
      if (
        redactFor &&
        isPrivateZone(zoneId) &&
        (isSecretZone(zoneId) || (owner !== redactFor && !hasGrant(redactFor, owner, zoneId)))
      ) {
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
        keywords: printedKeywords(def),
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
    // Rewind affordances: the engine's history cursor (applied prefix only —
    // pregame setup moves are refused by server/rewind.ts, not hidden here).
    canRedo: session.engine.canRedo(),
    canUndo: session.engine.canUndo() && (state.status === "playing" || (session.sandbox && state.status === "finished")),
    gameId: state.gameId,
    // Goldfish — active: tells the client to follow the acting seat (banner, seat switch, per-seat view).
    ...(session.hotSeat ? { hotSeat: true } : {}),
    interaction: {
      ...state.interaction,
      // Compute active showdown from stack for client compatibility
      showdown: state.interaction?.showdownStack?.length
        ? state.interaction.showdownStack[state.interaction.showdownStack.length - 1]
        : null,
    },
    // rule 128.3 — the match log is redacted per viewer exactly like the zones
    // above: a line naming something only one seat may know is withheld (or
    // shown in its public wording) for everybody else.
    log: buildHistoryLog(session, viewingPlayer),
    pendingChoice: redactPrivateChoice(enrichPendingChoice(state.pendingChoice), redactFor),
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
    // rule 809.1.d / 429.3 — the viewer's play-time targets that are LISTED but
    // not payable yet. Rides on the snapshot (not on `moves`) precisely because
    // these are NOT legal moves: the client dims them and quotes what they need,
    // and dispatching one stays refused until a Reaction [Add] funds it.
    // rule 357.1.a — cards one Add away from playable (see buildReachablePlays).
    reachablePlays:
      viewingPlayer === undefined || state.status !== "playing"
        ? []
        : buildReachablePlays(session, viewingPlayer),
    unaffordableTargets:
      viewingPlayer === undefined || state.status !== "playing"
        ? []
        : buildUnaffordableTargets(session, viewingPlayer),
    // A refusal must carry its cause: cards the state forbids, each with the
    // object and rule that forbid them (see buildBlockedPlays).
    blockedPlays:
      viewingPlayer === undefined || state.status !== "playing"
        ? []
        : buildBlockedPlays(session, viewingPlayer),
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
