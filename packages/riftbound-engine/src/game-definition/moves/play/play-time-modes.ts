/**
 * rule 349 / 820.2 — modal choices belong to the Make Relevant Choices step of
 * PLAYING a card, not to its resolution: the caster locks a mode for every
 * execution before anyone gets priority, and the chain item carries the picks.
 * Leaf module: must not import move defs.
 */
import {
  type ChosenModesMeta,
  modeInstanceKey,
  playTimeModeOptions,
  readChosenModes,
} from "../../../abilities/effects/choice";
import type { EffectContext, ExecutableEffect } from "../../../abilities/effect-executor";
import { resolveTarget } from "../../../abilities/target-resolver";
import { getDeflectSurcharge, payDeflectSurcharge } from "./cost";

type AnyEffect = Record<string, unknown>;

// biome-ignore lint/suspicious/noExplicitAny: chain items are framework-typed
type ChainItemLike = { readonly id: string } & Record<string, any>;

function findItem(draft: unknown, itemId: string): { items: ChainItemLike[]; index: number } | undefined {
  const items = (draft as { interaction?: { chain?: { items?: ChainItemLike[] } } }).interaction?.chain
    ?.items;
  const index = items?.findIndex((it) => it?.id === itemId) ?? -1;
  return items && index >= 0 ? { index, items } : undefined;
}

/**
 * rule 355.3 / 355.5 — a SPELL whose whole text is one "Choose one —" menu: its
 * mode's Game Object is the spell's target proper, so it is bound onto the chain
 * item's `targets` (public, re-checked for legality as the spell resolves —
 * 359.3.e.5) rather than tucked inside the effect. [Repeat] copies (several
 * menus on one item) keep per-execution `_chosenTargets`.
 */
function bindsOnItem(draft: unknown, itemId: string, nodes: readonly AnyEffect[]): boolean {
  if (nodes.length !== 1) {
    return false;
  }
  const found = findItem(draft, itemId);
  const item = found ? found.items[found.index] : undefined;
  // rule 377 — an ACTIVATED ability follows the play process too (ogn-157-298
  // Udyr): its mode's Game Object is the ability's target, so it rides on the
  // chain item exactly like a modal spell's. Triggered items keep the
  // per-execution `_chosenTargets` form.
  return (
    item !== undefined &&
    (item.type === "spell" || item.type === "ability") &&
    item.triggered !== true
  );
}

const isChoiceNode = (node: AnyEffect): boolean =>
  node.type === "choice" && Array.isArray(node.options);

/**
 * Every `choice` node in `effect`, in execution order. A node's own modes are
 * not descended into: a mode's nested choice only exists once that mode is
 * picked.
 */
export function collectChoiceNodes(effect: unknown, out: AnyEffect[] = []): AnyEffect[] {
  if (!effect || typeof effect !== "object") {
    return out;
  }
  if (Array.isArray(effect)) {
    for (const item of effect) {
      collectChoiceNodes(item, out);
    }
    return out;
  }
  const node = effect as AnyEffect;
  if (isChoiceNode(node)) {
    out.push(node);
    return out;
  }
  for (const value of Object.values(node)) {
    collectChoiceNodes(value, out);
  }
  return out;
}

/** The effect of mode `index` on a `choice` node. */
function modeEffect(node: AnyEffect, index: number): ExecutableEffect | undefined {
  const options = node.options as { effect?: ExecutableEffect }[] | undefined;
  return options?.[index]?.effect;
}

/**
 * rule 355.8 — the caster-chosen candidates for a locked-in mode, or [] when
 * the mode names no single board object (players, tokens created, "all …").
 */
function modeTargetOptions(node: AnyEffect, index: number, ctx: EffectContext): string[] {
  const effect = modeEffect(node, index) as { target?: unknown } | undefined;
  const tgt = effect?.target as { type?: string; quantity?: unknown } | undefined;
  if (!tgt || typeof tgt !== "object") {
    return [];
  }
  // rule 355.10 (sfd-039-221 "ready or exhaust a legend") — any single board
  // object the mode names is the caster's choice; fixed referents are not.
  if (
    typeof tgt.type !== "string" ||
    ["self", "trigger-source", "player", "battlefield", "pending-value"].includes(tgt.type)
  ) {
    return [];
  }
  if (tgt.quantity !== undefined && tgt.quantity !== 1) {
    return [];
  }
  return resolveTarget({ ...(tgt as object), quantity: "all" } as Parameters<typeof resolveTarget>[0], {
    ...(ctx as unknown as Parameters<typeof resolveTarget>[1]),
    choosing: true,
  }) as string[];
}

