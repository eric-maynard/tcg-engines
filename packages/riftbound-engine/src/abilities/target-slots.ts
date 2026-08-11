/**
 * Multi-target SLOTS of a chain item (rules 355.12–355.14, 402.2).
 *
 * A triggered / activated ability whose instruction names a VARIABLE number of
 * Game Objects — "deal 5 damage split among any number of enemy units here"
 * (355.14), "buff up to two other friendly units", "move any number of your
 * token units here" (355.13) — chooses that SET while the item is finalized on
 * the Chain (355.14.b / 402.2), exactly like a single target: responders see
 * it, [Deflect] is charged per chosen object (809.1.c) and "when you choose me"
 * fires for each (355.14.d). Only what is DONE with the set waits for
 * resolution — the division of split damage (355.14.e), or simply acting on
 * whichever chosen objects are still legal (359.3.e.5; never a newcomer,
 * 355.15).
 *
 * The legacy `item.targets` list is flat and positional (one id per single
 * caster-chosen descriptor slot). A variable-length pick cannot ride there
 * unambiguously, so each such node of the effect tree is a SLOT: its bound ids
 * are recorded on `item.targetSlots[]` (structured, for the harness / counters
 * / UI), stamped onto the effect node itself as `_bound` (so whichever handler
 * executes that node — top level, sequence step, conditional branch, prompt
 * re-entry — reads exactly its own set), and appended to `item.targets` for
 * everything that counts or tracks "the targets of a chain item" (Repulse's
 * "chooses it and no other friendly unit", 359.3.e.2 new-object tracking).
 * `executeResolvedItem` strips the slot ids off the positional list again
 * before handing it to the effect as `boundTargets`.
 *
 * Runes are on the board too (rule 355.9.a, and the 355.10.f example "Recycle a
 * rune you control" TARGETS one), so "ready up to N runes" is a slot like any
 * other — a rune channelled after the item was finalized can never be one of
 * them. Private-zone picks keep their resolution-time prompt (hidden
 * information); so do `spend-buff` ("spend any number of buffs" is a payment)
 * and Might-referencing splits (Alpha Strike is a spell and names its set at
 * play time).
 * Leaf module: must not import move definitions.
 */
import type { CardId as CoreCardId } from "@tcg/core";
import type { ChainItem, ChainTargetSlot } from "../chain/chain-state";
import type { RiftboundGameState } from "../types";
import type { EffectContext, ExecutableEffect } from "./effect-executor";
import type { TargetDescriptor } from "./target-resolver";
import { resolveTarget } from "./target-resolver";

// biome-ignore lint/suspicious/noExplicitAny: effect nodes are loosely typed JSON
type AnyEffect = Record<string, any>;

/** One discoverable multi-pick node of an effect tree. */
export interface MultiPickSlot {
  /** Dotted path from the item's effect root ("" = the root itself, "effects.1", "then.effects.0"). */
  readonly path: string;
  readonly node: AnyEffect;
  readonly descriptor: TargetDescriptor;
  readonly semantics: "split" | "upTo";
  /** Printed cap: N for "up to N", undefined for "any number" / split (capped by damage). */
  readonly cap?: number;
}

const PRIVATE_LOCATIONS: readonly string[] = ["hand", "deck", "trash", "banishment", "anywhere"];
/** rule 355.16 — conditions only an earlier instruction of the SAME resolution answers. */
const RESOLUTION_DETERMINED_CONDITIONS: readonly string[] = ["discarded-card-type"];
/** Instructions whose "any number"/"up to" set is a payment or gathers its own candidates. */
const SELF_GATHERING_STEPS: readonly string[] = ["spend-buff", "play", "look", "reveal", "discard", "recycle", "predict"];

function multiQuantityCap(q: unknown): { multi: boolean; cap?: number } {
  if (q === "any") {
    return { multi: true };
  }
  if (typeof q === "object" && q !== null && typeof (q as { upTo?: unknown }).upTo === "number") {
    return { cap: (q as { upTo: number }).upTo, multi: true };
  }
  return { multi: false };
}

