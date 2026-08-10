/**
 * Arriving at a battlefield — the ONE place that applies Contested and stages /
 * begins Showdowns and Combats, whatever made the unit present there
 * (rules 190.3.a, 323.8–323.13, 344, 345, 464.2).
 *
 *  - `noteArrival` — staging. Every path that makes a unit present at a
 *    battlefield calls it: Standard / Ganking Moves, plays to a battlefield,
 *    token creation, effect-driven moves, control changes. It applies Contested
 *    (190.3.a.1, attributed to the unit's CONTROLLER — rule 450), remembers whose
 *    action staged it (323.13), and lets a newcomer JOIN a Showdown already in
 *    progress there (344.1 upgrade to a Combat Showdown / 464.2.c.3.a). It never
 *    begins a showdown on its own: that is the Cleanup's step (323.12 / 323.13),
 *    so an arrival part-way through a resolution or with a Chain open waits.
 *  - `beginShowdownAt` — opens the staged Showdown / Combat at one battlefield:
 *    Focus to the player who applied Contested (345), and for a Combat the
 *    Attacker / Defender designations plus their "attack" / "defend" events
 *    (464.2). Used by the Cleanup (`beginStagedShowdowns`) and by the turn
 *    player's explicit `startShowdown` step — never inline by an arrival path:
 *    a Standard Move whose mover put its own "When I move" trigger on the
 *    chain is in a Closed State (401.1), so its Combat stays Staged until the
 *    chain empties (323.12 / 323.13 / 344 / 460).
 *  - `beginStagedShowdowns` — the Cleanup step itself (323.11 → 323.12 → 323.13),
 *    run at the end of EVERY move (`moves/index.ts withStagedShowdownOpening`),
 *    after each chain resolution and after each answered prompt.
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { GameEvent } from "../abilities/game-events";
import { fireTriggers, type TriggerRunnerContext } from "../abilities/trigger-runner";
import {
  collapseTriggerBatch,
  createInteractionState,
  getActiveShowdown,
  getTurnState,
  startShowdown as startShowdownState,
} from "../chain";
import type { ShowdownState } from "../chain";
import { getCardEffectiveMight } from "../game-definition/moves/play/cost";
import type { PlayerId, RiftboundCardMeta, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";

const MIGHTY_THRESHOLD = 5;

/** Operation bag every caller (move reducers, effect contexts, cleanup) can supply. */
export interface ArrivalIO {
  readonly draft: RiftboundGameState;
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => unknown;
    updateCardMeta?: (cardId: CoreCardId, meta: never) => void;
  };
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
  };
  readonly counters?: unknown;
  /** Event sink; when absent the full trigger runner is used with this bag. */
  readonly fire?: (event: GameEvent) => void;
}

function emit(io: ArrivalIO, event: GameEvent): void {
  if (io.fire) {
    io.fire(event);
    return;
  }
  fireTriggers(event, io as unknown as TriggerRunnerContext);
}

function controllerOf(io: ArrivalIO, cardId: string): string | undefined {
  return io.cards.getCardController?.(cardId as CoreCardId) ?? io.cards.getCardOwner(cardId as CoreCardId);
}

function metaOf(io: ArrivalIO, cardId: string): Partial<RiftboundCardMeta> | undefined {
  return io.cards.getCardMeta?.(cardId as CoreCardId) as Partial<RiftboundCardMeta> | undefined;
}

function setRole(
  io: ArrivalIO,
  cardId: string,
  role: "attacker" | "defender",
  battlefieldId: string,
): void {
  io.cards.updateCardMeta?.(cardId as CoreCardId, {
    combatRole: role,
    combatRoleAt: battlefieldId,
    // rule 466.7.b / 384.2 — "a combat that I WAS in" is a historical fact:
    // once a unit has held a designation there, moving away (to base, still on
    // the board) does not erase it, so the combat-end trigger still finds it.
    // Cleared when that combat ends.
    wasInCombatAt: battlefieldId,
  } as never);
}

/**
 * rule 464.2.a / 383.4.e (ven-112a-166 Zed, Without a Sound) — a combat designation belongs
 * to the battlefield where it was assigned. A unit relocated away from that battlefield has
 * left the combat, so it stops being an Attacker/Defender the moment it lands elsewhere.
 */
