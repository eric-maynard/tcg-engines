/**
 * Static cost-reduction at deduction-time (rule 466 — cost modification).
 *
 * Some permanents grant a CONTINUOUS cost-reduction to cards the controller
 * plays — e.g. Eager Apprentice's
 *     "While I'm at a battlefield, the Energy costs for spells you play is
 *      reduced by [1], to a minimum of [1]."
 * or Slugger / Noxus Hopeful's static "I cost [N] less" reductions, or
 * Forgotten-Monument-style "your spells cost less while …" auras.
 *
 * These don't run through triggers — they're STATIC abilities that modify
 * cost AT PLAY TIME. The cost-deduction path in `cards.ts#deductCost` /
 * `cards.ts#canAffordCard` must scan the player's permanents for such
 * statics and apply the matching reductions BEFORE checking affordability.
 *
 * The implementation is generic: NO per-card if-statements. Any permanent
 * whose registry abilities contain a `{type:"static", effect:{type:
 * "cost-reduction", target:{...}, by|reduction|amount, minimum?}}` opts in
 * by virtue of being on the board.
 *
 * Minimum clamping: per-rule, each cost-reduction static may carry its own
 * `minimum` floor. When multiple reductions apply, the final effective
 * cost is clamped to `max(printedCost - totalReduction, max(minimums))`.
 * Reductions whose minimum > effective cost contribute nothing further but
 * cannot raise the cost above the printed value.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";
import { evaluateCondition } from "../abilities/static-abilities";

/**
 * Minimal context for the static cost-reduction scan. A subset of what
 * `static-abilities.ts` already uses — we reuse its condition evaluator so
 * gating like `while-at-battlefield` / `while-mighty` / `control-battlefield`
 * Just Works without duplicating logic.
 */
export interface CostReductionContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (
      zoneId: CoreZoneId,
      playerId?: CorePlayerId,
    ) => readonly CoreCardId[];
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}

/**
 * Returned shape: the total energy reduction the player's permanents apply
 * to a single play of `playedCardId`, plus the binding floor (max of all
 * matching statics' `minimum` values) and any waived power pips per domain
 * (`rainbow` = a pip of any domain).
 *
 * Callers apply: `effective = max(printed - reduction, max(minimum, 0))`,
 * BUT must also never go below zero (energy costs can't be negative).
 */
export interface StaticCostReduction {
  readonly reduction: number;
  readonly minimum: number;
  readonly power: Partial<Record<string, number>>;
}

const RUNE_TOKEN_RE = /:rb_rune_(fury|calm|mind|body|chaos|order|rainbow):|\[(fury|calm|mind|body|chaos|order|rainbow)\]/gi;
const ENERGY_TOKEN_RE = /:rb_energy_(\d+):|\[(\d+)\]/g;

/**
 * rule-id: ven-055-166 — decode a parser-emitted cost amount. The parser
 * keeps printed cost glyphs as a token string (`":rb_energy_1::rb_rune_rainbow:"`);
 * hand-authored abilities may use a bare number or `{energy, power[]}`.
 */
export function decodeCostAmount(raw: unknown): { energy: number; power: Partial<Record<string, number>> } {
  const power: Partial<Record<string, number>> = {};
  if (typeof raw === "number") {
    return { energy: raw, power };
  }
  if (typeof raw === "string") {
    let energy = 0;
    for (const m of raw.matchAll(ENERGY_TOKEN_RE)) {
      energy += Number.parseInt(m[1] ?? m[2], 10);
    }
    for (const m of raw.matchAll(RUNE_TOKEN_RE)) {
      const d = (m[1] ?? m[2]).toLowerCase();
      power[d] = (power[d] ?? 0) + 1;
    }
    if (energy === 0 && Object.keys(power).length === 0 && /^\d+$/.test(raw.trim())) {
      energy = Number.parseInt(raw.trim(), 10);
    }
    return { energy, power };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { energy?: unknown; power?: unknown };
    const energy = typeof obj.energy === "number" ? obj.energy : 0;
    if (Array.isArray(obj.power)) {
      for (const d of obj.power) {
        if (typeof d === "string") {
          power[d] = (power[d] ?? 0) + 1;
        }
      }
    }
    return { energy, power };
  }
  return { energy: 0, power };
}

