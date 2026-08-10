// Effect handler: "each-player-may"
//
// rule 355.2 / 428.4 (ogn-187-298 Whirlwind, ogn-237-298 King's Edict) —
// "Starting with the next player, each player may <effect>": nothing is
// chosen when the spell is played; as it RESOLVES every player in turn order,
// beginning with the player after its controller, makes their own optional
// choice. Each prompt is a `choose-target` with `anyNumber` + `maxPicks: 1`
// (so it can be declined) whose `then` carries the remaining players.
import type { CardId as CoreCardId } from "@tcg/core";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

interface EachPlayerMayEffect extends ExecutableEffect {
  /** The per-player effect; its `target` describes what that player may pick. */
  readonly effect?: ExecutableEffect;
  /** Players still to be prompted; absent = start the loop. */
  readonly remainingPlayers?: readonly string[];
}

/** Turn order beginning with the player AFTER `playerId`, wrapping around. */
function orderStartingWithNext(all: readonly string[], playerId: string): string[] {
  const idx = all.indexOf(playerId);
  if (idx < 0) {
    return [...all];
  }
  return [...all.slice(idx + 1), ...all.slice(0, idx + 1)];
}

export function handle_eachPlayerMay(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const self = effect as EachPlayerMayEffect;
  const inner = self.effect;
  if (!inner) {
    return;
  }

  // rule 355.8: play-time targets were supplied (the engine's single-choice
  // shortcut) — honour them directly instead of prompting every player.
  if (self.remainingPlayers === undefined && ctx.boundTargets && ctx.boundTargets.length > 0) {
    h.executeEffect(inner, ctx);
    return;
  }

  const queue =
    self.remainingPlayers ??
    orderStartingWithNext(Object.keys(ctx.draft.players), ctx.playerId);

  const target = (inner as { target?: unknown }).target;
  for (let i = 0; i < queue.length; i++) {
    const chooser = queue[i];
    if (chooser === undefined) {
      continue;
    }
    const options =
      typeof target === "object" && target !== null
        ? resolveTarget({ ...(target as Record<string, unknown>), quantity: "all" } as Parameters<
            typeof resolveTarget
          >[0], {
            cards: ctx.cards,
            // rule 355.10.e vs 757/758 (ogn-187-298 Whirlwind × unl-147-219
            // Baron Nashor) — a set chosen in whole or in part by other players
            // is NOT targeting: the PLAYER chooses here, not the spell, so
            // "can't be chosen by enemy spells and abilities" does not shrink
            // anyone's list. `choosing` is what turns that filter on for a
            // caster-chosen pool; it must stay off here.
            draft: ctx.draft,
            playerId: chooser,
            sourceCardId: ctx.sourceCardId,
            zones: ctx.zones,
          } as Parameters<typeof resolveTarget>[1])
        : [];
    if (options.length === 0) {
      continue;
    }
    // `then` chains the next player's prompt; it is read back with a cast in
    // `pending-choice.ts` (the anyNumber branch).
    ctx.draft.pendingChoice = {
      anyNumber: true,
      effect: inner,
      maxPicks: 1,
      options: options as CoreCardId[],
      playerId: chooser,
      remaining: options.length,
      sourceCardId: ctx.sourceCardId as CoreCardId,
      then: { ...self, remainingPlayers: queue.slice(i + 1) },
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
}