/** Modes already locked in for earlier executions of this same play. */
export function lockedModeIndices(effect: unknown): number[] {
  return collectChoiceNodes(effect)
    .map((n) => n._chosenIndex)
    .filter((i): i is number => typeof i === "number");
}

/**
 * rule 349 / 820.2 — park the next unmade mode choice for a chain item, if any.
 * Only choices that belong to the CASTER are made now; "each other player
 * chooses" modes (rule 355.10.e) are still made as the spell resolves, by that
 * player. Returns true when a prompt was parked.
 */
export function raisePlayTimeModeChoice(
  draft: { pendingChoice?: unknown },
  itemId: string,
  rootEffect: unknown,
  playerId: string,
  sourceCardId: string,
  ctx: EffectContext,
): boolean {
  const nodes = collectChoiceNodes(rootEffect);
  const locked = () =>
    nodes.map((n) => n._chosenIndex).filter((i): i is number => typeof i === "number");
  const onItem = bindsOnItem(draft, itemId, nodes);
  for (const [nodeIndex, next] of nodes.entries()) {
    if (next._chosenIndex !== undefined) {
      // rule 355.8 / 820.2 — the mode's own target is chosen in the same step,
      // right after the mode, so the caster picks mode/target per execution.
      if (onItem) {
        // rule 355.5 — the spell's own target: bound on the item (a sole
        // candidate without asking, like any finalized choice — 402.2), the
        // [Deflect] surcharge owed as it is chosen (809.1.c.1).
        const found = findItem(draft, itemId);
        const item = found ? found.items[found.index] : undefined;
        if (found && item && item.targets === undefined) {
          // rule 809.1.b / 356.2.a.2 — the spell itself is already paid for, so
          // an opposing [Deflect] object is only a legal choice if the pool
          // still covers its surcharge; choosing it then pays that surcharge.
          const state = ctx.draft as Parameters<typeof getDeflectSurcharge>[0];
          const cardsForCost = ctx.cards as Parameters<typeof getDeflectSurcharge>[3];
          const pooled = Object.values(
            (state.runePools?.[playerId]?.power ?? {}) as Partial<Record<string, number>>,
          ).reduce((a: number, b) => a + (b ?? 0), 0);
          // rule 809.1 — [Deflect] taxes opposing SPELLS only; an activated
          // ability choosing the same object owes nothing.
          const isSpell = item.type === "spell";
          const surchargeOf = (id: string): number =>
            isSpell ? getDeflectSurcharge(state, playerId, [id], cardsForCost) : 0;
          const options = modeTargetOptions(next, next._chosenIndex as number, ctx).filter(
            (id) => surchargeOf(id) <= pooled,
          );
          // rule 355.10.d.2 — the mode's target is chosen even when only one
          // is legal (the [Deflect] surcharge and "when you choose me" are then
          // paid/fired off the ANSWER, in `pending-choice.ts`).
          if (options.length >= 1) {
            draft.pendingChoice = {
              bindToChainItemId: itemId,
              effect: modeEffect(next, next._chosenIndex as number),
              options,
              playerId,
              sourceCardId,
              type: "choose-target",
              ...(options.length === 1 ? { soleOption: true as const } : {}),
              ...(options.some((id) => surchargeOf(id) > 0) ? { deflectTax: true } : {}),
            };
            return true;
          }
        }
        continue;
      }
      if (next._chosenTargets === undefined) {
        const options = modeTargetOptions(next, next._chosenIndex as number, ctx);
        // rule 355.10.d.2 — one legal target is still a target CHOICE.
        if (options.length >= 1) {
          draft.pendingChoice = {
            bindToChainItemId: itemId,
            choiceNodeIndex: nodeIndex,
            effect: modeEffect(next, next._chosenIndex as number),
            options,
            playerId,
            sourceCardId,
            type: "choose-target",
            ...(options.length === 1 ? { soleOption: true as const } : {}),
          };
          return true;
        }
      }
      continue;
    }
    // rule 355.10.e — "each other player chooses" stays a resolution-time
    // choice made by that player, not part of playing the card.
    if (next.player !== undefined) {
      return false;
    }
    // rule 355.8 (sfd-049-221) — "choose one you've not chosen this turn": modes
    // recorded on the source this turn are excluded alongside those locked for
    // earlier executions of this same play (turn-stamped record, rule 517.2.b).
    // rule 370.1.b (ruling d04623892609c111) — a COPIED instance of the ability
    // reads its own record, not the printed instance's.
    const meta = ctx.cards.getCardMeta?.(sourceCardId as Parameters<typeof ctx.cards.getCardOwner>[0]) as
      | ChosenModesMeta
      | undefined;
    const currentTurn = (ctx.draft as { turn?: { number?: number } }).turn?.number ?? 0;
    const chosenThisTurn =
      next.notChosenThisTurn === true && meta?.modesChosenTurn === currentTurn
        ? readChosenModes(meta, modeInstanceKey(next) ?? modeInstanceKey(rootEffect))
        : [];
    const options = playTimeModeOptions(next as unknown as ExecutableEffect, ctx, [
      ...locked(),
      ...chosenThisTurn,
    ]);
    if (options.length === 0) {
      return false;
    }
    // rule 355.10.d.2 / 355.3 — a forced mode is still the mode the controller
    // NAMES: it is offered (one-click confirm), not locked behind their back.
    draft.pendingChoice = {
      bindToChainItemId: itemId,
      effect: next,
      options,
      playerId,
      sourceCardId,
      type: "choose-mode",
      ...(options.length === 1 ? { soleOption: true as const } : {}),
      ...(next.notChosenThisTurn === true ? { notChosenThisTurn: true } : {}),
    };
    return true;
  }
  return false;
}

