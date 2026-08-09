/**
 * Equipment Effect Text (rules 136, 150.2, 718.3, 719.1).
 *
 * An Equipment prints two boxes. Its Rules Text is the gear's own text —
 * `[Equip] [C]`, `[Quick-Draw]`, `[Unique]`, an activated ability, "When you
 * play this, …". Its Effect Text holds abilities that are appended to the unit
 * the Equipment is attached to and are inactive while it is unattached
 * (136.2.b/c): "[Assault 2]", "When I hold, score 1 point.", "I am a Mech.".
 * "I"/"me" there is the equipped unit; "this"/the card name is the Equipment
 * (136.2.d).
 *
 * The sentence parser cannot see box boundaries, so callers hand the two texts
 * in separately and this module gives the effect-text abilities their
 * conferred shape:
 *   - a passive keyword bar (`[Assault 2]`, `[Tank]`, `[Ganking]`) becomes a
 *     static `grant-keyword` on self — the engine applies an Equipment's
 *     self-targeted static to its holder, and only while attached;
 *   - a trigger keyword (`[Deathknell] — Draw 1.`, `[Hunt]`) keeps only the
 *     triggered abilities it stands for, named after the keyword;
 *   - every conferred ability is flagged `effectText: true`, the marker the
 *     engine reads to run a triggered ability off the WEARER's events rather
 *     than the gear's.
 */

import type { Ability } from "@tcg/riftbound-types";
import { ALL_COST_KEYWORDS, KEYWORD_TRIGGER_EVENTS } from "./impl/keywords";
import type { ParseAbilitiesResult, ParserOptions } from "./impl/types";
import { parseAbilities } from "./index";

/** Marker carried by every ability that lives in a card's Effect Text box. */
export interface EffectTextFlag {
  readonly effectText: true;
}

const TRIGGER_KEYWORDS = new Set<string>([...Object.keys(KEYWORD_TRIGGER_EVENTS), "Hunt"]);

/**
 * Re-shape abilities parsed from an Effect Text box into what they mean on the
 * equipped unit (see module doc). Order is preserved.
 */
export function conferEffectTextAbilities(abilities: readonly Ability[]): Ability[] {
  const out: Ability[] = [];
  let pendingTriggerKeyword: string | undefined;
  for (const ability of abilities) {
    if (ability.type === "keyword") {
      const keyword = (ability as { keyword: string }).keyword;
      if (TRIGGER_KEYWORDS.has(keyword)) {
        // The parser already emitted the triggered form right after it.
        pendingTriggerKeyword = keyword;
        continue;
      }
      pendingTriggerKeyword = undefined;
      if (ALL_COST_KEYWORDS.includes(keyword)) {
        out.push({ ...ability, effectText: true } as Ability);
        continue;
      }
      const value = (ability as { value?: number }).value;
      const condition = (ability as { condition?: unknown }).condition;
      out.push({
        ...(condition === undefined ? {} : { condition }),
        effect: {
          keyword,
          target: "self",
          type: "grant-keyword",
          ...(value === undefined ? {} : { value }),
        },
        effectText: true,
        type: "static",
      } as unknown as Ability);
      continue;
    }
    if (ability.type === "triggered") {
      const named = (ability as { name?: string }).name;
      out.push({
        ...ability,
        effectText: true,
        ...(named === undefined && pendingTriggerKeyword !== undefined
          ? { name: pendingTriggerKeyword }
          : {}),
      } as Ability);
      continue;
    }
    pendingTriggerKeyword = undefined;
    out.push({ ...ability, effectText: true } as Ability);
  }
  return out;
}

/**
 * A card's own rules text with its Effect Text box removed. Card data stores
 * `rulesText` as "rules text\neffect text" (the printed order) plus the
 * `effectText` on its own; this recovers the first box.
 */
export function withoutEffectText(rulesText: string, effectText: string | undefined): string {
  if (!effectText) {
    return rulesText;
  }
  const full = rulesText.trimEnd();
  const tail = effectText.trim();
  if (full === tail) {
    return "";
  }
  return full.endsWith(`\n${tail}`) ? full.slice(0, full.length - tail.length - 1).trimEnd() : rulesText;
}

/**
 * Parse a card that has an Effect Text box: its own rules text as printed,
 * plus the effect text in conferred shape. Succeeds when either box yields an
 * ability, so an unparseable effect sentence never hides the `[Equip]` cost.
 */
export function parseEquipmentText(
  ownRulesText: string,
  effectText: string | undefined,
  options?: ParserOptions,
): ParseAbilitiesResult {
  const own = ownRulesText.trim().length > 0 ? parseAbilities(ownRulesText, options) : undefined;
  const conferredSource =
    effectText !== undefined && effectText.trim().length > 0
      ? parseAbilities(effectText, options)
      : undefined;
  const abilities = [
    ...(own?.success ? (own.abilities ?? []) : []),
    ...conferEffectTextAbilities(conferredSource?.success ? (conferredSource.abilities ?? []) : []),
  ];
  if (abilities.length === 0) {
    return { error: own?.error ?? conferredSource?.error ?? "Empty ability text", success: false };
  }
  return { abilities, success: true };
}