/** Whether `node` is a variable-count caster choice that is finalized as a slot. */
function slotShapeOf(node: AnyEffect): Omit<MultiPickSlot, "path" | "node"> | undefined {
  const target = node.target;
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    return undefined;
  }
  const t = target as TargetDescriptor & { chooseAtResolution?: boolean };
  if (node.chooseAtResolution === true || t.chooseAtResolution === true) {
    return undefined;
  }
  if (typeof t.type !== "string" || ["self", "trigger-source", "player", "battlefield", "pending-value", "card"].includes(t.type)) {
    return undefined;
  }
  if (typeof t.location === "string" && PRIVATE_LOCATIONS.includes(t.location)) {
    return undefined;
  }
  if ((node.from !== undefined && node.from !== "here") || SELF_GATHERING_STEPS.includes(String(node.type))) {
    return undefined;
  }
  // rule 422.1.a / 355.10.e — instructions another player performs choose nothing here.
  if (node.player === "each" || node.player === "each-other" || node.player === "opponent") {
    return undefined;
  }
  // rule 355.14 — split damage: every recipient is a target (355.14.a). A
  // Might-referencing split ("It deals damage equal to its Might split among…")
  // names its reference unit first and keeps the legacy [reference, …targets]
  // encoding (spells only today).
  if (node.type === "damage" && node.split === true) {
    const might = (node.amount as { might?: unknown } | undefined)?.might;
    if (typeof might === "object" && might !== null) {
      return undefined;
    }
    if (t.quantity !== undefined && t.quantity !== "all" && !multiQuantityCap(t.quantity).multi) {
      return undefined;
    }
    return { cap: multiQuantityCap(t.quantity).cap, descriptor: t, semantics: "split" };
  }
  const { multi, cap } = multiQuantityCap(t.quantity);
  if (!multi) {
    return undefined;
  }
  return { cap, descriptor: t, semantics: "upTo" };
}

/** Whether this effect node names a variable-count set that is finalized as a slot. */
export function isMultiPickNode(node: unknown): boolean {
  return typeof node === "object" && node !== null && !Array.isArray(node) && slotShapeOf(node as AnyEffect) !== undefined;
}

/**
 * Every multi-pick slot of `effect`, in execution order: the effect itself, the
 * steps of (nested) sequences, the branches of a conditional and the body of an
 * `optional`. Delayed triggers, reflexive follow-ups, modes and per-object loops
 * are their own items / resolution-time affairs and are not descended into.
 */
export function collectMultiPickSlots(effect: unknown, path = "", out: MultiPickSlot[] = []): MultiPickSlot[] {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    return out;
  }
  const node = effect as AnyEffect;
  const join = (p: string, k: string): string => (p === "" ? k : `${p}.${k}`);
  if (node.type === "sequence" && Array.isArray(node.effects)) {
    node.effects.forEach((sub: unknown, i: number) => collectMultiPickSlots(sub, join(path, `effects.${i}`), out));
    return out;
  }
  if (node.type === "conditional") {
    // rule 355.16 (unl-080-219 Hwei) — a branch selected by something an EARLIER
    // instruction of this same item produces (the discarded card's type) is not
    // known while the item is finalized, so nothing inside it may be pre-locked;
    // its picks happen as that branch resolves.
    if (RESOLUTION_DETERMINED_CONDITIONS.includes(String((node.condition as AnyEffect | undefined)?.type))) {
      return out;
    }
    collectMultiPickSlots(node.then, join(path, "then"), out);
    collectMultiPickSlots(node.else, join(path, "else"), out);
    return out;
  }
  if (node.type === "optional") {
    collectMultiPickSlots(node.effect, join(path, "effect"), out);
    return out;
  }
  const shape = slotShapeOf(node);
  if (shape) {
    out.push({ ...shape, node, path });
  }
  return out;
}

/** The node at dotted `path` below `root` (undefined when the tree changed shape). */
export function nodeAtPath(root: unknown, path: string): AnyEffect | undefined {
  let cur: unknown = root;
  for (const key of path === "" ? [] : path.split(".")) {
    if (!cur || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as AnyEffect)[key];
  }
  return cur && typeof cur === "object" ? (cur as AnyEffect) : undefined;
}

/** True when the effect node already carries its finalization-time set. */
export function isSlotBound(node: unknown): boolean {
  return typeof node === "object" && node !== null && Array.isArray((node as { _bound?: unknown })._bound);
}

function chainItemsOf(draft: unknown): ChainItem[] | undefined {
  return (draft as RiftboundGameState).interaction?.chain?.items as ChainItem[] | undefined;
}

/**
 * Record slot `path` of chain item `itemId` as chosen: `ids` go onto the
 * matching `targetSlots` entry, are appended to the flat `targets`, and are
 * stamped as `_bound` on a private deep copy of the effect (the stored effect is
 * frequently the card definition's own frozen object, shared by every copy of
 * the trigger — rule 808.2 copies choose independently).
 */