/** "a friendly unit at a battlefield" for a target descriptor (label fallback only). */
function describeTarget(target: unknown): string {
  if (target === "self" || (target as { type?: string } | undefined)?.type === "self") {
    return "me";
  }
  if (!target || typeof target !== "object") {
    return "";
  }
  const t = target as {
    type?: string;
    controller?: string;
    location?: string;
    filter?: unknown;
    quantity?: unknown;
  };
  const qty = t.quantity as number | "all" | { upTo?: number } | undefined;
  const noun = t.type === "unit-or-gear" ? "unit or gear" : (t.type ?? "target");
  const plural = qty === "all" || (typeof qty === "number" && qty > 1) || typeof qty === "object";
  const words: string[] = [];
  if (qty === "all") words.push("all");
  else if (typeof qty === "number" && qty > 1) words.push(String(qty));
  else if (typeof qty === "object" && qty?.upTo !== undefined) words.push(`up to ${qty.upTo}`);
  else words.push(t.controller === "enemy" ? "an" : "a");
  if (t.controller === "friendly" || t.controller === "enemy") words.push(t.controller);
  if (typeof t.filter === "string") words.push(t.filter);
  words.push(plural ? `${noun}s` : noun);
  if (t.location === "battlefield") words.push("at a battlefield");
  else if (t.location === "base") words.push("in a base");
  else if (t.location === "here") words.push("here");
  else if (t.location === "trash") words.push("in a trash");
  return words.join(" ");
}

/**
 * A short English rendering of one instruction, used only when a mode carries
 * no printed `label` (never a raw effect id like "create-token 4").
 */
