/**
 * Combat Cleanup of the Attacker/Defender designations and "this combat" effects.
 *
 * rule 466.7 — the designations (466.7.a) and every "this combat" Might change
 * or granted keyword (466.7.c) end together, as the LAST thing a combat does.
 *
 * rule 807.1.d.1 / 719 (ruling 211635a4cca0ac5a) — the designation is what makes
 * [Assault] / [Shield] real Might, so it has to outlive the chain items the
 * combat itself produced: a conquer trigger sits on the chain while both players
 * still hold priority, and an attacking [Assault 2] 3-Might unit is [Mighty] for
 * anything played in that window. `resolveFullCombat` therefore parks the
 * cleanup on the battlefield (`combatDesignationsPending`) and it is flushed by
 * the first `performCleanup` that sees an empty chain.
 */
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/** The slice of the card store this cleanup needs. */
export interface CombatDesignationCards {
  readonly getCardMeta: (cardId: never) => unknown;
  readonly updateCardMeta: (cardId: never, meta: never) => void;
  readonly queryCards?: (predicate: (cardId: never, meta: Record<string, unknown>) => boolean) => readonly unknown[];
}

/** rule 466.7.a / 466.7.c — drop the designations and the combat-scoped bonuses. */
export function endCombatDesignations(cards: CombatDesignationCards, unitIds: readonly string[]): void {
  const get = (id: string): Partial<RiftboundCardMeta> | undefined =>
    cards.getCardMeta(id as never) as Partial<RiftboundCardMeta> | undefined;
  const set = (id: string, meta: Partial<RiftboundCardMeta>): void => {
    cards.updateCardMeta(id as never, meta as never);
  };
  for (const id of unitIds) {
    const meta = get(id);
    const combatMod = meta?.combatMightModifier ?? 0;
    set(id, {
      combatRole: null,
      ...(combatMod !== 0
        ? { combatMightModifier: 0, mightModifier: (meta?.mightModifier ?? 0) - combatMod }
        : {}),
    } as Partial<RiftboundCardMeta>);
  }
  // rule 466.7 — a `duration:"combat"` grant (Fortified Position's [Shield 2])
  // may sit on a unit that was never here, so sweep every card carrying one.
  const combatGrantIds =
    (cards.queryCards?.((_id, meta) =>
      ((meta as Partial<RiftboundCardMeta>).grantedKeywords ?? []).some(
        (gk: { duration?: string }) => gk.duration === "combat",
      ),
    ) as readonly string[] | undefined) ?? unitIds;
  for (const id of combatGrantIds) {
    const granted = get(id)?.grantedKeywords ?? [];
    const remaining = granted.filter((gk: { duration?: string }) => gk.duration !== "combat");
    if (remaining.length !== granted.length) {
      set(id, {
        grantedKeywords: remaining.length > 0 ? remaining : undefined,
      } as Partial<RiftboundCardMeta>);
    }
  }
}

/**
 * rule 466.7 — run every parked Combat Cleanup whose chain has drained. While
 * items from the combat are still on the chain the roles (and with them
 * [Assault] / [Shield] Might) stay real.
 */
export function flushPendingCombatDesignations(
  draft: RiftboundGameState,
  cards: CombatDesignationCards,
): boolean {
  if (draft.interaction?.chain?.active === true) {
    return false;
  }
  let changed = false;
  for (const battlefield of Object.values(draft.battlefields ?? {})) {
    const pending = battlefield?.combatDesignationsPending;
    if (pending === undefined) {
      continue;
    }
    battlefield.combatDesignationsPending = undefined;
    endCombatDesignations(cards, pending);
    changed = true;
  }
  return changed;
}
