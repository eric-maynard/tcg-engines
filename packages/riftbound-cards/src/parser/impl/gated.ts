/**
 * Level-gated and Empowered-gated ability blocks.
 */

import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import { stripReminders } from "./normalize";
import type { ParseAbilitiesResult } from "./types";

// ============================================================================
// Level-Gated Ability Parser (UNL set)
// ============================================================================

/**
 * Attach a `while-level` condition to an ability without losing its existing
 * conditional shape. If the ability already has a condition, the two are
 * AND-composed.
 */
export function attachLevelCondition(ability: Ability, threshold: number): Ability {
  const levelCond = { threshold, type: "while-level" as const };

  // Abilities whose runtime shape carries a `condition` field: triggered,
  // Activated, static, and effect-keyword abilities.
  const withCond = ability as unknown as { condition?: unknown };
  const existing = withCond.condition as { type?: string } | undefined;

  let newCond: unknown = levelCond;
  if (existing && typeof existing === "object") {
    if (existing.type === "and") {
      const conds = (existing as { conditions?: unknown[] }).conditions ?? [];
      newCond = { conditions: [...conds, levelCond], type: "and" };
    } else {
      newCond = { conditions: [existing, levelCond], type: "and" };
    }
  }

  return { ...(ability as object), condition: newCond } as Ability;
}

/**
 * Parse text that contains one or more `[Level N][>] <effect>` blocks.
 *
 * Splits on `[Level N]` boundaries and:
 *   1. Parses text preceding the first `[Level N]` marker with the normal
 *      `parseAbilities` pipeline (these abilities have no XP gating).
 *   2. For each `[Level N] <chunk>` segment, parses the chunk and tags every
 *      resulting ability with `{condition: {type: "while-level", threshold: N}}`.
 *
 * Returns `undefined` if parsing fails to produce any abilities at all, so
 * the caller can fall back to the standard pipeline.
 */
export function parseLevelGatedAbilities(
  text: string,
  parseInner: (text: string) => ParseAbilitiesResult,
): ParseAbilitiesResult | undefined {
  const LEVEL_RE = /\[Level\s+(\d+)\]\s*/gi;
  const matches: { index: number; end: number; threshold: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = LEVEL_RE.exec(text)) !== null) {
    matches.push({
      end: m.index + m[0].length,
      index: m.index,
      threshold: Number.parseInt(m[1], 10),
    });
  }
  if (matches.length === 0) {
    return undefined;
  }

  const allAbilities: Ability[] = [];

  // Prefix text: anything before the first [Level N] marker. Parse via the
  // Inner function so that Hunt expansion runs once at the outer layer.
  const prefix = text
    .slice(0, matches[0].index)
    .trim()
    .replace(/[,.]\s*$/, "")
    .trim();
  if (prefix.length > 0) {
    const prefixResult = parseInner(prefix);
    if (prefixResult.success && prefixResult.abilities) {
      allAbilities.push(...prefixResult.abilities);
    }
  }

  // Each level chunk: runs from the end of its marker to the start of the next
  // Marker (or to the end of the text for the last chunk).
  for (let i = 0; i < matches.length; i++) {
    const chunkStart = matches[i].end;
    const chunkEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const chunkText = text
      .slice(chunkStart, chunkEnd)
      .trim()
      .replace(/^[>.\s]+/, "")
      .trim();
    if (!chunkText) {
      continue;
    }
    const chunkResult = parseInner(chunkText);
    if (chunkResult.success && chunkResult.abilities) {
      for (const ab of chunkResult.abilities) {
        allAbilities.push(attachLevelCondition(ab, matches[i].threshold));
      }
    }
  }

  if (allAbilities.length === 0) {
    return undefined;
  }
  return { abilities: allAbilities, success: true };
}

/**
 * Rule 827 (rule-id: ven-136-166): `[Empowered][>] <ability>` lines function
 * only while the host is Empowered. Non-gated lines parse normally; each gated
 * line's abilities get a `while-empowered` condition. "I have [KW N]" becomes a
 * conditional static grant-keyword (bare keyword abilities are read
 * unconditionally by the engine).
 */
export function parseEmpoweredGatedAbilities(
  text: string,
  parseInner: (text: string) => ParseAbilitiesResult,
): ParseAbilitiesResult | undefined {
  const gated: string[] = [];
  const plain: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const m = line.match(/^\[Empowered\]\s*[>.:\s]*/i);
    if (m) {
      gated.push(line.slice(m[0].length).trim());
    } else {
      plain.push(line);
    }
  }
  if (gated.length === 0) {
    return undefined;
  }

  const allAbilities: Ability[] = [];
  if (plain.length > 0) {
    const plainResult = parseInner(plain.join("\n"));
    if (plainResult.success && plainResult.abilities) {
      allAbilities.push(...plainResult.abilities);
    }
  }

  const empoweredCond: unknown = { type: "while-empowered" };
  for (const chunk of gated) {
    const body = stripReminders(chunk).trim();
    const haveMatch = body.match(
      /^I have\s+((?:\[[\w-]+(?:\s+\d+)?\](?:\s*,?\s*(?:and\s+)?)?)+)\.?$/i,
    );
    if (haveMatch) {
      const kwRe = /\[([\w-]+)(?:\s+(\d+))?\]/g;
      let km: RegExpExecArray | null;
      while ((km = kwRe.exec(haveMatch[1])) !== null) {
        allAbilities.push({
          condition: empoweredCond,
          effect: {
            keyword: km[1],
            target: { type: "self" },
            type: "grant-keyword",
            ...(km[2] ? { value: Number.parseInt(km[2], 10) } : {}),
          } as unknown as Effect,
          type: "static",
        } as Ability);
      }
      continue;
    }
    const chunkResult = parseInner(chunk);
    if (chunkResult.success && chunkResult.abilities) {
      for (const ab of chunkResult.abilities) {
        const existing = (ab as unknown as { condition?: unknown }).condition;
        const condition: unknown = existing
          ? { conditions: [existing, empoweredCond], type: "and" }
          : empoweredCond;
        allAbilities.push({ ...(ab as object), condition } as Ability);
      }
    }
  }

  if (allAbilities.length === 0) {
    return undefined;
  }
  return { abilities: allAbilities, success: true };
}