export function summarizeEffect(effect: unknown): string {
  const e = (effect ?? {}) as Record<string, unknown> & { type?: string };
  const tgt = describeTarget(e.target);
  const amount = typeof e.amount === "number" ? e.amount : undefined;
  const turn = e.duration === "turn" ? " this turn" : "";
  switch (e.type) {
    case "damage":
      return `Deal ${amount ?? "damage"} to ${tgt || "a unit"}`;
    case "draw":
      return `Draw ${amount ?? 1}`;
    case "counter":
      return `Counter ${tgt && tgt !== "a target" ? tgt : "a spell"}`;
    case "create-token": {
      const token = (e.token ?? {}) as { name?: string; might?: number; type?: string; keywords?: string[] };
      const n = amount ?? 1;
      const kw = token.keywords?.length ? ` with ${token.keywords.join(", ")}` : "";
      const might = token.might !== undefined ? `${token.might} Might ` : "";
      return `Play ${n === 1 ? "a" : n} ${might}${token.name ?? "token"} ${token.type ?? "unit"} token${n === 1 ? "" : "s"}${kw}`;
    }
    case "kill":
      return `Kill ${tgt || "a unit"}`;
    case "buff":
      return `Buff ${tgt || "a unit"}`;
    case "stun":
      return `Stun ${tgt || "a unit"}`;
    case "ready":
      return `Ready ${tgt || "a permanent"}`;
    case "exhaust":
      return `Exhaust ${tgt || "a permanent"}`;
    case "modify-might":
      return `Give ${tgt || "a unit"} ${amount !== undefined && amount >= 0 ? "+" : ""}${amount ?? ""} Might${turn}`;
    case "return-to-hand":
      return `Return ${tgt || "a unit"} to its owner's hand`;
    case "recycle":
      return `Recycle ${tgt || `${amount ?? ""} card${amount === 1 ? "" : "s"}`.trim()}`;
    case "discard": {
      const who = e.player === "opponent" ? "Opponent discards" : e.player === "each" ? "Each player discards" : "Discard";
      return `${who} ${amount ?? 1}`;
    }
    case "channel":
      return `Channel ${amount ?? 1} rune${amount === 1 ? "" : "s"}${e.exhausted ? " exhausted" : ""}`;
    case "grant-keyword":
      return `${tgt ? `Give ${tgt} ` : "Gain "}${String(e.keyword ?? "a keyword")}${e.value !== undefined ? ` ${e.value}` : ""}${turn}`;
    case "empower":
      return `Empower ${tgt || "a unit"}${turn}`;
    case "disempower":
      return `Disempower ${tgt || "a unit"}${turn}`;
    case "move":
      return `Move ${tgt || "a unit"}`;
    case "heal":
      return `Heal ${tgt || "a unit"}`;
    case "banish":
      return `Banish ${tgt || "a card"}`;
    case "sequence": {
      const steps = (e.effects as unknown[] | undefined) ?? [];
      return steps.map((s) => summarizeEffect(s)).filter(Boolean).join(", then ");
    }
    case "raw":
      return String(e.text ?? "…");
    default: {
      const verb = String(e.type ?? "effect").replace(/-/g, " ");
      return `${verb.charAt(0).toUpperCase()}${verb.slice(1)}${amount !== undefined ? ` ${amount}` : ""}${tgt ? ` — ${tgt}` : ""}`;
    }
  }
}

/**
 * rule 355.3 — the text shown for mode `index` of a "Choose one —" menu: the
 * printed bullet (`label`) when the card data carries it, else a rendering of
 * the mode's instruction.
 */
export function modeOptionLabel(node: unknown, index: number): string {
  const option = (node as { options?: { label?: string; text?: string; effect?: unknown }[] } | undefined)
    ?.options?.[index];
  if (!option) {
    return `Mode ${index + 1}`;
  }
  const printed = option.label ?? option.text ?? (option.effect as { text?: string } | undefined)?.text;
  return printed && printed.trim().length > 0 ? printed : summarizeEffect(option.effect);
}

/** rule 355.3 — the labels of every mode of a card's modal spell (empty when not modal). */
export function spellModeLabels(abilities: readonly unknown[] | undefined): string[] {
  const spell = (abilities ?? []).find((a) => (a as { type?: string })?.type === "spell") as
    | { effect?: unknown }
    | undefined;
  const node = spell?.effect as { type?: string; options?: unknown[] } | undefined;
  if (node?.type !== "choice" || !Array.isArray(node.options)) {
    return [];
  }
  return node.options.map((_unused, i) => modeOptionLabel(node, i));
}
