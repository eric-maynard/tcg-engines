/**
 * The Make Relevant Choices step — step 2 of playing a card (349 / 355.1–355.16)
 * and of finalizing an ability (402.2) — as ONE enumerator over an item's effect
 * tree.
 *
 * Before this module every kind of choice discovered its own timing separately:
 * modes in `play-time-modes.ts`, Move Destinations in `play-time-destinations.ts`,
 * variable-count sets in `abilities/target-slots.ts`, single targets as `targets`
 * params threaded through the play move. Nothing said, in one place and in rules
 * order, WHICH choices a card needs and WHEN each is made — so the same question
 * ("finalization or resolution?") was re-argued per card, and a descriptor nested
 * under `move.then` ("Move a friendly unit. You may attach an Equipment to it")
 * had no play-time slot at all and was silently deferred.
 *
 * The adjudication this encodes is written up once in
 * `.claude/skills/riftbound-rules/DESIGN.md` § "Choices and when they are made";
 * do not re-derive it per card. In short: a specific Game Object the item's own
 * text tells its CONTROLLER to choose is chosen in this step and locked (355.15),
 * and a choice reaches resolution only by matching one of 355.10's closed list of
 * carve-outs (a/b/c/d/e/f), 355.5.b (a trigger this item generates) or 355.16 (it
 * depends on what an earlier instruction of the same resolution produces). "You
 * may <verb> a <descriptor>" defers the DECISION, never the object (355.12).
 *
 * Plan order is ASK order, not the CR's numbering: modes (355.3), then the
 * objects (355.5), then the Move Destinations (355.4), then what is genuinely
 * left for resolution. 355.4 asks for a destination "for each Move that WILL BE
 * PERFORMED", which presupposes the mover, so the object choice has to come
 * first; the CR numbers list the contents of the step, they do not sequence
 * choices that depend on one another.
 *
 * Leaf module: must not import move definitions.
 */

import { collectMultiPickSlots } from "../../../abilities/target-slots";
import { collectDestinationNodes } from "./play-time-destinations";
import { collectChoiceNodes } from "./play-time-modes";

// biome-ignore lint/suspicious/noExplicitAny: effect nodes are loosely typed JSON
type AnyEffect = Record<string, any>;

/**
 * When the choice is made.
 * - `PLAY` — named as a parameter of the play/activate move itself (the caster
 *   picks it in the action menu, before the item reaches the chain).
 * - `FIN`  — made while the item is finalized on the chain, before anyone
 *   receives priority (355.1–355.5 / 402.2). Locked there (355.15).
 * - `RES`  — genuinely made as the item resolves, by one of 355.10's carve-outs.
 *
 * `PLAY` and `FIN` are the same rules step; they differ only in which engine
 * surface collects the answer, and both are locked by 355.15.
 */
export type ChoiceTiming = "PLAY" | "FIN" | "RES";

export type ChoiceKind =
  /** rule 355.3 — a "Choose one —" menu. */
  | "mode"
  /** rule 355.5 — one specific Game Object. */
  | "target"
  /** rule 355.13 / 355.14.b — an "up to N" / "any number" / split SET. */
  | "target-set"
  /** rule 355.4 — a Move Destination. */
  | "destination"
  /** rule 355.14.e — how much of a split each already-chosen target takes. */
  | "split-amounts"
  /** rule 355.11.b — re-picking a legal subset when a group restriction broke. */
  | "subset";

