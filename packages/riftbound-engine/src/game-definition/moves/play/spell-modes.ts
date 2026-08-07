/**
 * rule 820.2 (unl-182-219) — the modes of a modal spell are chosen while the
 * spell is being PLAYED, before anyone receives Priority, and rule 820.2.a: a
 * [Repeat] execution chooses its own mode. This module raises those prompts at
 * play time and bakes each pick into the chain item's stored effect, so nothing
 * modal is left to ask when the item finally resolves.
 */
import type { RiftboundGameState } from "../../../types";

interface ChoiceEffectShape {
  readonly type: "choice";
  readonly options?: readonly { readonly effect: unknown }[];
  readonly notChosenThisTurn?: boolean;
  /**
   * rule 355.10.e — when someone other than the caster picks the mode (Party
   * Favors, Shakedown) the decision belongs to the RESOLUTION, not to playing
   * the card, so those stay with the resolution-time handler.
   */
  readonly player?: string;
}

type ChainItem = { readonly id: string; cardId?: string; effect?: unknown } & Record<string, unknown>;

/** The next still-modal step of a stored spell effect (`slot` = index inside a sequence). */
function nextModeSlot(effect: unknown): { slot?: number; choice: ChoiceEffectShape } | undefined {
  const e = effect as { type?: string; effects?: unknown[] } | undefined;
  if (!e) {
    return undefined;
  }
  const casterChooses = (c: unknown): boolean =>
    (c as ChoiceEffectShape | undefined)?.type === "choice" &&
    (c as ChoiceEffectShape).player === undefined;
  if (casterChooses(e)) {
    return { choice: e as unknown as ChoiceEffectShape };
  }
  if (e.type === "sequence" && Array.isArray(e.effects)) {
    const slot = e.effects.findIndex((s) => casterChooses(s));
    if (slot >= 0) {
      return { choice: e.effects[slot] as ChoiceEffectShape, slot };
    }
  }
  return undefined;
}

/** Replace the modal step with the picked option's concrete effect. */
function bakeMode(effect: unknown, slot: number | undefined, picked: unknown): unknown {
  const parent = effect as Record<string, unknown>;
  if (slot === undefined) {
    // The whole stored effect was the choice — keep the play-time riders
    // (`_variables` / `_xPledged`) that playSpell spread onto it.
    const carried: Record<string, unknown> = {};
    if (parent._variables !== undefined) {
      carried._variables = parent._variables;
    }
    if (parent._xPledged !== undefined) {
      carried._xPledged = parent._xPledged;
    }
    return { ...(picked as Record<string, unknown>), ...carried };
  }
  const steps = [...((parent.effects as unknown[]) ?? [])];
  steps[slot] = picked;
  return { ...parent, effects: steps };
}

/**
 * Bake every mode that needs no question (one legal option left) and stop at the
 * first step that does, returning the prompt for it. `chosen` accumulates the
 * picks so "choose one you haven't already chosen" (rule 355.8) narrows the menu
 * across the [Repeat] executions.
 */
function advanceModes(
  item: ChainItem,
  playerId: string,
  cardId: string,
  chosen: number[],
): RiftboundGameState["pendingChoice"] {
  for (let guard = 0; guard < 16; guard++) {
    const found = nextModeSlot(item.effect);
    if (!found) {
      return undefined;
    }
    const all = found.choice.options ?? [];
    if (all.length === 0) {
      return undefined;
    }
    const exclusive = found.choice.notChosenThisTurn === true;
    const options = all.map((_, i) => i).filter((i) => !exclusive || !chosen.includes(i));
    if (options.length === 0) {
      return undefined;
    }
    if (options.length === 1) {
      const only = options[0] as number;
      item.effect = bakeMode(item.effect, found.slot, all[only]?.effect);
      chosen.push(only);
      continue;
    }
    return {
      bindToChainItemId: item.id,
      chosenModes: [...chosen],
      effect: found.choice,
      modeSlot: found.slot,
      options,
      playerId,
      sourceCardId: cardId,
      type: "choose-mode",
    } as RiftboundGameState["pendingChoice"];
  }
  return undefined;
}

/** Chain item just placed by playSpell (it is the top of the chain). */
function topItem(draft: RiftboundGameState, cardId: string): ChainItem | undefined {
  const items = draft.interaction?.chain?.items as ChainItem[] | undefined;
  const item = items?.[items.length - 1];
  return item && item.cardId === cardId ? item : undefined;
}

/**
 * rule 820.2 — called at the end of the playSpell reducer: ask the caster for
 * the modes of every execution before Priority opens.
 */
export function lockSpellModes(draft: RiftboundGameState, playerId: string, cardId: string): void {
  if (draft.pendingChoice) {
    return;
  }
  const item = topItem(draft, cardId);
  if (!item) {
    return;
  }
  const prompt = advanceModes(item, playerId, cardId, []);
  if (prompt) {
    draft.pendingChoice = prompt;
  }
}

/**
 * Answer branch for a play-time (`bindToChainItemId`) mode prompt: bake the pick
 * into the chain item and move on to the next execution's mode. Returns false
 * when the choice is not a play-time one, so resolution-time modes keep their
 * existing behaviour.
 */
export function applyPlayTimeModePick(
  draft: RiftboundGameState,
  choice: {
    readonly bindToChainItemId?: string;
    readonly chosenModes?: readonly number[];
    readonly effect: unknown;
    readonly modeSlot?: number;
    readonly options: readonly number[];
    readonly playerId: string;
    readonly sourceCardId: string;
  },
  pickedIdx: number,
): boolean {
  if (choice.bindToChainItemId === undefined) {
    return false;
  }
  if (!choice.options.includes(pickedIdx)) {
    return true; // illegal pick: leave the prompt standing
  }
  const items = draft.interaction?.chain?.items as ChainItem[] | undefined;
  const item = items?.find((it) => it.id === choice.bindToChainItemId);
  draft.pendingChoice = undefined;
  if (!item) {
    return true;
  }
  const picked = (choice.effect as ChoiceEffectShape).options?.[pickedIdx]?.effect;
  if (picked === undefined) {
    return true;
  }
  item.effect = bakeMode(item.effect, choice.modeSlot, picked);
  const chosen = [...(choice.chosenModes ?? []), pickedIdx];
  const next = advanceModes(item, choice.playerId, choice.sourceCardId, chosen);
  if (next) {
    draft.pendingChoice = next;
  }
  return true;
}