export function clearCombatRoleAfterRelocation(
  io: {
    cards: {
      getCardMeta?: (cardId: CoreCardId) => unknown;
      updateCardMeta?: (cardId: CoreCardId, meta: never) => void;
    };
  },
  cardId: string,
  newZoneId: string,
): void {
  const meta = io.cards.getCardMeta?.(cardId as CoreCardId) as
    | (Partial<RiftboundCardMeta> & { combatRoleAt?: string })
    | undefined;
  if (meta?.combatRole === undefined || meta.combatRole === null) {
    return;
  }
  if (meta.combatRoleAt !== undefined && meta.combatRoleAt === toBattlefieldId(newZoneId)) {
    return;
  }
  io.cards.updateCardMeta?.(cardId as CoreCardId, {
    combatRole: null,
    combatRoleAt: undefined,
  } as never);
}

export function toBattlefieldId(zoneOrBattlefieldId: string): string | undefined {
  if (zoneOrBattlefieldId.startsWith("battlefield-")) {
    return zoneOrBattlefieldId.slice("battlefield-".length);
  }
  if (zoneOrBattlefieldId === "base" || zoneOrBattlefieldId === "" || zoneOrBattlefieldId.startsWith("facedown-")) {
    return undefined;
  }
  return zoneOrBattlefieldId;
}

/**
 * rule 190.3 / 323.6 — presence at a battlefield is a UNIT's business: gear
 * standing loose there, or an Equipment riding along on a unit its controller
 * does not control (718.5.e), is neither a combatant nor a side. Ids with no
 * registered card type (harness inline cards) count as units.
 */
export function isPresenceUnit(cardId: string): boolean {
  const type = getGlobalCardRegistry().getCardType(cardId);
  return type === undefined || type === "unit";
}

/** Units at the battlefield (gear standing loose there is not a combatant). */
function unitsAt(io: ArrivalIO, battlefieldId: string): string[] {
  return (io.zones.getCardsInZone(`battlefield-${battlefieldId}` as CoreZoneId) as readonly string[]).filter(
    (id) => isPresenceUnit(id as string),
  ) as string[];
}

/**
 * rule 190.3.a.1 / 450 — pure data: `controller`'s unit is now present at a
 * battlefield that player does not control. Applies Contested (once) and
 * records whose action staged it. Returns whether the battlefield is one the
 * arriving player does not control (i.e. something is staged there).
 */
export function stageContested(
  draft: RiftboundGameState,
  battlefieldId: string,
  controller: string,
  stagedBy?: string,
  discretionary?: boolean,
): boolean {
  const bf = draft.battlefields?.[battlefieldId];
  if (!bf || bf.controller === controller) {
    return false;
  }
  if (!bf.contested) {
    bf.contested = true;
    bf.contestedBy = controller as PlayerId;
    bf.showdownComplete = false;
    bf.stagedByAction = undefined;
  }
  bf.stagedBy = (stagedBy ?? controller) as PlayerId;
  if (discretionary) {
    bf.stagedByAction = true;
  }
  return true;
}

export interface ArrivalArgs {
  /** Zone id (`battlefield-<id>`) or bare battlefield id; anything else is ignored. */
  readonly at: string;
  readonly unitIds: readonly string[];
  /** rule 323.13 — the player whose action caused the arrival (effect controller / mover). */
  readonly stagedBy?: string;
  /**
   * rule 190.3.a ("otherwise becomes present") — a control change makes the
   * unit present for its NEW controller without moving, so it contests exactly
   * like a Move does. Contested is applied whether or not anyone else is there:
   * unopposed it is a Non-Combat Showdown that the Cleanup opens (344.2 /
   * 323.12) with Focus to the contester (345), and only its close establishes
   * control / Conquers (348.2.a). Control is never established inline.
   */
  readonly cause?: "move" | "play" | "control-change";
  /**
   * The arrival IS the player's Discretionary Action (Standard / Ganking Move,
   * playing the card there) rather than an effect's resolution. The Cleanup
   * still begins its Showdown (possibly a later Cleanup, once the mover's own
   * triggers have resolved), but not as an `autoBegun` one (344.2): drivers
   * pass Focus through it exactly as if it had begun inline.
   */
  readonly discretionary?: boolean;
}