export interface ChoiceEntry {
  /** Dotted path from the item's effect root ("" = the root itself). */
  readonly path: string;
  /** Which key of the node at `path` carries the descriptor ("target", "equipment", …). */
  readonly role: string;
  readonly kind: ChoiceKind;
  readonly timing: ChoiceTiming;
  /** The CR rule that puts this choice at this timing — cite it in prompts and tests. */
  readonly rule: string;
  /**
   * rule 355.13 — "up to N" / "any number": zero objects is a legal answer, so
   * the choice never gates the play. NOT set by a "you may" — see
   * `actionOptional`.
   */
  readonly optional: boolean;
  /**
   * rule 355.12 — the instruction is a "you may <verb> …": its DECISION waits
   * for resolution (383.3.a.3), but the object is chosen now and gates the play
   * like any other target. Raisers use this to offer a decline on the ACTION,
   * never on the choice.
   */
  readonly actionOptional: boolean;
  /**
   * rule 355.8 / 402.3 — a REQUIRED choice: with no legal option the item is not
   * a legal play at all and must be absent from the offered set (not offered and
   * then rejected). False for every `RES` entry and every optional one.
   */
  readonly gating: boolean;
  readonly descriptor?: AnyEffect;
  /** Printed cap of an "up to N" set; undefined for "any number" / a split. */
  readonly cap?: number;
  /** True when the entry names a variable-count SET rather than one object. */
  readonly multi: boolean;
}

/** rule 355.10.a.1 — the Public zones. An object anywhere else is not targeted. */
const PUBLIC_LOCATIONS: readonly string[] = [
  "battlefield",
  "base",
  "here",
  "trash",
  "legend",
  "champion",
  "facedown",
  "board",
];
/** rule 355.10.a — a pick from one of these is made as the item RESOLVES. */
const PRIVATE_LOCATIONS: readonly string[] = ["hand", "deck", "banishment", "anywhere"];

/**
 * Descriptor-bearing keys of an effect node, in the order the printed text reads
 * them. `equipment`/`holder`/`to` are the attach roles (434), `attacker`/
 * `defender` the fight roles, `target1`/`target2` the swap roles, `reference`
 * the Might comparand.
 */
const DESCRIPTOR_ROLES: readonly string[] = [
  "target",
  "target1",
  "target2",
  "reference",
  "equipment",
  "attacker",
  "defender",
];

/** Descriptor `type`s that name a fixed referent, so nobody CHOOSES them (355.10.d.1). */
const FIXED_REFERENTS: readonly string[] = ["self", "trigger-source", "pending-value"];

/** rule 355.16 — a branch whose condition only an earlier instruction of THIS resolution answers. */
const RESOLUTION_DETERMINED_CONDITIONS: readonly string[] = ["discarded-card-type"];