const PLAYER_BOARD_ZONES: readonly string[] = [
  "base",
  "legendZone",
  "championZone",
];

/**
 * Compute the cumulative static cost-reduction (and floor) the player's
 * permanents apply when `playedCardId` is played.
 *
 * Scans every permanent the controller has on the board (base + legendZone
 * + championZone + every battlefield-* zone), filters for static abilities
 * whose `effect.type === "cost-reduction"` AND whose target shape matches
 * the played card, then sums the reductions and tracks the max minimum.
 *
 * Self-targeted statics (`target:"self"` or `target.controller:"self"`)
 * fire too, but ONLY when the SCANNED PERMANENT is the played card itself
 * — i.e. a static "I cost N less" already self-applies. (In practice these
 * are read directly off the played card's abilities, not via this scan;
 * we keep the path closed by ignoring `self`-shaped reductions emitted by
 * OTHER permanents.)
 */
export function computeStaticCostReduction(
  ctx: CostReductionContext,
  playerId: string,
  playedCardId: string,
): StaticCostReduction {
  const registry = getGlobalCardRegistry();
  const playedDef = registry.get(playedCardId);
  // Without a registered definition we can't match targets — bail to zero.
  if (!playedDef) {
    return { minimum: 0, power: {}, reduction: 0 };
  }
  const playedCardType = playedDef.cardType;
  const playedKeywords = playedDef.keywords ?? [];
  const playedTags = playedDef.tags ?? [];

  let totalReduction = 0;
  let maxMinimum = 0;
  const totalPower: Partial<Record<string, number>> = {};

  // Build the per-player scan zone list (base/legend/champion + every bf).
  const zonesToScan: string[] = [...PLAYER_BOARD_ZONES];
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    zonesToScan.push(`battlefield-${bfId}`);
  }

  for (const zoneId of zonesToScan) {
    // Per-player zones (base/legendZone/championZone) take playerId;
    // Battlefield zones are global, so we read everyone then filter by
    // Controller below.
    const isPerPlayer = PLAYER_BOARD_ZONES.includes(zoneId);
    const ids = isPerPlayer
      ? ctx.zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)
      : ctx.zones.getCardsInZone(zoneId as CoreZoneId);

    for (const permId of ids) {
      const controller =
        ctx.cards.getCardController?.(permId as CoreCardId) ??
        ctx.cards.getCardOwner(permId as CoreCardId);
      if (controller !== playerId) {
        continue;
      }
      // Skip the played card itself — the self-cost-reduction path on its
      // OWN printed cost is handled by the meta `costModifier` machinery
      // And/or the card's own static auras applying separately. Including
      // The played card here would double-apply if it sits on the board
      // (e.g. Ambush re-plays).
      if ((permId as string) === playedCardId) {
        continue;
      }
      const abilities = registry.getAbilities(permId as string) ?? [];
      for (const ability of abilities) {
        if ((ability as { type?: string }).type !== "static") {
          continue;
        }
        for (const effect of costEffectsOf(ability, "cost-reduction")) {
        // Target-match filter: only count auras whose `target` matches the
        // Played card. `self` / no-target shapes do not match an external
        // Played card.
        const {target} = (effect as { target?: unknown });
        if (!matchesPlayedCard(target, playedCardType, playedKeywords, playedTags)) {
          continue;
        }

        // Optional condition gate (reuse the static-abilities evaluator —
        // It knows `while-at-battlefield`, `control-battlefield`, etc.).
        const cond = (ability as { condition?: Record<string, unknown> })
          .condition;
        if (cond) {
          // Find the permanent's current zone so the evaluator's zone-aware
          // Conditions (while-at-battlefield, while-alone) read true.
          const sourceZone = findPermanentZone(ctx, permId as string) ?? zoneId;
          const passes = evaluateCondition(cond, {
            id: permId as string,
            owner: playerId,
            zone: sourceZone,
          }, {
            cards: {
              getCardMeta: ctx.cards.getCardMeta,
              getCardOwner: ctx.cards.getCardOwner,
              updateCardMeta: ctx.cards.updateCardMeta,
            },
            draft: ctx.draft,
            zones: ctx.zones as unknown as Parameters<typeof evaluateCondition>[2]["zones"],
          });
          if (!passes) {
            continue;
          }
        }

        // Pull the reduction amount from any of the parser's emitted keys.
        // Parser uses `by` / `reduction` / `amount` depending on phrasing;
        // rule-id: ven-055-166 — token strings (`":rb_energy_1::rb_rune_rainbow:"`)
        // decode into an energy part and waived power pips.
        const rawAmt =
          (effect as { by?: unknown }).by ??
          (effect as { reduction?: unknown }).reduction ??
          (effect as { amount?: unknown }).amount;
        const amt = decodeCostAmount(rawAmt);
        const powerPips = Object.values(amt.power).reduce((a: number, b) => a + (b ?? 0), 0);
        if (amt.energy <= 0 && powerPips <= 0) {
          continue;
        }
        totalReduction += Math.max(0, amt.energy);
        for (const [d, n] of Object.entries(amt.power)) {
          totalPower[d] = (totalPower[d] ?? 0) + (n ?? 0);
        }

        // Track the max minimum across all matching reductions.
        const {minimum} = (effect as { minimum?: unknown });
        const minEnergy = minimum === undefined ? 0 : decodeCostAmount(minimum).energy;
        if (minEnergy > maxMinimum) {
          maxMinimum = minEnergy;
        }
        }
      }
    }
  }

  return { minimum: maxMinimum, power: totalPower, reduction: totalReduction };
}

