// Effect handler: "choice"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 355.3 / 355.8 — a mode whose effect has no legal target may not be
 * chosen. Modes without a card target (player/self/battlefield descriptors,
 * resourceful effects) are always choosable.
 */
function modeHasLegalTarget(option: { effect?: ExecutableEffect }, ctx: EffectContext): boolean {
  const tgt = option.effect?.target as TargetDescriptor | string | undefined;
  if (tgt === undefined || typeof tgt === "string") {
    return true;
  }
  // Only board-object descriptors are judged here: everything else (players,
  // runes, cards in private zones, the source itself) is either always legal
  // or lives in a zone the board resolver does not scan.
  const kind = (tgt as { type?: string }).type;
  if (kind !== "unit" && kind !== "gear" && kind !== "unit-or-gear") {
    return true;
  }
  if (ctx.boundTargets && ctx.boundTargets.length > 0) {
    return true;
  }
  return (
    resolveTarget({ ...(tgt as TargetDescriptor), quantity: "all" }, {
      cards: ctx.cards,
      choosing: true,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sameZone: ctx.sameZone,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      triggerSourceId: ctx.triggerSourceId,
      zones: ctx.zones,
    } as Parameters<typeof resolveTarget>[1]).length > 0
  );
}

export function handle_choice(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  const { options } = effect as unknown as { options?: { effect: ExecutableEffect }[] };
  if (!options || options.length === 0) {
    return;
  }
  // rule 355.8 (ogn-157-298): "Choose one you've not chosen this turn" — modes
  // already picked this turn (recorded on the source card's
  // `meta.modesChosenThisTurn`) are no longer legal choices. The record is
  // turn-stamped so it lapses on its own next turn (rule 517.2.b).
  const notChosenThisTurn = (effect as { notChosenThisTurn?: boolean }).notChosenThisTurn === true;
  const sourceId = ctx.sourceCardId as Parameters<typeof ctx.cards.getCardOwner>[0];
  const currentTurn = (ctx.draft as { turn?: { number?: number } }).turn?.number ?? 0;
  let alreadyChosen: number[] = [];
  if (notChosenThisTurn) {
    const meta = ctx.cards.getCardMeta?.(sourceId) as
      | { modesChosenThisTurn?: number[]; modesChosenTurn?: number }
      | undefined;
    if (meta?.modesChosenTurn === currentTurn) {
      alreadyChosen = meta.modesChosenThisTurn ?? [];
    } else if (meta?.modesChosenThisTurn?.length) {
      ctx.cards.updateCardMeta?.(sourceId, { modesChosenThisTurn: [] });
    }
    ctx.cards.updateCardMeta?.(sourceId, { modesChosenTurn: currentTurn });
  }
  let availableIndices = options.map((_, i) => i).filter((i) => !alreadyChosen.includes(i));
  if (availableIndices.length === 0) {
    return;
  }
  // rule 355.3 / 355.8 (sfd-077-221) — drop modes with no legal target; if no
  // mode has one the effect still resolves and simply does nothing.
  const targetable = availableIndices.filter((i) =>
    modeHasLegalTarget(options[i] as { effect?: ExecutableEffect }, ctx),
  );
  if (targetable.length > 0) {
    availableIndices = targetable;
  }
  // rule-id: sfd-091-221 (rule 355.8) — "draw 1 or buff me": the controller
  // picks which mode resolves. With ≥2 modes and no other prompt in flight,
  // pause via a `choose-mode` pending choice; `resolvePendingChoice` runs the
  // picked option. A single mode (or a nested prompt) resolves inline.
  if (availableIndices.length >= 2 && !ctx.draft.pendingChoice) {
    // rule 355.10.e (ogn-071-298): "each other player chooses" — the opponent
    // picks the mode as the spell resolves, but it still resolves for "you".
    // rule-id: ogn-033-298 (rule 355.10.e) — "Deal 6 to it unless its
    // controller has you draw 2": the chosen unit's CONTROLLER decides.
    const targetController = (): string | undefined => {
      const targetId = ctx.boundTargets?.[0] ?? h.getTargetIds(effect, ctx)[0];
      if (!targetId) {
        return undefined;
      }
      const id = targetId as Parameters<typeof ctx.cards.getCardOwner>[0];
      return ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
    };
    const anyOpponent = (): string =>
      Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId;
    const chooser =
      effect.player === "opponent"
        ? anyOpponent()
        : (effect.player === "target-controller"
          ? (targetController() ?? anyOpponent())
          : ctx.playerId);
    ctx.draft.pendingChoice = {
      effect,
      options: availableIndices,
      playerId: chooser,
      sourceCardId: ctx.sourceCardId,
      type: "choose-mode",
      ...(notChosenThisTurn ? { notChosenThisTurn: true } : {}),
      ...(chooser !== ctx.playerId ? { controllerId: ctx.playerId } : {}),
      ...(ctx.boundTargets ? { boundTargets: ctx.boundTargets } : {}),
    };
    return;
  }
  const soleIndex = availableIndices[0] as number;
  if (options[soleIndex]?.effect) {
    if (notChosenThisTurn) {
      ctx.cards.updateCardMeta?.(sourceId, {
        modesChosenThisTurn: [...alreadyChosen, soleIndex],
      });
    }
    executeEffect(options[soleIndex].effect, ctx);
  }
}