/**
 * A unit (or group) became present at a battlefield: stage Contested and, if a
 * Showdown is already in progress there, join it. Beginning a staged Showdown /
 * Combat is left to the Cleanup (`beginStagedShowdowns`).
 */
export function noteArrival(io: ArrivalIO, args: ArrivalArgs): { battlefieldId?: string; staged: boolean } {
  const battlefieldId = toBattlefieldId(args.at);
  const draft = io.draft;
  const bf = battlefieldId === undefined ? undefined : draft.battlefields?.[battlefieldId];
  if (!bf || battlefieldId === undefined) {
    return { staged: false };
  }
  let staged = false;
  for (const unitId of args.unitIds) {
    const controller = controllerOf(io, unitId) ?? args.stagedBy;
    if (controller === undefined) {
      continue;
    }
    if (stageContested(draft, battlefieldId, controller, args.stagedBy, args.discretionary)) {
      staged = true;
    }
  }
  const interaction = draft.interaction ?? createInteractionState();
  const ongoing = interaction.showdownStack.find((sd) => sd.active && sd.battlefieldId === battlefieldId);
  if (ongoing) {
    joinOngoingShowdown(io, battlefieldId, ongoing);
  }
  return { battlefieldId, staged };
}

/**
 * rule 344.1 / 464.2.c.3.a / 323.2 — a unit became present where a Showdown is
 * already in progress. Opposing units at a Non-Combat Showdown turn it into a
 * Combat Showdown (the player who applied Contested attacks and regains Focus);
 * newcomers to a Combat gain their controller's designation. Either way the
 * units that GAIN a designation attack / defend now (383.4.e).
 */
function joinOngoingShowdown(io: ArrivalIO, battlefieldId: string, showdown: ShowdownState): void {
  const draft = io.draft;
  const bf = draft.battlefields[battlefieldId];
  if (!bf) {
    return;
  }
  const occupants = unitsAt(io, battlefieldId);
  const attacker = (bf.contestedBy ?? showdown.attackingPlayer ?? showdown.focusPlayer) as string;
  const attackers = occupants.filter((id) => controllerOf(io, id) === attacker);
  const defenders = occupants.filter((id) => {
    const c = controllerOf(io, id);
    return c !== undefined && c !== attacker;
  });
  if (attackers.length === 0 || defenders.length === 0) {
    return;
  }
  const defender =
    bf.controller && bf.controller !== attacker ? bf.controller : (controllerOf(io, defenders[0] as string) as string);
  const upgraded = !showdown.isCombatShowdown;
  const interaction = draft.interaction ?? createInteractionState();
  draft.interaction = {
    ...interaction,
    showdownStack: interaction.showdownStack.map((sd) =>
      sd === showdown || (sd.active && sd.battlefieldId === battlefieldId)
        ? {
            ...sd,
            attackingPlayer: attacker,
            defendingPlayer: defender,
            isCombatShowdown: true,
            relevantPlayers: [...new Set([attacker, defender])],
            ...(upgraded ? { focusPlayer: attacker, passedPlayers: [] } : {}),
          }
        : sd,
    ),
  };
  bf.showdownComplete = false;
  // rule 383.4.f.2.a — Defend Triggers are checked ONCE per combat, when the
  // PLAYER gains the Defender designation. A player already defending this
  // combat does not defend again because a later unit of theirs arrives — even
  // if every unit they had there has since left the battlefield.
  const priorDefender =
    !upgraded && showdown.defendingPlayer !== undefined ? [showdown.defendingPlayer as string] : [];
  assignCombatRoles(io, battlefieldId, attacker, attackers, defenders, priorDefender);
}

/**
 * rule 464.2.a–c / 383.4.e / 383.4.f.2.a — stamp Attacker / Defender on every
 * unit that does not already carry its controller's designation and fire its
 * "attack" / "defend" event (a player who already defends does not "defend"
 * again when another of their units joins: those events carry a non-zero
 * `batchIndex`). rule 709/710: a combat-only keyword can make the unit Mighty
 * the moment its role is stamped.
 */