/**
 * rule 356.3 — a static cost modifier may be printed as one clause of a
 * compound ability ("friendly spells cost … less, and enemy spells cost …
 * more"), which the parser emits as a `sequence` of effects. Yield every
 * effect of the requested kind, unwrapping one level of `sequence`.
 */
function costEffectsOf(
  ability: unknown,
  kind: "cost-reduction" | "cost-increase",
): Record<string, unknown>[] {
  const effect = (ability as { effect?: Record<string, unknown> }).effect;
  if (!effect) {
    return [];
  }
  const type = (effect as { type?: string }).type;
  if (type === kind) {
    return [effect];
  }
  if (type === "sequence") {
    const inner = (effect as { effects?: unknown }).effects;
    if (Array.isArray(inner)) {
      return inner.filter(
        (e): e is Record<string, unknown> =>
          !!e && typeof e === "object" && (e as { type?: string }).type === kind,
      );
    }
  }
  return [];
}

/**
 * rule 356.3 / 135.2.e.5.a — cost INCREASES imposed by OPPONENTS' permanents
 * ("enemy spells cost [1][rainbow] more"). Mirrors
 * `computeStaticCostReduction` but scans permanents controlled by other
 * players and only honours statics whose target is declared `enemy`
 * (i.e. enemy from the aura controller's point of view = the player who is
 * paying). Increases apply on top of any reduction and are never floored.
 */