function isDescriptor(value: unknown): value is AnyEffect {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

const join = (p: string, k: string): string => (p === "" ? k : `${p}.${k}`);

/** rule 355.13 — "any number" / "up to N" (zero is a legal answer); its printed cap. */
function multiOf(quantity: unknown): { multi: boolean; cap?: number } {
  if (quantity === "any") {
    return { multi: true };
  }
  if (typeof quantity === "object" && quantity !== null && typeof (quantity as { upTo?: unknown }).upTo === "number") {
    return { cap: (quantity as { upTo: number }).upTo, multi: true };
  }
  return { multi: false };
}

/**
 * Why this descriptor is NOT chosen by the item's controller in the Make Choices
 * step, as a rule reference — or undefined when it IS. Encodes 355.10's closed
 * list; nothing else may defer a choice.
 */
function deferralRule(node: AnyEffect, descriptor: AnyEffect): string | undefined {
  // rule 355.10.d.1 — a fixed referent ("me", the triggering unit, the value an
  // earlier step produced) is never a choice at all.
  if (FIXED_REFERENTS.includes(String(descriptor.type))) {
    return "355.10.d.1";
  }
  // rule 355.10.b — a battlefield named only to restrict another choice is not
  // itself chosen; one the text tells you to CHOOSE is (355.10.b's second
  // example), and that form carries its own filter or a `quantity`.
  if (descriptor.type === "player") {
    return "355.10.d";
  }
  // rule 355.10.f — an instruction a player "must" complete; the engine marks
  // these `chooseAtResolution`.
  if (node.chooseAtResolution === true || descriptor.chooseAtResolution === true) {
    return "355.10.f";
  }
  // rule 355.10.e — a set chosen wholly or partly by other players.
  if (node.player === "each" || node.player === "each-other" || node.player === "opponent") {
    return "355.10.e";
  }
  // rule 355.10.a — the object sits in a zone whose information status is not
  // Public. Trashes, bases, battlefields and the Legend/Champion/Facedown zones
  // ARE public (355.10.a.1), so a pick from them is an ordinary target.
  if (typeof descriptor.location === "string" && PRIVATE_LOCATIONS.includes(descriptor.location)) {
    return "355.10.a";
  }
  if (
    typeof node.from === "string" &&
    PRIVATE_LOCATIONS.includes(node.from) &&
    !PUBLIC_LOCATIONS.includes(String(descriptor.location))
  ) {
    return "355.10.a";
  }
  // rule 355.10.d — programmatic: the object set is the whole of a description
  // rather than a selection from it. 355.10.d.2 keeps a SOLE legal option a
  // choice, so only `quantity: "all"` lands here, never a short candidate list.
  if (descriptor.quantity === "all") {
    return "355.10.d";
  }
  if (node.type === "for-each") {
    return "355.10.d";
  }
  return undefined;
}

function entryFor(path: string, role: string, node: AnyEffect, descriptor: AnyEffect): ChoiceEntry {
  const deferred = deferralRule(node, descriptor);
  const { multi, cap } = multiOf(descriptor.quantity);
  // rule 355.12 — "You may attach an Equipment …" / "You may move a friendly
  // unit …": the choice is made independently of the decision to perform the
  // action, so a "you may" does NOT make the object optional and does NOT
  // excuse it from 355.8. Only 355.13's "up to N" / "any number" may be
  // answered with nothing.
  const optional = multi;
  return {
    actionOptional: node.optional === true,
    ...(cap !== undefined ? { cap } : {}),
    descriptor,
    // rule 355.8 / 402.3 — only a REQUIRED, made-now choice gates the play.
    gating: deferred === undefined && !optional,
    kind: multi ? "target-set" : "target",
    multi,
    optional,
    path,
    role,
    // rule 355.5 / 402.2 — chosen in the Make Choices step unless 355.10 says
    // otherwise; 355.14.b says the same for a split's recipients.
    rule: deferred ?? (multi ? "355.13" : "355.5"),
    timing: deferred === undefined ? "FIN" : "RES",
  };
}

/**
 * Whether a `then` follow-up reads the units standing AT the destination, so the
 * destination cannot be frozen at play time.
 *
 * rule-id ogn-258-298 (ruling 25b00b80ac336276) — Dragon's Rage "Move an enemy
 * unit. Then do this: Choose another enemy unit at its destination." The
 * follow-up's candidates are whoever stands there when the spell RESOLVES, so a
 * response that rearranges the board must be able to change what the caster can
 * pick — both the destination and that follow-up's own object stay at RES.
 * `play-time-destinations.ts` already keeps the destination open for this shape;
 * the same test decides the nested object.
 */
function readsTheDestination(effect: unknown): boolean {
  if (Array.isArray(effect)) {
    return effect.some((e) => readsTheDestination(e));
  }
  if (!effect || typeof effect !== "object") {
    return false;
  }
  const node = effect as AnyEffect;
  if ((node.location === "same" || node.location === "move-to-or-from") && node.quantity !== "all") {
    return true;
  }
  return Object.values(node).some((v) => readsTheDestination(v));
}

/**
 * Every caster-chosen descriptor of `effect`, in execution order, INCLUDING the
 * ones nested under a `then` follow-up.
 *
 * The `then` descent is the capability that was missing: a spell may name more
 * than one object, and a second object printed as a follow-up clause ("Move a
 * friendly unit. You may attach an Equipment with the same controller TO IT",
 * sfd-184-221) is a Relevant Choice of playing the card exactly like the first
 * (355.5 + 355.12 — "you may" defers the decision, not the object). Only a
 * follow-up that reads the move's destination stays at resolution.
 */
export function collectDescriptorEntries(effect: unknown, path = "", out: ChoiceEntry[] = []): ChoiceEntry[] {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    return out;
  }
  const node = effect as AnyEffect;
  if (node.type === "sequence" && Array.isArray(node.effects)) {
    node.effects.forEach((sub: unknown, i: number) => collectDescriptorEntries(sub, join(path, `effects.${i}`), out));
    // rule 355.8 (unl-198-219 Moonfall) — a sequence may carry its OWN target
    // ("Choose a battlefield where you have units. …there…"): the anchor every
    // step reads is a choice of the sequence itself, made after its steps' own
    // objects only in path order, never dropped.
    if (isDescriptor(node.target)) {
      out.push(entryFor(path, "target", node, node.target));
    }
    return out;
  }
  if (node.type === "conditional") {
    // rule 355.16 (unl-080-219 Hwei) — a branch selected by what an EARLIER
    // instruction of this same item produces is not known yet, so nothing inside
    // it may be pre-locked.
    if (RESOLUTION_DETERMINED_CONDITIONS.includes(String((node.condition as AnyEffect | undefined)?.type))) {
      return out;
    }
    collectDescriptorEntries(node.then, join(path, "then"), out);
    collectDescriptorEntries(node.else, join(path, "else"), out);
    return out;
  }
  if (node.type === "optional") {
    collectDescriptorEntries(node.effect, join(path, "effect"), out);
    return out;
  }
  // rule 355.3 — a mode's own instructions only exist once the mode is picked,
  // so they are enumerated by `modeChoiceEntries` after the mode, not here.
  if (node.type === "choice") {
    return out;
  }
  // rule 355.5.b — a delayed / reflexive trigger this item GENERATES makes its
  // own choices when that ability is finalized, never now.
  if (node.type === "delayed-trigger" || node.type === "reflexive-trigger") {
    return out;
  }
  for (const role of DESCRIPTOR_ROLES) {
    const descriptor = node[role];
    if (isDescriptor(descriptor)) {
      out.push(entryFor(path, role, node, descriptor));
    }
  }
  // The follow-up clause. Its objects belong to the same play (355.5) unless the
  // clause reads the move's destination (ogn-258-298).
  if (node.then !== undefined && !readsTheDestination(node.then)) {
    collectDescriptorEntries(node.then, join(path, "then"), out);
  }
  return out;
}