export function bindTargetSlot(draftLike: unknown, itemId: string, path: string, ids: readonly string[]): ChainItem | undefined {
  const items = chainItemsOf(draftLike);
  const idx = items?.findIndex((it) => it.id === itemId) ?? -1;
  if (!items || idx < 0) {
    return undefined;
  }
  const item = items[idx] as ChainItem;
  const effect = item.effect === undefined ? undefined : (JSON.parse(JSON.stringify(item.effect)) as AnyEffect);
  const node = effect === undefined ? undefined : nodeAtPath(effect, path);
  if (node) {
    node._bound = [...ids];
  }
  const slots = (item.targetSlots ?? []).map((s) => (s.slot === path ? { ...s, ids: [...ids] } : s));
  const next: ChainItem = {
    ...item,
    ...(effect !== undefined ? { effect } : {}),
    targetSlots: slots,
    targets: [...(item.targets ?? []), ...ids],
  };
  items[idx] = next;
  return next;
}

/**
 * The positional (single-descriptor) part of a chain item's `targets`: the ids
 * its slots appended are removed again (from the end, one occurrence each), so
 * effect handlers receive `boundTargets` exactly as before slots existed.
 * Undefined when nothing positional is left.
 */
export function stripSlotIds(
  targets: readonly string[] | undefined,
  slots: readonly ChainTargetSlot[] | undefined,
): readonly string[] | undefined {
  if (!targets) {
    return undefined;
  }
  if (!slots || slots.length === 0) {
    return targets;
  }
  const out = [...targets];
  for (const slot of slots) {
    for (const id of slot.ids ?? []) {
      const at = out.lastIndexOf(id);
      if (at >= 0) {
        out.splice(at, 1);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Copy `effect`, rewriting every `_bound` list through `fn` (e.g. dropping reborn objects, 359.3.e.2). */
export function mapBoundNodes<T>(effect: T, fn: (ids: readonly string[]) => readonly string[]): T {
  if (effect === null || typeof effect !== "object") {
    return effect;
  }
  if (Array.isArray(effect)) {
    return effect.map((e) => mapBoundNodes(e, fn)) as unknown as T;
  }
  const out: AnyEffect = { ...(effect as AnyEffect) };
  for (const [key, value] of Object.entries(out)) {
    if (key === "_bound" && Array.isArray(value)) {
      out._bound = [...fn(value as string[])];
      continue;
    }
    if (value !== null && typeof value === "object") {
      out[key] = mapBoundNodes(value, fn);
    }
  }
  return out as T;
}

/**
 * rule 359.3.e.4–5 / 359.3.f.2 / 355.15 — of the objects bound on this node at
 * finalization, those that STILL satisfy its descriptor as it reads now ("an
 * enemy unit here" after a Flash, "can't be chosen" once out of combat again).
 * Illegal ones are dropped and never replaced; undefined when the node is not
 * slot-bound at all.
 */
export function legalBoundIds(effect: ExecutableEffect, ctx: EffectContext): string[] | undefined {
  const bound = (effect as { _bound?: readonly string[] })._bound;
  if (!Array.isArray(bound)) {
    return undefined;
  }
  if (bound.length === 0 || typeof effect.target !== "object" || effect.target === null) {
    return [];
  }
  const pool = resolveTarget({ ...(effect.target as TargetDescriptor), quantity: "all" }, {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sameZone: ctx.sameZone,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    triggerSourceId: ctx.triggerSourceId,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1]) as string[];
  return bound.filter((id) => pool.includes(id));
}

/**
 * The objects slot `slot` may name right now (its descriptor with `choosing`, so
 * "can't be chosen by enemy spells and abilities" is honoured — 757/758), less
 * the ones a fixed "to here" move could not move at all (355.4.a).
 */
export function slotCandidates(
  slot: Pick<MultiPickSlot, "descriptor" | "node">,
  ctx: EffectContext,
): string[] {
  let options = resolveTarget({ ...slot.descriptor, quantity: "all" }, {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    triggerSourceId: ctx.triggerSourceId,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1]) as string[];
  if (slot.node.type === "move" && slot.node.to === "here") {
    const here = ctx.sourceZone;
    if (!(here ?? "").startsWith("battlefield-")) {
      return [];
    }
    options = options.filter((id) => ctx.zones.getCardZone(id as CoreCardId) !== here);
  }
  if (slot.node.type === "move" && slot.node.to === "base") {
    options = options.filter((id) => ctx.zones.getCardZone(id as CoreCardId) !== "base");
  }
  return options;
}