export function computeStaticCostIncrease(
  ctx: CostReductionContext,
  playerId: string,
  playedCardId: string,
): { energy: number; power: Partial<Record<string, number>> } {
  const registry = getGlobalCardRegistry();
  const playedDef = registry.get(playedCardId);
  const total: { energy: number; power: Partial<Record<string, number>> } = {
    energy: 0,
    power: {},
  };
  if (!playedDef) {
    return total;
  }
  const playedCardType = playedDef.cardType;
  const playedKeywords = playedDef.keywords ?? [];
  const playedTags = playedDef.tags ?? [];

  const zonesToScan: string[] = [];
  for (const other of Object.keys(ctx.draft.players ?? {})) {
    if (other === playerId) {
      continue;
    }
    for (const zoneId of PLAYER_BOARD_ZONES) {
      zonesToScan.push(zoneId);
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    zonesToScan.push(`battlefield-${bfId}`);
  }

  const seen = new Set<string>();
  for (const zoneId of zonesToScan) {
    const isPerPlayer = PLAYER_BOARD_ZONES.includes(zoneId);
    const ids: readonly CoreCardId[] = isPerPlayer
      ? Object.keys(ctx.draft.players ?? {})
          .filter((p) => p !== playerId)
          .flatMap((p) =>
            [...ctx.zones.getCardsInZone(zoneId as CoreZoneId, p as CorePlayerId)],
          )
      : ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const permId of ids) {
      if (seen.has(permId as string)) {
        continue;
      }
      const controller =
        ctx.cards.getCardController?.(permId as CoreCardId) ??
        ctx.cards.getCardOwner(permId as CoreCardId);
      if (!controller || controller === playerId) {
        continue;
      }
      seen.add(permId as string);
      for (const ability of registry.getAbilities(permId as string) ?? []) {
        if ((ability as { type?: string }).type !== "static") {
          continue;
        }
        for (const effect of costEffectsOf(ability, "cost-increase")) {
          const target = (effect as { target?: unknown }).target as
            | { controller?: string }
            | undefined;
          // Only "enemy spells cost more" auras hit the other player's plays.
          if (!target || typeof target !== "object" || target.controller !== "enemy") {
            continue;
          }
          if (!matchesCardShape(target, playedCardType, playedKeywords, playedTags)) {
            continue;
          }
          const cond = (ability as { condition?: Record<string, unknown> }).condition;
          if (cond) {
            const sourceZone = findPermanentZone(ctx, permId as string) ?? zoneId;
            const passes = evaluateCondition(
              cond,
              { id: permId as string, owner: controller, zone: sourceZone },
              {
                cards: {
                  getCardMeta: ctx.cards.getCardMeta,
                  getCardOwner: ctx.cards.getCardOwner,
                  updateCardMeta: ctx.cards.updateCardMeta,
                },
                draft: ctx.draft,
                zones: ctx.zones as unknown as Parameters<typeof evaluateCondition>[2]["zones"],
              },
            );
            if (!passes) {
              continue;
            }
          }
          const rawAmt =
            (effect as { by?: unknown }).by ??
            (effect as { increase?: unknown }).increase ??
            (effect as { amount?: unknown }).amount;
          const amt = decodeCostAmount(rawAmt);
          total.energy += Math.max(0, amt.energy);
          for (const [d, n] of Object.entries(amt.power)) {
            total.power[d] = (total.power[d] ?? 0) + (n ?? 0);
          }
        }
      }
    }
  }
  return total;
}

/**
 * rule-id: unl-146-219 — Repeat instances granted to `playedCardId` by the
 * player's board permanents ("While I'm in a showdown, your spells have
 * [Repeat] [2][chaos]"). Scans friendly permanents for static `grant-keyword`
 * Repeat effects whose target matches the played card and whose condition
 * holds, returning one cost tier per granting instance (rule 820.3). Empty
 * when nothing on the board grants Repeat.
 */