/** rule 355.3 — one entry per "Choose one —" menu, in execution order. */
function modeChoiceEntries(effect: unknown): ChoiceEntry[] {
  return collectChoiceNodes(effect).map((node, index) => ({
    gating: node.player === undefined,
    actionOptional: false,
    kind: "mode" as const,
    multi: false,
    optional: false,
    path: `choice.${index}`,
    role: "options",
    // rule 355.10.e — "each other player chooses" menus belong to that player,
    // at resolution.
    rule: node.player === undefined ? "355.3" : "355.10.e",
    timing: node.player === undefined ? ("FIN" as const) : ("RES" as const),
  }));
}

/** rule 355.4 — one entry per Move the item will perform whose destination its controller chooses. */
function destinationEntries(effect: unknown): ChoiceEntry[] {
  return collectDestinationNodes(effect).map((node, index) => ({
    actionOptional: node.optional === true,
    gating: false, // 355.4.a / 359.3.e.6 — no valid location just skips the move
    kind: "destination" as const,
    multi: false,
    optional: node.optional === true,
    path: `destination.${index}`,
    role: "to",
    rule: "355.4",
    timing: "FIN" as const,
  }));
}

/**
 * rule 355.14.e / 355.14.h — the DIVISION of a split is the one thing about a
 * split that waits for resolution; its recipients were chosen at finalization
 * (355.14.b).
 */
function splitAmountEntries(effect: unknown): ChoiceEntry[] {
  return collectMultiPickSlots(effect)
    .filter((slot) => slot.semantics === "split")
    .map((slot) => ({
      actionOptional: false,
      gating: false,
      kind: "split-amounts" as const,
      multi: true,
      optional: false,
      path: slot.path,
      role: "amount",
      rule: "355.14.e",
      timing: "RES" as const,
    }));
}