function assignCombatRoles(
  io: ArrivalIO,
  battlefieldId: string,
  attacker: string,
  attackers: readonly string[],
  defenders: readonly string[],
  /** rule 383.4.f.2.a — players who already hold the Defender designation in this combat. */
  alreadyDefendingPlayers: readonly string[] = [],
): void {
  const occupants = [...attackers, ...defenders];
  // rule 464.2.c.3 / 383.3.d — all designations of one combat happen at once, so
  // the abilities they trigger are simultaneous even though each unit publishes
  // its own "attack" / "defend" event.
  const chainLenBefore = io.draft.interaction?.chain?.items.length ?? 0;
  // rule 464.2.a / 383.4.e — a designation belongs to ONE Combat: a unit
  // dragged out of an ongoing combat into a queued one at another battlefield
  // is designated afresh there, so its stale role must not suppress the new
  // "attack" / "defend" event.
  const roleOf = (id: string): string | null | undefined => {
    const meta = metaOf(io, id) as (Partial<RiftboundCardMeta> & { combatRoleAt?: string }) | undefined;
    return meta?.combatRoleAt !== undefined && meta.combatRoleAt !== battlefieldId
      ? undefined
      : meta?.combatRole;
  };
  const getMeta = (id: CoreCardId) => metaOf(io, id as string);
  // rule 383.4.e — designation triggers are checked only the FIRST time a unit
  // gains the designation in a Combat. A unit that was pulled out of this
  // combat and comes back (Ride the Wind, then a Tideturner swap) is designated
  // again, but does not "attack" / "defend" a second time.
  const alreadyDesignated = new Set(
    io.draft.interaction?.showdownStack.find((sd) => sd.active && sd.battlefieldId === battlefieldId)
      ?.designatedCardIds ?? [],
  );
  const newlyDesignated: string[] = [];
  const stamp = (id: string, role: "attacker" | "defender", owner: string): boolean => {
    if (roleOf(id) === role) {
      return false;
    }
    const before = getCardEffectiveMight(id, getMeta);
    setRole(io, id, role, battlefieldId);
    if (before < MIGHTY_THRESHOLD && getCardEffectiveMight(id, getMeta) >= MIGHTY_THRESHOLD) {
      emit(io, { cardId: id, owner, type: "become-mighty" } as GameEvent);
    }
    return true;
  };
  const priorDefendingPlayers = new Set([
    ...alreadyDefendingPlayers,
    ...defenders.filter((id) => roleOf(id) === "defender").map((id) => controllerOf(io, id) as string),
  ]);
  for (const id of attackers) {
    if (!stamp(id, "attacker", attacker)) {
      continue;
    }
    newlyDesignated.push(id);
    if (alreadyDesignated.has(id)) {
      continue;
    }
    emit(io, {
      alone: !occupants.some((o) => o !== id && controllerOf(io, o) === attacker),
      battlefieldId,
      cardId: id,
      owner: attacker,
      type: "attack",
    } as GameEvent);
  }
  const defendCount = new Map<string, number>();
  for (const id of defenders) {
    const owner = controllerOf(io, id) as string;
    if (!stamp(id, "defender", owner)) {
      continue;
    }
    newlyDesignated.push(id);
    if (alreadyDesignated.has(id)) {
      continue;
    }
    const seen = defendCount.get(owner) ?? 0;
    defendCount.set(owner, seen + 1);
    emit(io, {
      alone: !occupants.some((o) => o !== id && controllerOf(io, o) === owner),
      batchIndex: seen + (priorDefendingPlayers.has(owner) ? 1 : 0),
      battlefieldId,
      cardId: id,
      owner,
      type: "defend",
    } as GameEvent);
  }
  recordDesignations(io, battlefieldId, newlyDesignated);
  collapseTriggerBatch(io.draft.interaction, chainLenBefore);
}