export function computeGrantedSpellRepeatCost(
  ctx: CostReductionContext,
  playerId: string,
  playedCardId: string,
): { energy: number; power: readonly string[] }[] {
  const registry = getGlobalCardRegistry();
  const playedDef = registry.get(playedCardId);
  if (!playedDef) {
    return [];
  }
  const playedCardType = playedDef.cardType;
  const playedKeywords = playedDef.keywords ?? [];
  const playedTags = playedDef.tags ?? [];
  const tiers: { energy: number; power: readonly string[] }[] = [];

  const zonesToScan: string[] = [...PLAYER_BOARD_ZONES];
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    zonesToScan.push(`battlefield-${bfId}`);
  }
  for (const zoneId of zonesToScan) {
    const isPerPlayer = PLAYER_BOARD_ZONES.includes(zoneId);
    const ids = isPerPlayer
      ? ctx.zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)
      : ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const permId of ids) {
      const controller =
        ctx.cards.getCardController?.(permId as CoreCardId) ??
        ctx.cards.getCardOwner(permId as CoreCardId);
      if (controller !== playerId || (permId as string) === playedCardId) {
        continue;
      }
      for (const ability of registry.getAbilities(permId as string) ?? []) {
        if ((ability as { type?: string }).type !== "static") {
          continue;
        }
        const effect = (ability as { effect?: Record<string, unknown> }).effect as
          | { type?: string; keyword?: string; target?: unknown; cost?: unknown }
          | undefined;
        if (effect?.type !== "grant-keyword" || effect.keyword !== "Repeat") {
          continue;
        }
        if (!matchesPlayedCard(effect.target, playedCardType, playedKeywords, playedTags)) {
          continue;
        }
        const cond = (ability as { condition?: Record<string, unknown> }).condition;
        if (cond) {
          const sourceZone = findPermanentZone(ctx, permId as string) ?? zoneId;
          const passes = evaluateCondition(
            cond,
            { id: permId as string, owner: playerId, zone: sourceZone },
            {
              cards: {
                getCardMeta: ctx.cards.getCardMeta,
                getCardOwner: ctx.cards.getCardOwner,
                updateCardMeta: ctx.cards.updateCardMeta,
              },
              draft: ctx.draft,
              zones: ctx.zones as unknown as Parameters<typeof evaluateCondition>[2]["zones"],
            },
          );
          if (!passes) {
            continue;
          }
        }
        const amt = decodeCostAmount(effect.cost);
        const power: string[] = [];
        for (const [d, n] of Object.entries(amt.power)) {
          for (let i = 0; i < (n ?? 0); i++) {
            power.push(d);
          }
        }
        tiers.push({ energy: Math.max(0, amt.energy), power });
      }
    }
  }
  return tiers;
}

/**
 * rule-id: sfd-211-221 (rules 356.4.c, 356.6) — the energy reduction the
 * player's permanents apply to EACH of a spell's [Repeat] costs ("While you
 * control this battlefield, friendly [Repeat] costs cost [1] less"). Repeat
 * costs are optional ADDITIONAL costs, so this reduction never touches the
 * base cost, and a tier with no energy part ([rainbow] alone) has nothing to
 * reduce (rule 356.6). Battlefield cards live in `battlefieldRow`, so that
 * zone is scanned too — the battlefield's controller is its card controller.
 */
export function computeStaticRepeatCostReduction(
  ctx: CostReductionContext,
  playerId: string,
): number {
  const registry = getGlobalCardRegistry();
  let total = 0;
  const zonesToScan: string[] = [...PLAYER_BOARD_ZONES, "battlefieldRow"];
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    zonesToScan.push(`battlefield-${bfId}`);
  }
  const seen = new Set<string>();
  for (const zoneId of zonesToScan) {
    const isPerPlayer = PLAYER_BOARD_ZONES.includes(zoneId);
    const ids = isPerPlayer
      ? ctx.zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)
      : ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const permId of ids) {
      if (seen.has(permId as string)) {
        continue;
      }
      const controller =
        ctx.cards.getCardController?.(permId as CoreCardId) ??
        ctx.cards.getCardOwner(permId as CoreCardId);
      if (controller !== playerId) {
        continue;
      }
      seen.add(permId as string);
      for (const ability of registry.getAbilities(permId as string) ?? []) {
        if ((ability as { type?: string }).type !== "static") {
          continue;
        }
        for (const effect of costEffectsOf(ability, "cost-reduction")) {
          if (!targetsRepeatCost((effect as { target?: unknown }).target)) {
            continue;
          }
          const cond = (ability as { condition?: Record<string, unknown> }).condition;
          if (cond) {
            const sourceZone = findPermanentZone(ctx, permId as string) ?? zoneId;
            const passes = evaluateCondition(
              cond,
              { id: permId as string, owner: playerId, zone: sourceZone },
              {
                cards: {
                  getCardMeta: ctx.cards.getCardMeta,
                  getCardOwner: ctx.cards.getCardOwner,
                  updateCardMeta: ctx.cards.updateCardMeta,
                },
                draft: ctx.draft,
                zones: ctx.zones as unknown as Parameters<typeof evaluateCondition>[2]["zones"],
              },
            );
            if (!passes) {
              continue;
            }
          }
          const rawAmt =
            (effect as { by?: unknown }).by ??
            (effect as { reduction?: unknown }).reduction ??
            (effect as { amount?: unknown }).amount;
          total += Math.max(0, decodeCostAmount(rawAmt).energy);
        }
      }
    }
  }
  return total;
}