/** Ask order within one timing: modes (355.3), objects (355.5), destinations (355.4). */
const KIND_ORDER: Record<ChoiceKind, number> = {
  destination: 2,
  mode: 0,
  "split-amounts": 3,
  subset: 4,
  target: 1,
  "target-set": 1,
};
const TIMING_ORDER: Record<ChoiceTiming, number> = { FIN: 1, PLAY: 0, RES: 2 };

/**
 * The complete, ordered Make-Choices plan for one item's effect: every choice the
 * card needs, in ask order, each tagged with when it is made and the rule that
 * put it there.
 *
 * This is the single answer to "what does this card ask, and when" — the raisers
 * (`play-time-modes.ts`, `play-time-destinations.ts`, `abilities/target-slots.ts`)
 * and the harness `Decision.timing` all describe the same plan.
 */
export function collectChoicePlan(effect: unknown): ChoiceEntry[] {
  const entries = [
    ...modeChoiceEntries(effect),
    ...collectDescriptorEntries(effect),
    ...destinationEntries(effect),
    ...splitAmountEntries(effect),
  ];
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const t = TIMING_ORDER[a.entry.timing] - TIMING_ORDER[b.entry.timing];
      if (t !== 0) {
        return t;
      }
      const k = KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind];
      return k !== 0 ? k : a.index - b.index;
    })
    .map(({ entry }) => entry);
}

/** The plan's entries that are made in the Make Choices step (355.1–355.5 / 402.2). */
export function madeAtFinalization(effect: unknown): ChoiceEntry[] {
  return collectChoicePlan(effect).filter((e) => e.timing !== "RES");
}

/**
 * rule 355.8 / 402.3 — the REQUIRED choices of this item: with no legal option
 * for any one of them the item is not a legal play and must never be offered.
 * "Up to N" / "any number" is answered with zero (355.13), so it is not here.
 */
export function gatingChoices(effect: unknown): ChoiceEntry[] {
  return collectChoicePlan(effect).filter((e) => e.gating);
}

/**
 * A caster-chosen descriptor nested under a `then` follow-up, with the path of
 * the node that carries it — the play-time slot that did not exist before.
 * Sequence steps and the item's own root descriptors are excluded: those already
 * ride on the positional `targets` list.
 */
export interface NestedDescriptorSlot {
  readonly path: string;
  readonly role: string;
  readonly descriptor: AnyEffect;
  readonly optional: boolean;
  readonly gating: boolean;
}

/**
 * Every caster-chosen descriptor of `effect` that sits UNDER a `then` follow-up
 * (at any depth). These are the objects a card names in a follow-up clause —
 * sfd-184-221 Relentless Pursuit's Equipment, ogn-262-298 Zenith Blade's mover
 * — which have no positional slot on `item.targets` and were therefore either
 * picked for the player or deferred to resolution.
 */
export function collectNestedDescriptorSlots(effect: unknown): NestedDescriptorSlot[] {
  const out: NestedDescriptorSlot[] = [];
  const walk = (node: unknown, path: string, underThen: boolean): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    if (underThen) {
      for (const entry of collectDescriptorEntries(node, path)) {
        if (entry.timing === "FIN" && entry.descriptor !== undefined) {
          out.push({
            descriptor: entry.descriptor,
            gating: entry.gating,
            optional: entry.optional,
            path: entry.path,
            role: entry.role,
          });
        }
      }
      return;
    }
    const n = node as AnyEffect;
    if (n.type === "sequence" && Array.isArray(n.effects)) {
      n.effects.forEach((sub: unknown, i: number) => walk(sub, join(path, `effects.${i}`), false));
      return;
    }
    // A conditional's `then` is a BRANCH, not a follow-up clause — descend into
    // both branches looking for their own follow-ups instead.
    if (n.type === "conditional") {
      walk(n.then, join(path, "then"), false);
      walk(n.else, join(path, "else"), false);
      return;
    }
    if (n.type === "optional") {
      walk(n.effect, join(path, "effect"), false);
      return;
    }
    if (n.then !== undefined && !readsTheDestination(n.then)) {
      walk(n.then, join(path, "then"), true);
    }
  };
  walk(effect, "", false);
  return out;
}