/** rule 383.4.e — remember who has already been designated in this Combat. */
function recordDesignations(io: ArrivalIO, battlefieldId: string, ids: readonly string[]): void {
  const interaction = io.draft.interaction;
  if (!interaction || ids.length === 0) {
    return;
  }
  io.draft.interaction = {
    ...interaction,
    showdownStack: interaction.showdownStack.map((sd) =>
      sd.active && sd.battlefieldId === battlefieldId
        ? { ...sd, designatedCardIds: [...new Set([...(sd.designatedCardIds ?? []), ...ids])] }
        : sd,
    ),
  };
}

export interface BeginOptions {
  /** rule 344.2 — a Cleanup began it (nobody chose it). */
  readonly autoBegun?: boolean;
}

/**
 * rules 344 / 345 / 464.2 — begin the Showdown staged at `battlefieldId`: the
 * player who applied Contested gains Focus; with opposing units present it is a
 * Combat Showdown (Attacker = that player, 464.2.c.1; every other occupant
 * defends, 464.2.c.2). Returns false when nothing is staged there.
 */
export function beginShowdownAt(io: ArrivalIO, battlefieldId: string, opts: BeginOptions = {}): boolean {
  const draft = io.draft;
  const bf = draft.battlefields?.[battlefieldId];
  if (!bf?.contested || bf.showdownComplete === true || !bf.contestedBy) {
    return false;
  }
  const interaction = draft.interaction ?? createInteractionState();
  if (interaction.showdownStack.some((sd) => sd.active && sd.battlefieldId === battlefieldId)) {
    return false;
  }
  const attacker = bf.contestedBy as string;
  const occupants = unitsAt(io, battlefieldId);
  const attackers = occupants.filter((id) => controllerOf(io, id) === attacker);
  const defenders = occupants.filter((id) => {
    const c = controllerOf(io, id);
    return c !== undefined && c !== attacker;
  });
  const isCombat = attackers.length > 0 && defenders.length > 0;
  // rule 190.4.b — the contest does not convert the battlefield: remember who
  // held it as the Showdown opened, so a defender leaving mid-Showdown (and the
  // 323.6 vacancy check that follows) cannot make the conquer that ends this
  // Showdown look like a conquer of an UNCONTROLLED battlefield (sfd-116-221).
  bf.controllerAtShowdownStart = bf.controller ?? null;
  bf.stagedByAction = undefined;
  const playerIds = Object.keys(draft.players);
  const defender = isCombat
    ? bf.controller && bf.controller !== attacker
      ? bf.controller
      : (controllerOf(io, defenders[0] as string) as string)
    : (bf.controller ?? playerIds.find((p) => p !== attacker) ?? attacker);
  const started = startShowdownState(
    interaction,
    battlefieldId,
    attacker,
    isCombat ? [...new Set([attacker, defender])] : playerIds,
    isCombat,
    attacker,
    defender,
    // rule 347.2.b — Focus passes in TURN ORDER to every player, not only
    // between the two participants (462): a bystander in a multiplayer game
    // gets Focus in the showdown too, and may act in it, before it closes.
    playerIds,
  );
  draft.interaction = opts.autoBegun
    ? {
        ...started,
        showdownStack: started.showdownStack.map((sd, i) =>
          i === started.showdownStack.length - 1 ? { ...sd, autoBegun: true } : sd,
        ),
      }
    : started;
  // rule 340 / 548.2 — "When a showdown begins here" fires for both kinds.
  emit(io, { battlefieldId, isCombat, playerId: attacker, type: "showdown-begin" } as GameEvent);
  if (isCombat) {
    assignCombatRoles(io, battlefieldId, attacker, attackers, defenders);
    // rule 464.2.b — start-of-combat effects happen once the Combat has opened
    // and roles are set, before the attacker's first Focus action.
    emit(io, {
      attacker,
      battlefieldId,
      defender,
      playerId: attacker,
      type: "combat-start",
    } as GameEvent);
  }
  return true;
}

/**
 * rule 323.11 / 323.8.a / 323.10 — the Cleanup step that releases Contested: a
 * battlefield where the applying player has no unit left (and no Showdown or
 * Combat is ongoing there) stops being Contested, and any staged Showdown /
 * Combat lapses with it. Another player's units still standing where they don't
 * control re-apply it (323.11.a). Unlike the staging steps this has no
 * Open-State condition, so it also runs while a chain is open.
 */
