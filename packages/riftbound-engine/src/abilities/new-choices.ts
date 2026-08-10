/**
 * NEW CHOICES for a finalized chain item (rules 751–755).
 *
 * "Gain control of a spell. You may make new choices for it" (ogn-080-298
 * Mystic Reversal, ven-152-166 Rebuttal) and any "you may choose new targets
 * for it": the choices normally made while the item was FINALIZED (752 → 355:
 * modes 355.3, Move Destinations 355.4, targets 355.5 incl. a split's recipient
 * SET 355.14.b and a Might-reference SOURCE 355.14.a) may be remade, each one
 * individually (753 — "any subset"), by the player instructed to — from THEIR
 * seat: "friendly" / "enemy" are re-read (753.1), the item itself is never a
 * target (355.9.c), and a from-Hidden play keeps its "here" lock (811.1.d.2).
 * Not re-choosable: choices "as you play this", Optional Additional Costs, the
 * [Repeat] payment, an X paid (752.2 / 755.1); objects an instruction merely
 * mentions — costs, conditions, "each player kills one of their units" — are
 * not targets at all (355.10) and are never offered.
 *
 * `offerNewChoices` reads the item's CHOICE SLOTS off what finalization
 * recorded — positional `item.targets` (the play-time layout of
 * `moves/play/play-spell.ts`: [target], [reference, victim], [lead, second],
 * [reference, ...split set], an "up to N" set …), `_chosenIndex` /
 * `_chosenTargets` on "Choose one —" nodes, `_dest` on move nodes, an ability
 * item's `targetSlots` — and raises ONE `new-choices` prompt that walks them in
 * order (`cursor`). Per slot the chooser sees the CURRENT value plus every legal
 * alternative and either keeps it (`keep`, or naming the current value again —
 * not a new choice, 751.1) or names a new one; a slot that depends on another
 * (a mode's own target, a mover's destination, a split's recipients after its
 * source) is asked only when its parent was (re-)named, and MUST be answered
 * when the parent's change left it empty (753.1). A slot with nothing legal to
 * change to is not offered (753.2); with no such slot at all no prompt appears.
 * Every answer is validated exactly like the finalization choice it remakes
 * (split cap 355.14.c against the NEW source, pair legality, distinctness).
 * rule 754: an object the item did not target before is targeted NOW — its
 * "when you choose me" Targeting Effects trigger, with the chooser as "you".
 * rule 755: any cost "to play" the new choice incurs ([Deflect]) is IGNORED —
 * nothing is charged and affordability never filters a candidate (the option
 * still reports the surcharge as `deflectIgnored`). The item stays FINALIZED:
 * nothing is re-pended, no Priority window opens beyond the normal one, and
 * resolution reads the rebound slots exactly as it reads finalized ones.
 *
 * Leaf module: imports leaf helpers only (no move definitions).
 */
import type { CardId as CoreCardId } from "@tcg/core";
import type { ChainItem, ChainTargetSlot } from "../chain/chain-state";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { getCardEffectiveMight, getDeflectSurcharge } from "../game-definition/moves/play/cost";
import { collectDestinationNodes, moverForNode } from "../game-definition/moves/play/play-time-destinations";
import { collectChoiceNodes, modeOptionLabel } from "../game-definition/moves/play/play-time-modes";
import {
  casterModeChoice,
  collectIndependentTargetSlots,
  collectSequenceTargetSlots,
  enumerateReferencePairs,
  enumerateTargetPairs,
  findAllAtOneBattlefieldTarget,
  findAmountReferenceDamageTarget,
  findAmountReferenceTarget,
  findConditionalBranchTarget,
  findReferencePair,
  findReplacementChosenTarget,
  findSequenceLeadTarget,
  findSplitDamageEffect,
  hiddenChoiceIsPulledIn,
  isPerPlayerInstruction,
  type SpellEffectTargetShape,
} from "../game-definition/moves/play/targeting";
import type {
  NewChoiceOption,
  NewChoiceSlotState,
  NewChoicesChoice,
  RiftboundGameState,
} from "../types";
import { getBonusDamage } from "./bonus-damage";
import { legalChosenPlayers, playerTargetWhich } from "./chosen-player";
import type { EffectContext, ExecutableEffect } from "./effect-executor";
import { playTimeModeOptions } from "./effects/choice";
import type { GameEvent } from "./game-events";
import { keepLegalArrivals, moveDestinationOptions } from "./move-destinations";
import type { TargetDescriptor, TargetResolverContext } from "./target-resolver";
import { resolveTarget } from "./target-resolver";
import { collectMultiPickSlots, nodeAtPath } from "./target-slots";

// biome-ignore lint/suspicious/noExplicitAny: effect nodes are loosely typed JSON
type AnyEffect = Record<string, any>;
type Descriptor = TargetDescriptor & Record<string, unknown>;

/** The context slice the dialog needs: an EffectContext built for the CHOOSER and the item's card. */
export type NewChoicesContext = Pick<EffectContext, "cards" | "zones" | "counters" | "draft"> & {
  readonly fireTriggers?: (event: GameEvent) => void;
};

type SlotKind = NewChoiceSlotState["kind"];

/**
 * A live slot: recomputed from the item on every step, so a slot that depends
 * on an earlier answer (the target of a re-chosen mode, the destinations of a
 * re-chosen mover, the split cap of a re-chosen source) always reads the item
 * as it stands. Only `NewChoiceSlotState` (key / status) is persisted.
 */
interface LiveSlot {
  readonly key: string;
  readonly kind: SlotKind;
  readonly label: string;
  readonly parent?: string;
  readonly current: readonly string[];
  /** Legal values right now, from the chooser's seat (current included when still legal). */
  readonly options: () => SlotOption[];
  /** Bounds for a set slot; single slots are 1..1. */
  readonly min?: number;
  readonly max?: () => number;
  readonly slotSemantics?: "split" | "upTo";
  /** Extra whole-answer legality (pair shapes, distinctness) beyond per-option membership. */
  readonly validate?: (values: readonly string[]) => boolean;
  /** Write the (re-)named value(s) onto the item. */
  readonly apply: (values: readonly string[]) => void;
  /** Whether the values are Game Objects whose Targeting Effects fire when newly chosen (754). */
  readonly targetsObjects: boolean;
}

