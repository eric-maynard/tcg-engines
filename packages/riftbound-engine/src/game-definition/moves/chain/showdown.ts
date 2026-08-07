/**
 * Showdown moves: passShowdownFocus / startShowdown / endShowdown (split from chain-moves.ts).
 */

import type {
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import {
  createInteractionState,
  endShowdown as endShowdownState,
  getActiveShowdown,
  getTurnState,
  isShowdownEnded,
  passFocus as passFocusState,
  startShowdown as startShowdownState,
} from "../../../chain";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { cleanupAndFireDeaths } from "../../../cleanup/post-move-cleanup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { hasPlayerWon } from "../../win-conditions/victory";
import {
  applyScoreReplacement,
  finalPointConquerDrawsInstead,
} from "../../../operations/scoring-rules";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/** Minimal operation bag a reducer/cleanup context exposes. */
interface ShowdownStagingContext {
  cards: {
    getCardOwner: (cardId: never) => unknown;
    getCardController?: (cardId: never) => string | undefined;
    updateCardMeta: (cardId: never, meta: Partial<RiftboundCardMeta>) => void;
  };
  counters: unknown;
  zones: { getCardsInZone: (zoneId: never, playerId?: never) => unknown[] };
}

/**
 * rules 319.8 → 323.13 / 320.1 — the Cleanup after a unit arrives at a
 * Contested battlefield initiates its Showdown MANDATORILY; no discretionary
 * action may intervene. A Standard Move opens it inline (standard-move.ts),
 * but an effect-driven arrival (`effects/move.ts markContestedOnArrival`)
 * happens during chain resolution, so its showdown is opened here as soon as
 * the chain empties.
 */
export function openPendingContestedShowdown(
  draft: RiftboundGameState,
  context: ShowdownStagingContext,
): void {
  const interaction = draft.interaction ?? createInteractionState();
  if (getTurnState(interaction) !== "neutral-open") {
    return;
  }
  // rule 320.1 — a resolution still waiting on a choice (e.g. a destination)
  // has not finished; its Cleanup, and any Showdown it stages, comes after.
  if (draft.pendingChoice) {
    return;
  }
  if (getActiveShowdown(interaction)?.active) {
    return;
  }
  const { cards, counters, zones } = context;
  const ownerOf = (id: string): string | undefined =>
    (cards.getCardController?.(id as never) ??
      (cards.getCardOwner(id as never) as string | undefined)) ?? undefined;
  // rule 344.2 — a staged Showdown opens during the next Cleanup no matter who
  // applied Contested; the Turn Player only picks WHICH battlefield when
  // several are staged (323.12 / 323.13), never whether one begins at all.
  const staged = Object.entries(draft.battlefields ?? {})
    .filter(([, bf]) => bf?.contested === true && bf.showdownComplete !== true && bf.contestedBy)
    .map(([battlefieldId, bf]) => {
      const occupants = zones.getCardsInZone(`battlefield-${battlefieldId}` as never) as string[];
      const attacker = bf.contestedBy as string;
      return {
        attacker,
        battlefieldId,
        bf,
        isCombat: occupants.some((id) => ownerOf(id) !== undefined && ownerOf(id) !== attacker),
        occupants,
      };
    });
  // rule 323.12 runs BEFORE 323.13: a showdown-only battlefield begins first,
  // and only once none is staged does a staged Combat begin. A Combat the
  // NON-turn player staged (an off-turn Reaction move) waits for the Turn
  // Player's own step instead — 323.13 makes that choice theirs.
  const pending =
    staged.find((x) => !x.isCombat) ??
    staged.find((x) => x.attacker === draft.turn.activePlayer);
  if (!pending) {
    return;
  }
  const { battlefieldId, bf, attacker, isCombat, occupants } = pending;
  const playerIds = Object.keys(draft.players);
  const defender = bf.controller ?? playerIds.find((p) => p !== attacker) ?? attacker;
  const started = startShowdownState(
    interaction,
    battlefieldId,
    attacker,
    isCombat ? [...new Set([attacker, defender])] : playerIds,
    isCombat,
    attacker,
    defender,
  );
  // rule 344.2 — nobody chose this one; the Cleanup began it.
  draft.interaction = {
    ...started,
    showdownStack: started.showdownStack.map((sd, i) =>
      i === started.showdownStack.length - 1 ? { ...sd, autoBegun: true } : sd,
    ),
  };
  const triggerCtx = { cards, counters, draft, zones } as never;
  fireTriggers({ battlefieldId, isCombat, playerId: attacker, type: "showdown-begin" }, triggerCtx);
  if (!isCombat) {
    return;
  }
  // rule 625.1.c.1 / 625.1.c.2 — opening a Combat Showdown assigns combat
  // roles and fires "attack" / "defend".
  for (const id of occupants) {
    const owner = ownerOf(id);
    if (owner === undefined) {
      continue;
    }
    const role = owner === attacker ? "attacker" : "defender";
    cards.updateCardMeta(id as never, { combatRole: role } as Partial<RiftboundCardMeta>);
    fireTriggers(
      {
        alone: occupants.filter((o) => ownerOf(o) === owner).length === 1,
        battlefieldId,
        cardId: id,
        owner,
        type: role === "attacker" ? "attack" : "defend",
      },
      triggerCtx,
    );
  }
}

/**
 * Pass focus during a showdown (rule 553.4)
 *
 * The focus player passes. If all relevant players pass,
 * the showdown ends.
 */
export const passShowdownFocus: Defs["passShowdownFocus"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    const interaction = state.interaction ?? createInteractionState();
    // Rule 509.1: focus cannot pass while a chain is active on top of the
    // showdown — the chain must fully resolve first.
    if (interaction.chain?.active) {
      return false;
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (!activeShowdown?.active) {
      return false;
    }
    return activeShowdown.focusPlayer === context.params.playerId;
  },
  enumerator: (state, context) => {
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (interaction.chain?.active) {
      return [];
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (!activeShowdown?.active) {
      return [];
    }
    if (activeShowdown.focusPlayer !== (context.playerId as string)) {
      return [];
    }
    return [{ playerId: context.playerId as string }];
  },
  reducer: (draft, context) => {
    if (!draft.interaction) {
      return;
    }

    const before = getActiveShowdown(draft.interaction);
    draft.interaction = passFocusState(draft.interaction);

    // If showdown ended (all passed), clean up.
    if (isShowdownEnded(draft.interaction)) {
      let conquerEvent:
        | {
            type: "conquer";
            playerId: string;
            battlefieldId: string;
            previousController: string | null;
          }
        | undefined;
      const bf = before?.battlefieldId ? draft.battlefields[before.battlefieldId] : undefined;
      if (bf) {
        if (before?.isCombatShowdown) {
          // Rule 348.1 → resolveFullCombat becomes legal (Combat Damage Step).
          bf.showdownComplete = true;
        } else {
          // Rule 348.2 / 316.8.b / 466.5.a: Non-Combat Showdown close — mark
          // the battlefield's showdown complete so startShowdown does not
          // re-stage the same battlefield this turn.
          bf.showdownComplete = true;
          // Rule 348.2 / 181.4: a Non-Combat Showdown closing means no combat
          // is pending here — the battlefield is no longer Contested. Leaving
          // it set blocks endTurn and lets resolveFullCombat recall the
          // mover's own units.
          bf.contested = false;
          bf.contestedBy = undefined;
          // Rule 348.2.a: Non-Combat Showdown close — if only one player's
          // units remain and they don't already control it, they establish
          // Control. 348.2.a.1: this is a Conquer if not yet scored.
          const bfZone = `battlefield-${before!.battlefieldId}` as CoreZoneId;
          const owners = new Set<string>();
          for (const cid of context.zones.getCardsInZone(bfZone)) {
            const o = context.cards.getCardOwner(cid);
            if (o) owners.add(o as string);
          }
          if (owners.size === 1) {
            const solo = [...owners][0];
            if (bf.controller !== solo) {
              // rule 188: pre-conquer controller — `null` means Uncontrolled.
              const previousController = bf.controller ?? null;
              bf.controller = solo;
              if (!draft.conqueredThisTurn[solo]) draft.conqueredThisTurn[solo] = [];
              draft.conqueredThisTurn[solo].push(before!.battlefieldId);
              const scored = draft.scoredThisTurn[solo] ?? [];
              // rule 471.2.c: Conquer abilities trigger only when the
              // Battlefield SCORES — re-taking a battlefield this player
              // already scored this turn is not a Conquer, so no event.
              if (!scored.includes(before!.battlefieldId)) {
                // Rule 348.2.a.1: this is a Conquer — emit the "conquer" event
                // (as conquerBattlefield / resolveFullCombat do) so [Hunt] and
                // "When you conquer" triggers fire.
                conquerEvent = {
                  battlefieldId: before!.battlefieldId,
                  playerId: solo,
                  previousController,
                  type: "conquer",
                };
              }
              if (!scored.includes(before!.battlefieldId)) {
                // rule 471.1.b.1: the Final Point by conquer needs every
                // battlefield scored this turn; otherwise draw instead. The
                // Conquer is still a Score (469.1/470), so it is recorded.
                const drewInstead = finalPointConquerDrawsInstead(
                  draft,
                  solo,
                  before!.battlefieldId,
                  context,
                );
                const p = draft.players[solo];
                // Rule 571.4: a board `score` replacement (e.g. Otterpus) substitutes for the point.
                if (!drewInstead && p && !applyScoreReplacement(draft, solo, context, "conquer"))
                  p.victoryPoints += 1;
                if (!draft.scoredThisTurn[solo]) draft.scoredThisTurn[solo] = [];
                draft.scoredThisTurn[solo].push(before!.battlefieldId);
                if (hasPlayerWon(draft, solo)) {
                  draft.status = "finished";
                  draft.winner = solo;
                  context.endGame?.({
                    metadata: { finalScore: p?.victoryPoints ?? 0, method: "conquer" },
                    reason: "victory_points",
                    winner: solo as CorePlayerId,
                  });
                }
              }
            }
          }
        }
      }
      draft.interaction = endShowdownState(draft.interaction);
      if (conquerEvent) {
        fireTriggers(conquerEvent, {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        });
      }
      // rule 323.13 / 344.2 — the Cleanup that follows a closed Showdown begins
      // the next staged one (e.g. a Combat that waited behind a Non-Combat
      // Showdown at another battlefield).
      openPendingContestedShowdown(
        draft,
        context as unknown as Parameters<typeof openPendingContestedShowdown>[1],
      );
      // rule 323.6 / 323.13 — the Cleanup that follows a closed Showdown runs
      // the state-based checks: a battlefield whose controller no longer has a
      // unit there (both sides traded before combat damage) becomes
      // Uncontrolled. Chain moves are not wrapped by withPostMoveCleanup, so
      // without this the stale controller survives into the open state.
      cleanupAndFireDeaths(draft, context as unknown as Parameters<typeof cleanupAndFireDeaths>[1]);
    }
  },
};

/**
 * Start a showdown at a battlefield (rule 548)
 *
 * Triggered when a battlefield becomes contested.
 */
export const startShowdown: Defs["startShowdown"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // Rule 548: Starting a Showdown is a Discretionary Action, legal only
    // in a Neutral Open state (no chain, no showdown). Also blocks nested
    // showdowns — a second showdown cannot stack while one is already open.
    const interaction = state.interaction ?? createInteractionState();
    const openNow = getActiveShowdown(interaction);
    if (openNow?.active) {
      // rule 344.2 — the Cleanup already began this Non-Combat Showdown on its
      // own; the Turn Player confirming it is a no-op. Any other battlefield,
      // an open Combat, or a non-turn player still gets nothing.
      return (
        openNow.isCombatShowdown !== true &&
        openNow.battlefieldId === context.params.battlefieldId &&
        state.turn.activePlayer === context.params.playerId
      );
    }
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }
    // rule 323.12 — beginning a staged Showdown is the TURN player's step;
    // a non-turn player never chooses it (e.g. after an off-turn Reaction move).
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }
    const bf = state.battlefields[context.params.battlefieldId];
    if (!bf) {
      return false;
    }
    // Rule 548: Showdowns begin when a battlefield is contested
    if (!bf.contested) {
      return false;
    }
    // Rule 348.1/465.2: once the Combat Showdown has closed, the remaining
    // combat steps are Outstanding — the same showdown cannot be reopened.
    if (bf.showdownComplete) {
      return false;
    }
    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    const openNow = getActiveShowdown(interaction);
    if (openNow?.active) {
      // rule 344.2 — already begun by Cleanup; only the Turn Player's no-op
      // confirm of that Non-Combat Showdown is offered.
      if (
        openNow.isCombatShowdown === true ||
        state.turn.activePlayer !== (context.playerId as string)
      ) {
        return [];
      }
      return [{ battlefieldId: openNow.battlefieldId, playerId: context.playerId as string }];
    }
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }
    // rule 323.12 — only the turn player is offered the staged-showdown choice.
    if (state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    // Rule 548: Only contested battlefields can have showdowns
    const results: { playerId: string; battlefieldId: string }[] = [];
    for (const bfId of Object.keys(state.battlefields ?? {})) {
      const bf = state.battlefields[bfId];
      if (bf?.contested && !bf.showdownComplete) {
        results.push({ battlefieldId: bfId, playerId: context.playerId as string });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { playerId, battlefieldId } = context.params;
    const playerIds = Object.keys(draft.players);

    // rule 344.2 — Cleanup already opened this Showdown; nothing to redo.
    const already = getActiveShowdown(draft.interaction ?? createInteractionState());
    if (already?.active && already.battlefieldId === battlefieldId) {
      return;
    }

    const bf = draft.battlefields[battlefieldId];
    const ownerOf = (id: string): string | undefined =>
      (context.cards.getCardController?.(id as never) ??
        (context.cards.getCardOwner(id as never) as string | undefined)) ?? undefined;
    const occupants = context.zones.getCardsInZone(
      `battlefield-${battlefieldId}` as never,
    ) as unknown as string[];
    // rule 344 — a Showdown is a COMBAT showdown only when units controlled by
    // different players share the battlefield; Contested alone does not make one.
    const isCombat = occupants.some(
      (id) => ownerOf(id) !== undefined && ownerOf(id) !== (bf?.contestedBy ?? playerId),
    );
    // Rule 464.2.c (Vendetta): Attacker = player who applied Contested;
    // Defender = the player who did NOT apply Contested (bf.controller when
    // set, otherwise the other player). Rule 550.2: non-combat → all players.
    const attacker = bf?.contestedBy ?? playerId;
    const defender =
      bf?.controller ?? playerIds.find((p) => p !== attacker) ?? undefined;
    const relevantPlayers =
      isCombat && defender ? [...new Set([attacker, defender])] : playerIds;

    const interaction = draft.interaction ?? createInteractionState();
    draft.interaction = startShowdownState(
      interaction,
      battlefieldId,
      // rule 345: as a Showdown begins, the player who applied Contested gains
      // Focus — even when the Turn Player is the one who began it.
      attacker,
      relevantPlayers,
      isCombat,
      attacker,
      defender,
    );
    const triggerCtx = {
      cards: context.cards,
      counters: context.counters,
      draft,
      zones: context.zones,
    };
    // rule-id: unl-079-219 (Rule 340): "When a showdown begins here" fires
    // for combat and non-combat showdowns alike.
    fireTriggers({ battlefieldId, isCombat, playerId, type: "showdown-begin" }, triggerCtx);
    if (!isCombat) {
      return;
    }
    // rule 625.1.c.1 / 625.1.c.2 — beginning a Combat Showdown assigns combat
    // roles and fires "attack" / "defend".
    for (const id of occupants) {
      const owner = ownerOf(id);
      if (owner === undefined) {
        continue;
      }
      const role = owner === attacker ? "attacker" : "defender";
      context.cards.updateCardMeta?.(id as never, { combatRole: role } as never);
      fireTriggers(
        {
          alone: occupants.filter((o) => ownerOf(o) === owner).length === 1,
          battlefieldId,
          cardId: id,
          owner,
          type: role === "attacker" ? "attack" : "defend",
        },
        triggerCtx,
      );
    }
  },
};

/**
 * End a showdown (rule 553.4.a)
 *
 * Called when all relevant players have passed focus.
 */
export const endShowdown: Defs["endShowdown"] = {
  condition: (state) => {
    if (state.pendingChoice) {
      return false;
    }
    const interaction = state.interaction ?? createInteractionState();
    const activeShowdown = getActiveShowdown(interaction);
    return activeShowdown?.active === false || isShowdownEnded(interaction);
  },
  enumerator: (state) => {
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (!interaction.showdownStack?.length) {
      return [];
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (activeShowdown?.active === false || isShowdownEnded(interaction)) {
      return [{}];
    }
    return [];
  },
  reducer: (draft) => {
    if (!draft.interaction) {
      return;
    }
    draft.interaction = endShowdownState(draft.interaction);
  },
};