function releaseUncontestedBattlefields(io: ArrivalIO): void {
  const draft = io.draft;
  for (const [battlefieldId, bf] of Object.entries(draft.battlefields ?? {})) {
    // rule 460 — a Combat awaiting its Damage Step is still ongoing.
    if (!bf?.contested || bf.showdownComplete === true || !bf.contestedBy) {
      continue;
    }
    const occupants = unitsAt(io, battlefieldId);
    if (occupants.some((id) => controllerOf(io, id) === bf.contestedBy)) {
      continue;
    }
    bf.contested = false;
    bf.contestedBy = undefined;
    const other = occupants
      .map((id) => controllerOf(io, id))
      .find((c) => c !== undefined && c !== bf.controller);
    if (other === undefined) {
      continue;
    }
    stageContested(draft, battlefieldId, other, bf.stagedBy);
  }
}

/**
 * The Cleanup's showdown steps, run whenever the turn returns to a Neutral Open
 * State with no resolution pending:
 *  - 323.11 — a battlefield whose contesting player has no unit left there (and
 *    no Showdown / Combat ongoing) stops being Contested; another player's units
 *    still standing where they don't control re-apply it (323.11.a);
 *  - 323.12 — a staged Showdown-only battlefield begins first;
 *  - 323.13 — otherwise a staged Combat begins. The step is mandatory whoever
 *    staged it (an off-turn Reaction move stages a Combat that this Cleanup
 *    still begins); the Turn Player only picks WHICH when two or more are
 *    staged (`turnPlayerMustChooseStagedCombat` defers those to their
 *    `startShowdown` step).
 */
export function beginStagedShowdowns(io: ArrivalIO): boolean {
  const draft = io.draft;
  const interaction = draft.interaction ?? createInteractionState();
  if (draft.pendingChoice) {
    return false;
  }
  if (getActiveShowdown(interaction)?.active) {
    return false;
  }
  // rule 323.11 — step 8 carries no Open-State condition, so a battlefield the
  // contesting player has vacated (a Reaction that moved its last unit away
  // mid-chain) stops being Contested in THIS Cleanup, while the chain is still
  // Closed; only the staging steps below wait for a Neutral Open State.
  releaseUncontestedBattlefields(io);
  if (getTurnState(interaction) !== "neutral-open") {
    return false;
  }
  // rule 460 — a Combat is still ongoing until its Combat Damage Step (626) has
  // run: a closed combat showdown leaves the battlefield Contested with
  // `showdownComplete` (exactly `resolveFullCombat`'s legality). No other
  // staged Showdown / Combat may begin while one awaits damage.
  for (const bf of Object.values(draft.battlefields ?? {})) {
    if (bf?.contested === true && bf.showdownComplete === true) {
      return false;
    }
  }
  const staged: {
    attacker: string;
    battlefieldId: string;
    byAction: boolean;
    isCombat: boolean;
    stagedBy?: string;
  }[] = [];
  for (const [battlefieldId, bf] of Object.entries(draft.battlefields ?? {})) {
    if (!bf?.contested || bf.showdownComplete === true || !bf.contestedBy) {
      continue;
    }
    const occupants = unitsAt(io, battlefieldId);
    const attacker = bf.contestedBy as string;
    staged.push({
      attacker,
      battlefieldId,
      byAction: bf.stagedByAction === true,
      isCombat: occupants.some((id) => {
        const c = controllerOf(io, id);
        return c !== undefined && c !== attacker;
      }),
      stagedBy: bf.stagedBy,
    });
  }
  const turnPlayer = draft.turn.activePlayer;
  // rule 323.13 — the Cleanup BEGINS the staged Combat by itself; the Turn
  // Player never gets a discretionary window first. Their own staging is
  // preferred only as a tiebreak; a Combat staged by the opponent off-turn
  // still opens here.
  const next =
    staged.find((s) => !s.isCombat) ??
    staged.find((s) => s.attacker === turnPlayer || s.stagedBy === turnPlayer) ??
    staged.find((s) => s.isCombat);
  if (!next) {
    return false;
  }
  return beginShowdownAt(io, next.battlefieldId, { autoBegun: !next.byAction });
}