interface SlotOption {
  readonly key: string;
  readonly cardId?: string;
  readonly zone?: string;
  readonly mode?: number;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Chain item access
// ---------------------------------------------------------------------------

function chainItems(draft: RiftboundGameState): ChainItem[] | undefined {
  return draft.interaction?.chain?.items as ChainItem[] | undefined;
}

function findItem(draft: RiftboundGameState, itemId: string): ChainItem | undefined {
  return chainItems(draft)?.find((it) => it?.id === itemId);
}

function patchItem(draft: RiftboundGameState, itemId: string, patch: Partial<ChainItem>): void {
  const items = chainItems(draft);
  const idx = items?.findIndex((it) => it?.id === itemId) ?? -1;
  if (items && idx >= 0) {
    items[idx] = { ...(items[idx] as ChainItem), ...patch };
  }
}

/**
 * The item's effect as a private, writable tree: a stored effect is often the
 * card definition's own frozen object (rule 808.2 copies choose independently),
 * so `_chosenIndex` / `_dest` / `_bound` writes need a deep copy first.
 */
function writableEffect(draft: RiftboundGameState, itemId: string): AnyEffect | undefined {
  const item = findItem(draft, itemId);
  if (!item || item.effect === undefined || item.effect === null || typeof item.effect !== "object") {
    return undefined;
  }
  const frozen = (node: unknown): boolean => {
    if (!node || typeof node !== "object") {
      return false;
    }
    if (!Object.isExtensible(node)) {
      return true;
    }
    return Object.values(node as AnyEffect).some((v) => frozen(v));
  };
  if (frozen(item.effect)) {
    patchItem(draft, itemId, { effect: JSON.parse(JSON.stringify(item.effect)) });
  }
  return findItem(draft, itemId)?.effect as AnyEffect;
}

function nameOf(ctx: NewChoicesContext, cardId: string): string {
  const viaCards = (ctx.cards as { getCardName?: (id: CoreCardId) => string | undefined }).getCardName?.(
    cardId as CoreCardId,
  );
  return viaCards ?? (getGlobalCardRegistry().get(cardId) as { name?: string } | undefined)?.name ?? cardId;
}

function zoneLabel(draft: RiftboundGameState, zone: string): string {
  if (zone === "base") {
    return "Base";
  }
  const bfId = zone.startsWith("battlefield-") ? zone.slice("battlefield-".length) : zone;
  const name = (getGlobalCardRegistry().get(bfId) as { name?: string } | undefined)?.name;
  return name ? `${name} [${bfId}]` : zone;
}

// ---------------------------------------------------------------------------
// Descriptor helpers
// ---------------------------------------------------------------------------

const FIXED_TYPES: readonly string[] = ["self", "trigger-source", "player", "pending-value", "controller"];

/** rule 355.5 / 355.10 — a single Game Object (or zone) the controller names; never a criteria selection. */
function isChosenSingle(desc: unknown, node?: AnyEffect): desc is Descriptor {
  if (!desc || typeof desc !== "object" || Array.isArray(desc)) {
    return false;
  }
  const d = desc as Descriptor & { chooseAtResolution?: boolean };
  if (typeof d.type !== "string" || FIXED_TYPES.includes(d.type)) {
    return false;
  }
  if (d.chooseAtResolution === true || node?.chooseAtResolution === true) {
    return false;
  }
  // rule 355.10.e / 355.10.f — "each player …" / "… must …" instructions choose nothing here.
  if (node && (isPerPlayerInstruction(node as SpellEffectTargetShape) || node.player === "opponent")) {
    return false;
  }
  return d.quantity === undefined || d.quantity === 1;
}

function resolverCtx(
  ctx: NewChoicesContext,
  chooser: string,
  item: ChainItem,
  hiddenZone: string | undefined,
  extra: Partial<TargetResolverContext> = {},
): TargetResolverContext {
  const trigEvt = item.triggerEvent as { cardId?: string; diedAt?: string } | undefined;
  const sourceZone =
    typeof trigEvt?.diedAt === "string" && trigEvt.cardId === item.cardId
      ? trigEvt.diedAt
      : (ctx.zones.getCardZone(item.cardId as CoreCardId) as string | undefined);
  return {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    ...(hiddenZone ? { hiddenZone } : {}),
    playerId: chooser,
    sourceCardId: item.cardId,
    ...(sourceZone !== undefined ? { sourceZone } : {}),
    ...(typeof trigEvt?.cardId === "string" ? { triggerSourceId: trigEvt.cardId } : {}),
    zones: ctx.zones,
    ...extra,
  } as TargetResolverContext;
}

/** Candidates of a single-object descriptor from the chooser's seat, less the item itself (355.9.c). */
function candidatesOf(
  desc: Descriptor,
  ctx: NewChoicesContext,
  chooser: string,
  item: ChainItem,
  hiddenZone: string | undefined,
  extra: Partial<TargetResolverContext> = {},
): string[] {
  const ids = resolveTarget({ ...desc, quantity: "all" } as TargetDescriptor, resolverCtx(ctx, chooser, item, hiddenZone, extra)) as string[];
  return ids.filter((id) => id !== item.cardId && id !== item.id);
}

function effectContextFor(ctx: NewChoicesContext, chooser: string, item: ChainItem): EffectContext {
  return {
    cards: ctx.cards,
    counters: ctx.counters,
    draft: ctx.draft,
    playerId: chooser,
    sourceCardId: item.cardId,
    sourceZone: ctx.zones.getCardZone(item.cardId as CoreCardId) as string | undefined,
    zones: ctx.zones,
  } as EffectContext;
}

function cardOption(ctx: NewChoicesContext, id: string): SlotOption {
  const isBattlefield = ctx.draft.battlefields?.[id] !== undefined;
  return isBattlefield
    ? { key: id, label: zoneLabel(ctx.draft, id), zone: `battlefield-${id}` }
    : { cardId: id, key: id, label: nameOf(ctx, id) };
}

// ---------------------------------------------------------------------------
// Slot discovery
// ---------------------------------------------------------------------------

interface Discovery {
  readonly draft: RiftboundGameState;
  readonly ctx: NewChoicesContext;
  readonly chooser: string;
  readonly item: ChainItem;
  readonly hiddenZone: string | undefined;
}

/** Positional targets of the item as they stand. */
function targetsOf(d: Discovery): string[] {
  return [...((findItem(d.draft, d.item.id)?.targets as readonly string[] | undefined) ?? [])];
}

function setPositional(d: Discovery, index: number, value: string | undefined): void {
  const targets = targetsOf(d);
  if (value === undefined) {
    targets.splice(index, 1);
  } else {
    targets[index] = value;
  }
  patchItem(d.draft, d.item.id, { targets });
}

/**
 * The mode slots of the item and, under each, the chosen mode's own target
 * (355.3 / 355.5 / 820.2 — one pair per [Repeat] execution).
 */
function modeSlots(d: Discovery, effect: AnyEffect, out: LiveSlot[]): boolean {
  const nodes = collectChoiceNodes(effect).filter((n) => typeof n._chosenIndex === "number" && n.player === undefined);
  if (nodes.length === 0) {
    return false;
  }
  const allNodes = collectChoiceNodes(effect);
  // rule 355.5 — a lone menu on a played spell / activated ability keeps its
  // mode's target on the item; several menus keep one per execution.
  const onItem = allNodes.length === 1 && (d.item.type === "spell" || d.item.type === "ability") && d.item.triggered !== true;
  const effCtx = effectContextFor(d.ctx, d.chooser, d.item);
  nodes.forEach((node, i) => {
    const exec = nodes.length > 1 ? ` (execution ${i + 1})` : "";
    const modeKey = `mode:${i}`;
    const modeTargetDesc = (idx: number): Descriptor | undefined => {
      const eff = (node.options as { effect?: AnyEffect }[] | undefined)?.[idx]?.effect;
      const t = eff?.target;
      return isChosenSingle(t, eff) ? (t as Descriptor) : undefined;
    };
    const modeIsLegal = (idx: number): boolean => {
      const desc = modeTargetDesc(idx);
      return desc === undefined || candidatesOf(desc, d.ctx, d.chooser, d.item, d.hiddenZone).length > 0;
    };
    out.push({
      apply: (values) => {
        const idx = Number(values[0]);
        const live = collectChoiceNodes(writableEffect(d.draft, d.item.id)).filter(
          (n) => typeof n._chosenIndex === "number" && n.player === undefined,
        )[i];
        if (!live || live._chosenIndex === idx) {
          return;
        }
        // rule 751.1 / 752.1 — a new mode REPLACES the locked one together with
        // the target that belonged to it; the new mode's target is named next.
        live._chosenIndex = idx;
        const hasTarget = modeTargetDesc(idx) !== undefined;
        if (onItem) {
          patchItem(d.draft, d.item.id, { targets: hasTarget ? [] : undefined });
        } else {
          live._chosenTargets = hasTarget ? [] : undefined;
        }
      },
      current: [String(node._chosenIndex)],
      key: modeKey,
      kind: "mode",
      label: `Mode${exec}`,
      options: () => {
        const legal = new Set(playTimeModeOptions(node as unknown as ExecutableEffect, effCtx, []).filter(modeIsLegal));
        legal.add(node._chosenIndex as number);
        return [...legal].sort((a, b) => a - b).map((idx) => ({ key: String(idx), label: modeOptionLabel(node, idx), mode: idx }));
      },
      targetsObjects: false,
    });
    // The chosen mode's own single target.
    out.push({
      apply: (values) => {
        if (onItem) {
          patchItem(d.draft, d.item.id, { targets: [...values] });
          return;
        }
        const live = collectChoiceNodes(writableEffect(d.draft, d.item.id)).filter(
          (n) => typeof n._chosenIndex === "number" && n.player === undefined,
        )[i];
        if (live) {
          live._chosenTargets = [...values];
        }
      },
      get current(): readonly string[] {
        const live = collectChoiceNodes(findItem(d.draft, d.item.id)?.effect).filter(
          (n) => typeof n._chosenIndex === "number" && n.player === undefined,
        )[i];
        if (onItem) {
          return targetsOf(d).slice(0, 1);
        }
        return [...((live?._chosenTargets as string[] | undefined) ?? [])].slice(0, 1);
      },
      key: `mode-target:${i}`,
      kind: "target",
      label: `Target${exec}`,
      options: () => {
        const live = collectChoiceNodes(findItem(d.draft, d.item.id)?.effect).filter(
          (n) => typeof n._chosenIndex === "number" && n.player === undefined,
        )[i];
        const desc = live ? modeTargetDesc(live._chosenIndex as number) : undefined;
        return desc ? candidatesOf(desc, d.ctx, d.chooser, d.item, d.hiddenZone).map((id) => cardOption(d.ctx, id)) : [];
      },
      parent: modeKey,
      targetsObjects: true,
    });
  });
  return true;
}

/**
 * Positional target slots of a SPELL item, mirroring the play-time layout of
 * `moves/play/play-spell.ts` (which wrote `item.targets`).
 */
function spellTargetSlots(d: Discovery, effect: AnyEffect, out: LiveSlot[]): void {
  const shape = effect as SpellEffectTargetShape;
  const targets = targetsOf(d);
  const single = (index: number, desc: Descriptor, key: string, label: string, kind: SlotKind = "target", extra?: Partial<LiveSlot>): LiveSlot => ({
    apply: (values) => setPositional(d, index, values[0]),
    get current(): readonly string[] {
      const v = targetsOf(d)[index];
      return v === undefined ? [] : [v];
    },
    key,
    kind,
    label,
    options: () => candidatesOf(desc, d.ctx, d.chooser, d.item, d.hiddenZone).map((id) => cardOption(d.ctx, id)),
    targetsObjects: true,
    ...extra,
  });
  /** Two positional slots whose legality is a PAIR relation: options for one side fix the other side's current value when it still pairs. */
  const pair = (pairs: () => [string, string][], labels: [string, string], kinds: [SlotKind, SlotKind] = ["target", "target"]): void => {
    for (const pos of [0, 1] as const) {
      const other = pos === 0 ? 1 : 0;
      out.push({
        apply: (values) => setPositional(d, pos, values[0]),
        get current(): readonly string[] {
          const v = targetsOf(d)[pos];
          return v === undefined ? [] : [v];
        },
        key: pos === 0 && kinds[0] === "source" ? "source" : `target:${pos}`,
        kind: kinds[pos],
        label: labels[pos],
        options: () => {
          const all = pairs();
          const otherCur = targetsOf(d)[other];
          const compatible = all.filter((p) => p[other] === otherCur);
          const pool = (compatible.length > 0 ? compatible : all).map((p) => p[pos]);
          return [...new Set(pool)].map((id) => cardOption(d.ctx, id));
        },
        targetsObjects: true,
        // rule 753.1 — the final pair must itself be legal; a first-slot pick
        // that strands the second is refused unless the second can follow.
        validate: (values) => {
          const all = pairs();
          const otherCur = targetsOf(d)[other];
          return all.some((p) => p[pos] === values[0] && (p[other] === otherCur || pos === 0));
        },
        ...(pos === 1 ? { parent: kinds[0] === "source" ? "source" : "target:0" } : {}),
      });
    }
  };

  // [reference, victim] — "Choose a friendly unit. Kill an enemy unit with less Might than it."
  const refPair = findReferencePair(shape);
  if (refPair) {
    pair(() => enumerateReferencePairs(refPair, resolverCtx(d.ctx, d.chooser, d.item, d.hiddenZone)), ["Reference unit", "Target"], ["source", "target"]);
    return;
  }
  // "Deal 3 to a unit. Deal 3 to a unit." — independent instructions, one slot each.
  const indep = collectIndependentTargetSlots(shape);
  if (indep && indep.length >= 2) {
    const distinct = (effect as { distinctTargets?: boolean }).distinctTargets === true;
    indep.forEach((s, i) => {
      out.push(
        single(i, s.target as Descriptor, `target:${i}`, `Target ${i + 1}`, "target", {
          validate: (values) => !distinct || !targetsOf(d).some((t, j) => j !== i && t === values[0]),
        }),
      );
    });
    return;
  }
  // fight / swap / attach pairs and "[lead] … and an enemy unit at the SAME battlefield".
  const pairs = enumerateTargetPairs(shape, resolverCtx(d.ctx, d.chooser, d.item, d.hiddenZone));
  if (pairs && targets.length === 2 && shape.target === undefined) {
    pair(() => enumerateTargetPairs(shape, resolverCtx(d.ctx, d.chooser, d.item, d.hiddenZone)) ?? [], ["First target", "Second target"]);
    return;
  }
  if (shape.type === "fight" && typeof shape.attacker === "object" && typeof shape.defender === "object") {
    const atk = shape.attacker as Descriptor;
    const def = shape.defender as Descriptor;
    pair(
      () => {
        const as = candidatesOf(atk, d.ctx, d.chooser, d.item, d.hiddenZone);
        const ds = candidatesOf(def, d.ctx, d.chooser, d.item, d.hiddenZone);
        return as.flatMap((a) => ds.filter((b) => b !== a).map((b) => [a, b] as [string, string]));
      },
      ["Attacker", "Defender"],
    );
    return;
  }

  // Might reference ("Choose a friendly unit. It deals damage equal to its Might …").
  const refTgt = findAmountReferenceTarget(shape);
  if (refTgt !== undefined && typeof refTgt !== "string") {
    const refDesc = refTgt as Descriptor;
    const splitEffect = findSplitDamageEffect(shape);
    const splitDesc =
      splitEffect?.target !== undefined && typeof splitEffect.target !== "string" ? (splitEffect.target as Descriptor) : undefined;
    out.push(single(0, refDesc, "source", "Source unit", "source"));
    if (splitDesc) {
      // rule 355.14.a/b/c — the split's recipient SET, capped by the damage the
      // (possibly re-named) source has available; amounts wait for resolution (355.14.e).
      out.push({
        apply: (values) => {
          const cur = targetsOf(d);
          patchItem(d.draft, d.item.id, { targets: cur[0] === undefined ? [...values] : [cur[0], ...values] });
        },
        get current(): readonly string[] {
          return targetsOf(d).slice(1);
        },
        key: "split",
        kind: "targets",
        label: "Split-damage targets",
        max: () => {
          const src = targetsOf(d)[0];
          const effCtx = effectContextFor(d.ctx, d.chooser, d.item);
          const might = src === undefined ? 0 : getCardEffectiveMight(src, (c) => d.ctx.cards.getCardMeta?.(c) as never);
          return might > 0 ? might + getBonusDamage(effCtx) : 0;
        },
        min: 0,
        options: () => candidatesOf(splitDesc, d.ctx, d.chooser, d.item, d.hiddenZone).map((id) => cardOption(d.ctx, id)),
        parent: "source",
        slotSemantics: "split",
        targetsObjects: true,
      });
      return;
    }
    // "… It deals damage equal to its Might to an enemy unit" — [reference, damaged].
    const damaged = findAmountReferenceDamageTarget(shape);
    if (damaged !== undefined && typeof damaged !== "string") {
      out.push(single(1, damaged as Descriptor, "target:1", "Target"));
      return;
    }
    // "… to all enemy units at A BATTLEFIELD" — [reference, battlefield].
    const bf = findAllAtOneBattlefieldTarget(shape);
    if (bf !== undefined && targets.length >= 2) {
      out.push({
        apply: (values) => setPositional(d, 1, values[0]),
        get current(): readonly string[] {
          const v = targetsOf(d)[1];
          return v === undefined ? [] : [v];
        },
        key: "target:1",
        kind: "target",
        label: "Battlefield",
        options: () => Object.keys(d.draft.battlefields ?? {}).map((id) => cardOption(d.ctx, id)),
        targetsObjects: true,
      });
    }
    return;
  }

  // The single caster-chosen descriptor (root, replacement subject, conditional branch, sequence lead).
  const seqSlots = shape.target === undefined ? collectSequenceTargetSlots(shape) : undefined;
  const chosenSeq = seqSlots?.filter((s) => {
    const q = (s as Descriptor).quantity as unknown;
    const upToOne = typeof q === "object" && q !== null && (q as { upTo?: number }).upTo === 1;
    return (isChosenSingle(s) || upToOne) && (s as Descriptor).type !== "battlefield";
  });
  if (chosenSeq && chosenSeq.length >= 2 && findSequenceLeadTarget(shape) === undefined) {
    // rule 355.5 — "Return a friendly unit and an enemy unit …": one slot per distinct descriptor, positional.
    const poolOf = (i: number): string[] => {
      const desc = chosenSeq[i] as Descriptor;
      const leadZone = desc.location === "same" ? (d.ctx.zones.getCardZone(targetsOf(d)[0] as CoreCardId) as string | undefined) : undefined;
      return candidatesOf(desc, d.ctx, d.chooser, d.item, d.hiddenZone, leadZone ? { sameZone: leadZone } : {});
    };
    chosenSeq.forEach((s, i) => {
      const desc = s as Descriptor;
      const sameAsLead = desc.location === "same";
      out.push(
        single(i, desc, `target:${i}`, i === 0 ? "First target" : `Target ${i + 1}`, "target", {
          // A card another slot LEGALLY holds is taken; one sitting illegally in
          // another slot (the friendly/enemy pair re-anchored to the new
          // controller) is free to move over here.
          options: () =>
            poolOf(i)
              .filter((id) => !targetsOf(d).some((t, j) => j !== i && t === id && poolOf(j).includes(t)))
              .map((id) => cardOption(d.ctx, id)),
          ...(sameAsLead ? { parent: "target:0" } : {}),
        }),
      );
    });
    return;
  }
  const rootNode: AnyEffect | undefined = shape.target !== undefined ? effect : undefined;
  const tgt =
    (shape.target as Descriptor | string | undefined) ??
    (findReplacementChosenTarget(shape) as Descriptor | undefined) ??
    (findConditionalBranchTarget(shape) as Descriptor | undefined) ??
    (findSequenceLeadTarget(shape) as Descriptor | undefined);
  if (!tgt || typeof tgt === "string") {
    return;
  }
  const desc = tgt as Descriptor;
  if (typeof desc.type !== "string" || FIXED_TYPES.includes(desc.type)) {
    return;
  }
  // rule 355.10.e — "each player …" chooses nothing with the spell (ogn-209-298 Cull the Weak).
  const leadNode =
    rootNode ??
    (Array.isArray(shape.effects) ? (shape.effects as AnyEffect[]).find((e) => e?.target === tgt) : undefined);
  if (leadNode && (isPerPlayerInstruction(leadNode as SpellEffectTargetShape) || leadNode.player === "opponent" || leadNode.chooseAtResolution === true)) {
    return;
  }
  const qty = desc.quantity as unknown;
  if (qty === "all") {
    // rule 355.10.d — a criteria selection; only "… at A battlefield" names something (the zone).
    return;
  }
  // rule 355.13 / ogn-206-298 — "up to N" / "any number of" / "two units": a caster-chosen SET.
  const upTo = typeof qty === "object" && qty !== null ? (qty as { upTo?: number }).upTo : undefined;
  const exactN = typeof qty === "number" && qty >= 2 ? qty : undefined;
  if (qty === "any" || upTo !== undefined || exactN !== undefined) {
    const totalMightCap = (desc as { totalMight?: { lte?: number } }).totalMight?.lte;
    const mightOf = (id: string): number => getCardEffectiveMight(id, (c) => d.ctx.cards.getCardMeta?.(c) as never);
    const pool = (): string[] =>
      candidatesOf(desc, d.ctx, d.chooser, d.item, d.hiddenZone).filter((id) => totalMightCap === undefined || mightOf(id) <= totalMightCap);
    out.push({
      apply: (values) => patchItem(d.draft, d.item.id, { targets: [...values] }),
      get current(): readonly string[] {
        return targetsOf(d);
      },
      key: "set",
      kind: "targets",
      label: "Targets",
      max: () => (exactN !== undefined ? Math.min(exactN, pool().length) : upTo !== undefined ? upTo : pool().length),
      min: exactN !== undefined ? Math.min(exactN, pool().length) : 0,
      options: () => pool().map((id) => cardOption(d.ctx, id)),
      slotSemantics: "upTo",
      targetsObjects: true,
      validate: (values) => {
        if (totalMightCap !== undefined && values.reduce((s, id) => s + mightOf(id), 0) > totalMightCap) {
          return false;
        }
        const loc = desc.location;
        if ((loc === "here" || (qty === "any" && loc === "battlefield")) && values.length > 1) {
          const z = d.ctx.zones.getCardZone(values[0] as CoreCardId);
          return values.every((id) => d.ctx.zones.getCardZone(id as CoreCardId) === z);
        }
        return true;
      },
    });
    return;
  }
  out.push(single(0, desc, "target:0", "Target"));
}

/**
 * rule 402.2 — positional target slots of an ABILITY item (`item.targets`
 * minus what its target-set slots appended): the single caster-chosen object,
 * or one per distinct single-pick descriptor of a multi-object sequence.
 */
function abilityTargetSlots(d: Discovery, effect: AnyEffect, out: LiveSlot[]): void {
  const shape = effect as SpellEffectTargetShape;
  const slotIds = new Set((d.item.targetSlots ?? []).flatMap((s) => s.ids ?? []));
  const positionalCount = targetsOf(d).filter((id) => !slotIds.has(id)).length;
  if (positionalCount === 0) {
    return;
  }
  const seq = findSequenceLeadTarget(shape) === undefined ? collectSequenceTargetSlots(shape)?.filter((s) => isChosenSingle(s)) : undefined;
  const descs: Descriptor[] =
    seq && seq.length >= 2
      ? (seq as Descriptor[])
      : (() => {
          const node = effect;
          const t =
            (isChosenSingle(node.target, node) ? (node.target as Descriptor) : undefined) ??
            (findSequenceLeadTarget(shape) as Descriptor | undefined);
          return t && isChosenSingle(t) ? [t] : [];
        })();
  descs.slice(0, positionalCount).forEach((desc, i) => {
    out.push({
      apply: (values) => setPositional(d, i, values[0]),
      get current(): readonly string[] {
        const v = targetsOf(d)[i];
        return v === undefined ? [] : [v];
      },
      key: `target:${i}`,
      kind: "target",
      label: descs.length > 1 ? `Target ${i + 1}` : "Target",
      options: () =>
        candidatesOf(desc, d.ctx, d.chooser, d.item, d.hiddenZone)
          .filter((id) => !targetsOf(d).some((t, j) => j !== i && j < descs.length && t === id))
          .map((id) => cardOption(d.ctx, id)),
      targetsObjects: true,
    });
  });
}

/** rule 355.13 / 355.14.b — an ability item's finalization-time target SETS (`item.targetSlots`). */
function abilitySetSlots(d: Discovery, effect: AnyEffect, out: LiveSlot[]): void {
  const entries = d.item.targetSlots ?? [];
  if (entries.length === 0) {
    return;
  }
  const discovered = collectMultiPickSlots(effect);
  for (const entry of entries) {
    const found = discovered.find((m) => m.path === entry.slot);
    if (!found || entry.ids === undefined) {
      continue;
    }
    const effCtx = effectContextFor(d.ctx, d.chooser, d.item);
    const pool = (): string[] => candidatesOf(found.descriptor as Descriptor, d.ctx, d.chooser, d.item, d.hiddenZone);
    out.push({
      apply: (values) => rebindTargetSlot(d.draft, d.item.id, entry.slot, values),
      get current(): readonly string[] {
        return [...(findItem(d.draft, d.item.id)?.targetSlots?.find((s) => s.slot === entry.slot)?.ids ?? [])];
      },
      key: `set:${entry.slot || "root"}`,
      kind: "targets",
      label: found.semantics === "split" ? "Split-damage targets" : "Targets",
      max: () => {
        let max = pool().length;
        if (found.cap !== undefined) {
          max = Math.min(max, found.cap);
        }
        if (found.semantics === "split") {
          const amount = Number((found.node.amount as number | undefined) ?? 0);
          max = Math.min(max, amount > 0 ? amount + getBonusDamage(effCtx) : 0);
        }
        return Math.max(0, max);
      },
      min: 0,
      options: () => pool().map((id) => cardOption(d.ctx, id)),
      slotSemantics: found.semantics,
      targetsObjects: true,
    });
  }
}

/** Rewrite target-set slot `path` of `itemId` to `ids` (entry, `_bound` on the node, flat `targets`). */
function rebindTargetSlot(draft: RiftboundGameState, itemId: string, path: string, ids: readonly string[]): void {
  const item = findItem(draft, itemId);
  if (!item) {
    return;
  }
  const old = item.targetSlots?.find((s) => s.slot === path)?.ids ?? [];
  const flat = [...(item.targets ?? [])];
  for (const id of old) {
    const at = flat.lastIndexOf(id);
    if (at >= 0) {
      flat.splice(at, 1);
    }
  }
  const effect = writableEffect(draft, itemId);
  const node = effect === undefined ? undefined : nodeAtPath(effect, path);
  if (node) {
    node._bound = [...ids];
  }
  const slots: ChainTargetSlot[] = (item.targetSlots ?? []).map((s) => (s.slot === path ? { ...s, ids: [...ids] } : s));
  patchItem(draft, itemId, { targetSlots: slots, targets: [...flat, ...ids] });
}

/** rule 355.4 — every bound Move Destination of the item, under the slot naming its mover (if any). */
function destinationSlots(d: Discovery, effect: AnyEffect, out: LiveSlot[]): void {
  const nodes = collectDestinationNodes(effect);
  nodes.forEach((node, index) => {
    if (node._dest === undefined) {
      return;
    }
    const liveNode = (): AnyEffect | undefined => collectDestinationNodes(findItem(d.draft, d.item.id)?.effect)[index];
    const mover = (): string | undefined => {
      const item = findItem(d.draft, d.item.id);
      const n = liveNode();
      return item && n ? moverForNode(item as never, item.effect, n) : undefined;
    };
    // The positional slot holding the mover, so a re-named mover re-asks where it goes.
    const parent = out.find((s) => (s.kind === "target" || s.kind === "source") && s.current.length === 1 && s.current[0] === mover())?.key;
    out.push({
      apply: (values) => {
        const w = writableEffect(d.draft, d.item.id);
        const n = w === undefined ? undefined : collectDestinationNodes(w)[index];
        if (n) {
          n._dest = values[0] ?? null;
        }
      },
      get current(): readonly string[] {
        const v = liveNode()?._dest;
        return typeof v === "string" ? [v] : [];
      },
      key: `dest:${index}`,
      kind: "destination",
      label: nodes.length > 1 ? `Move destination ${index + 1}` : "Move destination",
      options: () => {
        const m = mover();
        const n = liveNode();
        if (!m || !n) {
          return [];
        }
        const zone = d.ctx.zones.getCardZone(m as CoreCardId) as string | undefined;
        if (zone !== "base" && !(zone ?? "").startsWith("battlefield-")) {
          return [];
        }
        const effCtx = { ...effectContextFor(d.ctx, d.chooser, d.item), ...(d.hiddenZone ? { hiddenZone: d.hiddenZone } : {}) } as EffectContext;
        const worded = moveDestinationOptions(n, m, effCtx);
        if (!worded) {
          return [];
        }
        return keepLegalArrivals(worded, m, effCtx).map((z) => ({ key: z, label: zoneLabel(d.draft, z), zone: z }));
      },
      ...(parent ? { parent } : {}),
      targetsObjects: false,
    });
  });
}

/**
 * rule 355.10 / 402.2 — record the PLAYER the item chose when it was finalized
 * ("Choose an opponent"), read from the seat that chose it. With a single legal
 * player the choice was auto-bound and never written down, so recover it here,
 * on the item's own effect, where the resolving handler can read it: it must
 * survive a control change rather than be re-derived from the new controller.
 */
function stampChosenPlayer(draft: RiftboundGameState, item: ChainItem): void {
  const which = playerTargetWhich(item.effect);
  if (which === undefined) {
    return;
  }
  const live = writableEffect(draft, item.id);
  if (live === undefined || typeof live._chosenPlayer === "string") {
    return;
  }
  const chose = item.originalController ?? item.controller;
  const auto = legalChosenPlayers(which, chose, Object.keys(draft.players));
  if (auto.length === 1) {
    live._chosenPlayer = auto[0];
  }
}

/**
 * rule 355.10 / 753.1 — the chosen PLAYER slot, re-read from the CHOOSER's seat:
 * after a control change the new controller's own opponents are the legal
 * values. KEEPING the old controller's opponent sticks (753) and simply makes
 * the instruction illegal at resolution (359.3.e.5) instead of re-aiming.
 */
function playerSlots(d: Discovery, effect: AnyEffect, out: LiveSlot[]): void {
  const which = playerTargetWhich(effect);
  const current = effect._chosenPlayer;
  if (which === undefined || typeof current !== "string") {
    return;
  }
  const now = (): string | undefined => {
    const live = findItem(d.draft, d.item.id)?.effect as AnyEffect | undefined;
    const v = live?._chosenPlayer;
    return typeof v === "string" ? v : undefined;
  };
  out.push({
    apply: (values) => {
      const live = writableEffect(d.draft, d.item.id);
      if (live !== undefined && values[0] !== undefined) {
        live._chosenPlayer = values[0];
      }
    },
    get current(): readonly string[] {
      const cur = now();
      return cur === undefined ? [] : [cur];
    },
    key: "player:0",
    kind: "target",
    label: "Chosen player",
    options: () => {
      const legal = legalChosenPlayers(which, d.chooser, Object.keys(d.draft.players));
      const cur = now();
      const keys = cur !== undefined && !legal.includes(cur) ? [cur, ...legal] : legal;
      return keys.map((p) => ({ key: p, label: p }));
    },
    targetsObjects: false,
  });
}

/** Every re-choosable slot of the item, in dialog order: modes (each with its target), targets / source / sets, destinations. */
function discoverSlots(d: Discovery): LiveSlot[] {
  const item = findItem(d.draft, d.item.id);
  const effect = item?.effect as AnyEffect | undefined;
  if (!item || !effect || typeof effect !== "object") {
    return [];
  }
  const out: LiveSlot[] = [];
  const modal = item.type === "spell" ? casterModeChoice(effect as SpellEffectTargetShape) !== undefined || collectChoiceNodes(effect).length > 0 : collectChoiceNodes(effect).length > 0;
  const hadModes = modal && modeSlots(d, effect, out);
  if (!hadModes || item.type !== "spell") {
    if (item.type === "spell" && item.triggered !== true) {
      spellTargetSlots(d, effect, out);
    } else {
      abilityTargetSlots(d, effect, out);
      abilitySetSlots(d, effect, out);
    }
  }
  playerSlots(d, effect, out);
  destinationSlots(d, effect, out);
  return out;
}

// ---------------------------------------------------------------------------
// Prompt state
// ---------------------------------------------------------------------------

/** Every object the item currently targets: positional targets, per-execution mode targets, set slots. */
export function allTargetsOfItem(item: ChainItem | undefined): string[] {
  if (!item) {
    return [];
  }
  const ids = new Set<string>(item.targets ?? []);
  for (const node of collectChoiceNodes(item.effect)) {
    for (const id of (node._chosenTargets as string[] | undefined) ?? []) {
      ids.add(id);
    }
  }
  for (const s of item.targetSlots ?? []) {
    for (const id of s.ids ?? []) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * rule 811.1.d.2 with 752 — a from-Hidden play's "here" restriction rides on
 * the item, so a new choice elsewhere is illegal (753.1) — except when the
 * effect pulls the chosen object in (811.1.d.2.a).
 */
function hiddenZoneOf(item: ChainItem): string | undefined {
  const trigEvt = item.triggerEvent as { cardId?: string; fromHiddenAt?: string } | undefined;
  const zone =
    typeof trigEvt?.fromHiddenAt === "string" && (trigEvt.cardId === undefined || trigEvt.cardId === item.cardId)
      ? `battlefield-${trigEvt.fromHiddenAt}`
      : undefined;
  return zone !== undefined && !hiddenChoiceIsPulledIn(item.effect as SpellEffectTargetShape) ? zone : undefined;
}

function discoveryFor(draft: RiftboundGameState, choice: Pick<NewChoicesChoice, "itemId" | "playerId" | "hiddenZone">, ctx: NewChoicesContext): Discovery | undefined {
  const item = findItem(draft, choice.itemId);
  if (!item) {
    return undefined;
  }
  return { chooser: choice.playerId, ctx: { ...ctx, draft }, draft, hiddenZone: choice.hiddenZone, item };
}

/** Whether a slot has anything to offer: some legal value other than what it holds (a set: any candidate at all). */
function offerable(slot: LiveSlot, parentChanged: boolean): { offer: boolean; options: SlotOption[] } {
  const options = slot.options();
  if (slot.kind === "targets") {
    return { offer: options.length > 0, options };
  }
  const current = slot.current[0];
  if (parentChanged && current === undefined) {
    return { offer: options.length > 0, options };
  }
  return { offer: options.some((o) => o.key !== current), options };
}

/** rule 809.1.c — the surcharge newly choosing `id` would incur for the chooser (reported, never charged — 755). */
function deflectOf(d: Discovery, id: string): number {
  return getDeflectSurcharge(d.draft, d.chooser, [id], d.ctx.cards as never, d.item.cardId, d.ctx.zones as never);
}

function presentSlot(d: Discovery, slot: LiveSlot, options: SlotOption[], prev: NewChoicesChoice, parentChanged: boolean): NewChoicesChoice {
  const { slotSemantics: _drop, ...base } = prev;
  const current = new Set(slot.current);
  const decorated: NewChoiceOption[] = options.map((o) => {
    const deflect = o.cardId !== undefined && !current.has(o.key) && !base.originalTargets.includes(o.key) ? deflectOf(d, o.cardId) : 0;
    return {
      key: o.key,
      label: o.label,
      ...(o.cardId !== undefined ? { cardId: o.cardId as never } : {}),
      ...(o.zone !== undefined ? { zone: o.zone } : {}),
      ...(o.mode !== undefined ? { mode: o.mode } : {}),
      ...(current.has(o.key) ? { current: true } : {}),
      ...(deflect > 0 ? { deflectIgnored: deflect } : {}),
    };
  });
  const isSet = slot.kind === "targets";
  const max = isSet ? Math.min(slot.max?.() ?? options.length, options.length) : 1;
  // rule 753.1 — a slot its re-chosen parent left EMPTY must be named (no
  // "keep nothing"); a SET whose members no longer fit the re-chosen parent (the
  // old recipients are not "enemy" to a new source's controller, or exceed its
  // cap) must be re-named from the legal candidates — at least one when any exist.
  const legalKept = slot.current.filter((c) => options.some((o) => o.key === c));
  const keepable = isSet
    ? !parentChanged || (legalKept.length === slot.current.length && slot.current.length <= max)
    : !(parentChanged && slot.current.length === 0);
  const min = isSet ? Math.min(keepable ? (slot.min ?? 0) : Math.max(1, slot.min ?? 0), max) : 1;
  const itemName = nameOf(d.ctx, d.item.cardId);
  const cur = slot.current.length > 0 ? slot.current.map((k) => options.find((o) => o.key === k)?.label ?? (d.draft.battlefields?.[k] ? zoneLabel(d.draft, k) : k.startsWith("battlefield-") || k === "base" ? zoneLabel(d.draft, k) : slot.kind === "mode" ? `mode ${Number(k) + 1}` : nameOf(d.ctx, k))).join(", ") : "none";
  const what =
    slot.kind === "mode"
      ? "mode"
      : slot.kind === "destination"
        ? "move destination"
        : slot.kind === "source"
          ? "source unit"
          : isSet
            ? slot.slotSemantics === "split"
              ? `split-damage targets (up to ${max}; amounts are decided when it resolves)`
              : `targets (up to ${max})`
            : "target";
  return {
    ...base,
    keepable,
    max,
    min,
    options: decorated,
    prompt: `New choices for ${itemName} — ${slot.label}: ${keepable ? "keep or " : ""}choose a new ${what} (current: ${cur})`,
    ...(slot.slotSemantics ? { slotSemantics: slot.slotSemantics } : {}),
  };
}

/**
 * Advance the dialog from `from` to the next slot with something to offer and
 * park it on `draft.pendingChoice`; when none is left the dialog is over
 * (`pendingChoice` cleared). Returns whether a slot was parked.
 */
function advance(draft: RiftboundGameState, choice: NewChoicesChoice, ctx: NewChoicesContext, from: number): boolean {
  const d = discoveryFor(draft, choice, ctx);
  if (!d) {
    draft.pendingChoice = undefined;
    return false;
  }
  const live = discoverSlots(d);
  const states: NewChoiceSlotState[] = live.map((s) => {
    const prev = choice.slots.find((p) => p.key === s.key);
    return { current: [...s.current], key: s.key, kind: s.kind, label: s.label, ...(s.parent ? { parent: s.parent } : {}), status: prev?.status ?? "open" };
  });
  const statusOf = (key: string | undefined): NewChoiceSlotState["status"] | undefined => (key === undefined ? undefined : states.find((s) => s.key === key)?.status);
  for (let i = Math.max(0, from); i < live.length; i++) {
    const slot = live[i] as LiveSlot;
    const st = states[i] as NewChoiceSlotState;
    if (st.status !== "open") {
      continue;
    }
    // A dependent slot goes unasked when its parent was explicitly KEPT (or
    // itself skipped that way): declining a mode keeps that whole modal choice,
    // declining a mover keeps where it goes.
    const parentStatus = statusOf(slot.parent);
    if (parentStatus === "kept" || parentStatus === "skipped") {
      states[i] = { ...st, status: "skipped" };
      continue;
    }
    const parentChanged = parentStatus === "changed";
    const { offer, options } = offerable(slot, parentChanged);
    if (!offer) {
      // rule 402.2 — a re-chosen parent left this slot empty with ONE legal
      // value: bound without asking, like any sole finalization candidate.
      if (parentChanged && slot.current.length === 0 && options.length === 1 && slot.kind !== "targets") {
        const value = (options[0]?.cardId ?? options[0]?.key) as string;
        commitValues(draft, choice, ctx, slot, [value]);
        states[i] = { ...st, current: [value], status: "changed" };
        continue;
      }
      states[i] = { ...st, status: "settled" };
      continue;
    }
    draft.pendingChoice = presentSlot(d, slot, options, { ...choice, cursor: i, slots: states }, parentChanged) as RiftboundGameState["pendingChoice"];
    return true;
  }
  draft.pendingChoice = undefined;
  return false;
}

/** Write `values` onto the item through `slot` and fire rule 754 for objects it did not target before. */
function commitValues(draft: RiftboundGameState, choice: NewChoicesChoice, ctx: NewChoicesContext, slot: LiveSlot, values: readonly string[]): string[] {
  const item = findItem(draft, choice.itemId);
  const before = new Set([...choice.originalTargets, ...allTargetsOfItem(item)]);
  slot.apply(values);
  if (!slot.targetsObjects || !item) {
    return [];
  }
  const fresh = values.filter((id) => !before.has(id) && draft.battlefields?.[id] === undefined);
  // rule 754 — a Game Object the item now targets and did not before: its
  // Targeting Effects trigger now, the chooser (the item's controller) choosing.
  // rule 755 — the [Deflect] surcharge this incurs is ignored: nothing is paid.
  for (const cardId of fresh) {
    ctx.fireTriggers?.({
      cardId,
      chooserId: choice.playerId,
      sourceCardId: item.cardId,
      sourceType: item.type === "spell" && item.triggered !== true ? "spell" : "ability",
      type: "choose",
    });
  }
  return fresh;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * rule 751 / 752 — open the NEW CHOICES dialog for finalized chain item
 * `itemId`, made by `chooser` (normally its new controller). Returns whether a
 * prompt was parked; false when the item has no re-choosable slot with a legal
 * alternative (753.2) — its choices simply stand.
 */
export function offerNewChoices(
  draftLike: unknown,
  itemId: string,
  chooser: string,
  ctx: NewChoicesContext,
  opts: { optional?: boolean; grantedBy?: string } = {},
): boolean {
  const draft = draftLike as RiftboundGameState;
  const item = findItem(draft, itemId);
  if (!item || item.countered === true || draft.pendingChoice) {
    return false;
  }
  // rule 355.10 — pin the finalized player choice before it can be re-read from
  // the new controller's seat.
  stampChosenPlayer(draft, item);
  const choice: NewChoicesChoice = {
    cursor: -1,
    ...(opts.grantedBy ? { grantedBy: opts.grantedBy as never } : {}),
    ...(hiddenZoneOf(item) ? { hiddenZone: hiddenZoneOf(item) } : {}),
    itemId,
    keepable: true,
    max: 1,
    min: 1,
    optional: opts.optional !== false,
    options: [],
    originalTargets: allTargetsOfItem(item),
    playerId: chooser as never,
    prompt: "",
    reChoose: true,
    slots: [],
    sourceCardId: item.cardId as never,
    type: "new-choices",
  };
  return advance(draft, choice, ctx, 0);
}

function optionKeysOf(choice: NewChoicesChoice): string[] {
  return choice.options.map((o) => o.key);
}

/** Normalize a raw answer: card ids / zone shorthands / mode numbers are accepted for keys. */
function keysFromParams(choice: NewChoicesChoice, params: Record<string, unknown>): string[] | undefined {
  const raw =
    (params.pickedKeys as unknown[] | undefined) ??
    (params.pickedCardIds as unknown[] | undefined) ??
    (params.pickedCardId !== undefined ? [params.pickedCardId] : undefined) ??
    (params.pickedZoneId !== undefined ? [params.pickedZoneId] : undefined) ??
    (params.pickedMode !== undefined ? [params.pickedMode] : undefined);
  if (raw === undefined) {
    return undefined;
  }
  const keys = optionKeysOf(choice);
  return raw.map((v) => {
    const k = String(v);
    if (keys.includes(k)) {
      return k;
    }
    if (keys.includes(`battlefield-${k}`)) {
      return `battlefield-${k}`;
    }
    const byCard = choice.options.find((o) => o.cardId === k || o.zone === k);
    return byCard?.key ?? k;
  });
}

/** The move condition: is `params` a legal answer to the slot on offer? */
export function isValidNewChoicesAnswer(state: RiftboundGameState, choice: NewChoicesChoice, params: Record<string, unknown>, ctx: NewChoicesContext): boolean {
  if (params.playerId !== choice.playerId) {
    return false;
  }
  if (params.keepAll === true || params.keep === true || params.accept === false) {
    return choice.keepable;
  }
  const picked = keysFromParams(choice, params);
  if (!picked) {
    return false;
  }
  const keys = optionKeysOf(choice);
  if (new Set(picked).size !== picked.length || !picked.every((k) => keys.includes(k))) {
    return false;
  }
  if (picked.length < choice.min || picked.length > choice.max) {
    return false;
  }
  const d = discoveryFor(state, choice, ctx);
  const slot = d ? discoverSlots(d)[choice.cursor] : undefined;
  if (!slot) {
    return false;
  }
  const values = picked.map((k) => choice.options.find((o) => o.key === k)?.cardId ?? k) as string[];
  // Naming exactly the current value(s) again is always legal (it keeps them).
  const same = values.length === slot.current.length && values.every((v) => slot.current.includes(v));
  if (same) {
    return true;
  }
  return slot.validate ? slot.validate(values) : true;
}

/** The move enumerator: one variant per single option (every subset for a short set) plus keep / keep-all. */
export function enumerateNewChoicesAnswers(choice: NewChoicesChoice): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const playerId = choice.playerId;
  if (choice.max <= 1) {
    for (const o of choice.options) {
      out.push({
        label: o.current ? `Keep ${o.label}` : o.label,
        pickedKeys: [o.key],
        playerId,
        ...(o.cardId !== undefined ? { pickedCardId: o.cardId } : {}),
      });
    }
  } else {
    const keys = choice.options.map((o) => o.key);
    let subsets: string[][] = [[]];
    if (keys.length <= 5) {
      for (const k of keys) {
        subsets = [...subsets, ...subsets.map((s) => [...s, k])];
      }
    } else {
      subsets = [[], ...keys.map((k) => [k])];
    }
    for (const s of subsets) {
      if (s.length < choice.min || s.length > choice.max) {
        continue;
      }
      out.push({
        label: s.length > 0 ? s.map((k) => choice.options.find((o) => o.key === k)?.label ?? k).join(" + ") : "No targets",
        pickedKeys: s,
        playerId,
      });
    }
  }
  if (choice.keepable) {
    out.push({ keep: true, label: "Keep current choice", playerId });
    out.push({ keepAll: true, label: "Keep all remaining choices", playerId });
  }
  return out;
}

/**
 * The move reducer: apply a (validated) answer to the slot on offer and move
 * the dialog on. `pendingChoice` is the next slot, or cleared when done.
 */
export function applyNewChoicesAnswer(draftLike: unknown, choice: NewChoicesChoice, params: Record<string, unknown>, ctx: NewChoicesContext): void {
  const draft = draftLike as RiftboundGameState;
  const mark = (status: NewChoiceSlotState["status"], current?: readonly string[]): NewChoicesChoice =>
    ({
      ...choice,
      slots: choice.slots.map((s, i) => (i === choice.cursor ? { ...s, ...(current ? { current: [...current] } : {}), status } : s)),
    }) as NewChoicesChoice;
  if (params.keepAll === true) {
    draft.pendingChoice = undefined;
    return;
  }
  if (params.keep === true || params.accept === false) {
    advance(draft, mark("kept"), ctx, choice.cursor + 1);
    return;
  }
  const picked = keysFromParams(choice, params) ?? [];
  const d = discoveryFor(draft, choice, ctx);
  const slot = d ? discoverSlots(d)[choice.cursor] : undefined;
  if (!d || !slot) {
    draft.pendingChoice = undefined;
    return;
  }
  const values = picked.map((k) => choice.options.find((o) => o.key === k)?.cardId ?? k) as string[];
  const same = values.length === slot.current.length && values.every((v) => slot.current.includes(v));
  if (same) {
    // rule 751.1 — re-naming what was already chosen is not a new choice: no
    // trigger, no cost; the slots depending on it are still offered.
    advance(draft, mark("renamed"), ctx, choice.cursor + 1);
    return;
  }
  commitValues(draft, choice, ctx, slot, values);
  advance(draft, mark("changed", values), ctx, choice.cursor + 1);
}