/**
 * Does this cost-reduction target shape name [Repeat] costs rather than a
 * card's own cost? The parser leaves the printed phrasing as a raw string
 * ("friendly [Repeat]"); hand-authored abilities may use `{costKind:"repeat"}`
 * or `{keyword:"Repeat"}` with no card `type`. Enemy-scoped shapes never help
 * the payer.
 */
function targetsRepeatCost(target: unknown): boolean {
  if (typeof target === "string") {
    const t = target.toLowerCase();
    return t.includes("repeat") && !t.includes("enemy");
  }
  if (!target || typeof target !== "object") {
    return false;
  }
  const t = target as { controller?: string; costKind?: string; keyword?: string; type?: string };
  if (t.controller === "enemy") {
    return false;
  }
  if (t.costKind === "repeat") {
    return true;
  }
  return t.keyword === "Repeat" && t.type === undefined;
}

/**
 * Apply a static-cost-reduction result to a printed energy cost. Pure
 * arithmetic — clamps to `max(min, 0)` to honor each aura's minimum and
 * non-negative energy.
 */
export function applyStaticCostReduction(
  printedEnergy: number,
  reduction: StaticCostReduction,
): number {
  if (reduction.reduction <= 0) {
    return Math.max(printedEnergy, 0);
  }
  const after = printedEnergy - reduction.reduction;
  // "to a minimum of [1]" floors the discount; it never raises a cheaper card.
  const floor = Math.max(Math.min(reduction.minimum, printedEnergy), 0);
  return Math.max(after, floor);
}

/**
 * rule-id: ven-055-166 — waive power pips from a play's per-domain power
 * requirement. Domain-keyed waivers reduce that domain; `rainbow` waivers
 * cover one pip of any domain, preferring a printed rainbow pip, then the
 * domain the payer's pool is shortest on.
 */
export function reducePowerCost(
  need: Partial<Record<string, number>>,
  waived: Partial<Record<string, number>>,
  available: Partial<Record<string, number>> = {},
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = { ...need };
  let anyDomain = 0;
  for (const [d, n] of Object.entries(waived)) {
    if (!n || n <= 0) {
      continue;
    }
    if (d === "rainbow") {
      anyDomain += n;
      continue;
    }
    if ((out[d] ?? 0) > 0) {
      out[d] = Math.max(0, (out[d] ?? 0) - n);
    }
  }
  while (anyDomain > 0) {
    const owed = Object.keys(out).filter((d) => (out[d] ?? 0) > 0);
    if (owed.length === 0) {
      break;
    }
    owed.sort((a, b) => {
      if (a === "rainbow") {return -1;}
      if (b === "rainbow") {return 1;}
      const shortA = (out[a] ?? 0) - (available[a] ?? 0);
      const shortB = (out[b] ?? 0) - (available[b] ?? 0);
      return shortB - shortA;
    });
    const pick = owed[0] as string;
    out[pick] = (out[pick] ?? 0) - 1;
    anyDomain--;
  }
  return out;
}

/**
 * Does this `target` shape match the played card? Generic, NO per-card ifs.
 *
 * Recognized shapes (parser-emitted):
 *  - `target.type` ∈ `"spell"` | `"unit"` | `"gear"` | `"equipment"` matches
 *    the played card's `cardType`.
 *  - `target.keyword` (string) requires the played card to have that
 *    printed keyword.
 *  - `target.controller` is informational — at this point we've already
 *    filtered by `controller === playerId` upstream, so `"friendly"` /
 *    `"self"` reads through; `"enemy"` blocks (a friendly aura that's
 *    declared as targeting enemies wouldn't reduce cost for the owner).
 *
 * Unknown / malformed → no match.
 */
function matchesPlayedCard(
  target: unknown,
  playedCardType: string | undefined,
  playedKeywords: readonly string[],
  playedTags: readonly string[] = [],
): boolean {
  if (target === undefined || target === null) {
    return false;
  }
  if (typeof target === "string") {
    // "self" / "card" — these self-target only; not a friendly aura.
    return false;
  }
  if (typeof target !== "object") {
    return false;
  }
  const t = target as {
    type?: string;
    keyword?: string;
    controller?: string;
    tag?: string;
    filter?: { tag?: string };
  };
  // Enemy-targeted reductions don't apply to your own plays.
  if (t.controller === "enemy") {
    return false;
  }
  return matchesCardShape(t, playedCardType, playedKeywords, playedTags);
}

/**
 * Type / keyword / tag half of the aura match, shared by the reduction and
 * increase scans (the controller half differs between them).
 */
function matchesCardShape(
  t: {
    type?: string;
    keyword?: string;
    tag?: string;
    filter?: { tag?: string };
  },
  playedCardType: string | undefined,
  playedKeywords: readonly string[],
  playedTags: readonly string[] = [],
): boolean {
  // Type filter (when present).
  if (t.type) {
    // `equipment` and `gear` are sometimes used interchangeably; treat
    // `equipment` as matching gear too (and vice-versa).
    if (t.type === "spell" && playedCardType !== "spell") {return false;}
    if (t.type === "unit" && playedCardType !== "unit") {return false;}
    if (
      (t.type === "gear" || t.type === "equipment") &&
      playedCardType !== "gear" &&
      playedCardType !== "equipment"
    ) {
      return false;
    }
  }
  // Keyword filter (when present).
  if (t.keyword && !playedKeywords.includes(t.keyword)) {
    return false;
  }
  // rule 356.4 — tag-scoped auras ("Your Dragons' Energy costs are reduced …").
  // Tags are matched case-insensitively so a plural/singular mismatch in
  // printed text ("Dragons") still lines up with the printed tag ("Dragon").
  const wantTag = t.tag ?? t.filter?.tag;
  if (wantTag && !playedTags.some((tag) => tag.toLowerCase() === wantTag.toLowerCase())) {
    return false;
  }
  return true;
}

/**
 * Locate the zone a permanent currently lives in. Used to feed
 * `while-at-battlefield`-style conditions. Returns the first match across
 * base / legendZone / championZone / battlefield-* (rule 463 — statics fire
 * from the board).
 */
function findPermanentZone(
  ctx: CostReductionContext,
  cardId: string,
): string | undefined {
  for (const playerId of Object.keys(ctx.draft.players ?? {})) {
    for (const zoneId of PLAYER_BOARD_ZONES) {
      const ids = ctx.zones.getCardsInZone(
        zoneId as CoreZoneId,
        playerId as CorePlayerId,
      );
      if (ids.includes(cardId as CoreCardId)) {
        return zoneId;
      }
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    const bfZoneId = `battlefield-${bfId}`;
    const ids = ctx.zones.getCardsInZone(bfZoneId as CoreZoneId);
    if (ids.includes(cardId as CoreCardId)) {
      return bfZoneId;
    }
  }
  return undefined;
}
