/**
 * Activated-ability parsing.
 */

import type { ActivatedAbility } from "@tcg/riftbound-types";
import type { Cost } from "@tcg/riftbound-types/abilities/cost-types";
import type { Effect, SequenceEffect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseCost } from "../parsers/cost-parser";
import { parseActivationCost, parseResourcePayload } from "./costs";
import { parseEffect } from "./effect";
import { parseEffects } from "./effects";
import { stripReminders } from "./normalize";

// ============================================================================
// Activated Ability Parser
// ============================================================================

/**
 * Pattern for activated abilities: COST:: EFFECT
 * Cost section ends at `::`
 */
export const ACTIVATED_PATTERN =
  /^((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):(?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*(?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):(?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*)*)):\s*(.+)$/s;

export function parseActivatedAbility(text: string): ActivatedAbility | undefined {
  // Allow a leading "[Action]" / "[Reaction]" timing prefix on activated abilities
  // (rare but used by gear/legends like Dragonsoul Sage and Scorn of the Moon).
  // Parse the inner text without the prefix, then re-attach timing on the result.
  const leadingTimingMatch = text.match(/^\[(Action|Reaction)\]\s*/i);
  if (leadingTimingMatch) {
    const inner = text.slice(leadingTimingMatch[0].length).trim();
    const innerAbility = parseActivatedAbilityInner(inner);
    if (innerAbility) {
      const timingStr = leadingTimingMatch[1].toLowerCase() as "action" | "reaction";
      return { ...innerAbility, timing: timingStr } as ActivatedAbility;
    }
    return undefined;
  }
  return parseActivatedAbilityInner(text);
}

export function parseActivatedAbilityInner(text: string): ActivatedAbility | undefined {
  // "[Empower] COST" keyword-ability form (rules-text sugar for
  // "COST: Empower me. Use only if not Empowered.") — e.g. Sandspinner
  // (ven-001-166) "[Empower] [5]", Cog Cadet (ven-054-166) "[Empower] — [Exhaust]".
  // Optionally followed by "This ability costs [N] less if COND." on the same line.
  // Matches only the first line so multi-line rulesText (with a following
  // [Empowered] static or a second activated ability) is left for the caller
  // to split.
  // Rule 827.1.c.1 (ven-075-166 Platewyrm Egg): cost tokens may be
  // comma-separated ("[1], [Exhaust]"), not just juxtaposed.
  const empowerLine = text.split("\n")[0];
  const empowerKwMatch = stripReminders(empowerLine).match(
    /^\[Empower\]\s*(?:—|-)?\s*((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):(?:\s*,\s*|\s*))+)\.?\s*(?:This ability costs :rb_energy_(\d+): less if ([^.]+)\.?)?\s*$/i,
  );
  if (empowerKwMatch) {
    const cost = parseCost(empowerKwMatch[1].trim());
    // Rule 827.1.c.1: [Empower] is sugar for "COST: Empower me. Play only if
    // not Empowered." — attach a not-empowered restriction so the engine hides
    // the ability once meta.empowered is set (ven-021-166 et al.).
    const ability = {
      cost,
      effect: { target: "self", type: "empower" } as unknown as Effect,
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    } as ActivatedAbility;
    if (empowerKwMatch[2]) {
      (ability as unknown as { costModifier: unknown }).costModifier = {
        condition: { text: empowerKwMatch[3]?.trim(), type: "raw" },
        reduction: Number.parseInt(empowerKwMatch[2], 10),
      };
    }
    return ability;
  }

  // Compound: ":rb_energy_N::rb_rune_X:, Recycle <noun> from your trash, :rb_exhaust:: EFFECT"
  // Used by gear like Assembly Rig where the activation cost is energy + rune + recycle + exhaust.
  // Must run BEFORE the standard ACTIVATED_PATTERN because that pattern would otherwise
  // Greedily strip just the leading energy token and treat the rest as a raw effect.
  const compoundEnergyRecycleMatch = text.match(
    /^((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)+),\s*(Recycle (?:a |an )?(?:unit|gear|card|spell|legend) from your trash)((?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*):\s*(.+)$/is,
  );
  if (compoundEnergyRecycleMatch) {
    const leadingCostStr = compoundEnergyRecycleMatch[1];
    const recyclePart = compoundEnergyRecycleMatch[2];
    const trailingCostTokens = compoundEnergyRecycleMatch[3]?.trim() ?? "";
    const effectPart = compoundEnergyRecycleMatch[4].trim();

    let cost: Cost = parseCost(leadingCostStr);
    cost = {
      ...cost,
      recycle: {
        amount: 1,
        // rule 379.5: "Recycle a unit from your trash" is payable only with a
        // card of that type — carry the noun so the engine can filter.
        ...(recyclePart.match(/\b(unit|gear|spell|legend)\b/i)
          ? { cardType: recyclePart.match(/\b(unit|gear|spell|legend)\b/i)?.[1].toLowerCase() }
          : {}),
        from: "trash",
        text: recyclePart.trim(),
      },
    } as Cost;
    if (trailingCostTokens) {
      const extraCost = parseCost(trailingCostTokens.replace(/^,\s*/, ""));
      cost = { ...cost, ...extraCost } as Cost;
    }

    const effect = parseEffects(effectPart);
    if (effect) {
      return { cost, effect, type: "activated" };
    }
    const stripped = stripReminders(effectPart).trim();
    if (stripped) {
      const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
      return { cost, effect: rawEffect, type: "activated" };
    }
  }

  const match = ACTIVATED_PATTERN.exec(text);
  if (!match) {
    // Try text-based activation costs. Supported leading-cost forms:
    //   "Recycle N from your trash/hand: EFFECT"
    //   "Recycle this: EFFECT" / "Recycle me: EFFECT" (self-recycle on basic runes)
    // These may optionally be followed by additional `, :rb_...:` costs before the `:` delimiter,
    // E.g. "Recycle 3 from your trash, :rb_energy_1:, :rb_exhaust:: EFFECT" (Garbage Grabber).
    // The `:` delimiter is required so bare effect text like "Recycle 3 from your trash."
    // Is not mis-split as a cost.
    const textCostMatch = text.match(
      /^(Recycle (?:\d+ (?:from your trash|from your hand|cards? from your trash|cards? from your hand)|this|me|myself))((?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*):\s*(.+)$/is,
    );
    if (textCostMatch) {
      const recyclePart = textCostMatch[1].trim();
      const extraCostTokens = textCostMatch[2]?.trim() ?? "";
      const effectPart = textCostMatch[3].trim();
      const amountMatch = recyclePart.match(/^Recycle (\d+)/i);
      const isSelfRecycle = /^Recycle (?:this|me|myself)$/i.test(recyclePart);

      // Build the recycle portion of the cost.
      let cost: Cost;
      if (isSelfRecycle) {
        // Self-recycle cost (e.g. on basic runes: "Recycle this: [Add] [C]")
        cost = { recycle: { amount: 1, from: "board" } } as Cost;
      } else if (amountMatch) {
        const amount = Number.parseInt(amountMatch[1], 10);
        const fromHand = /from your hand/i.test(recyclePart);
        cost = fromHand
          ? ({ recycle: { amount, from: "hand" } } as Cost)
          : ({ recycle: amount } as Cost);
      } else {
        cost = {} as Cost;
      }

      // Merge any additional energy/rune/exhaust costs from the compound cost string.
      if (extraCostTokens) {
        const extraTokens = extraCostTokens.replace(/^,\s*/, "");
        const extraCost = parseCost(extraTokens);
        cost = { ...cost, ...extraCost } as Cost;
      }

      const effect = parseEffects(effectPart);
      if (effect) {
        return { cost, effect, type: "activated" };
      }
      const stripped = stripReminders(effectPart).trim();
      if (stripped) {
        const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
        return { cost, effect: rawEffect, type: "activated" };
      }
    }

    // Try "Spend N XP: EFFECT" or "Spend my buff: EFFECT"
    // Requires explicit ":" separator to distinguish from "Spend a buff to EFFECT" (which is an effect)
    // Effect body stops at `. Spend ` so consecutive activated abilities
    // (e.g., Voidreaver's paired "Spend 1 XP, [Exhaust]: ... Spend 2 XP, [Exhaust]: ...")
    // Don't collapse into one match.
    const spendCostMatch = text.match(
      /^(Spend (?:\d+ XP|my buff|its buff))((?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*):\s*(.+?)(?=\.\s+Spend\s|$)\.?$/is,
    );
    if (spendCostMatch) {
      const costText = spendCostMatch[1].trim();
      const extraTokens = spendCostMatch[2]?.trim() ?? "";
      const effectPart = spendCostMatch[3].trim();

      // Build a structured cost object.
      // - "Spend N XP" → { xp: N }
      // - "Spend my buff" / "Spend its buff" → { spend: "buff" }
      let cost: Cost;
      const xpMatch = costText.match(/^Spend\s+(\d+)\s+XP/i);
      if (xpMatch) {
        cost = { xp: Number.parseInt(xpMatch[1], 10) } as Cost;
      } else {
        cost = { spend: "buff" } as Cost;
      }
      if (extraTokens) {
        const extraCost = parseCost(extraTokens.replace(/^,\s*/, ""));
        cost = { ...cost, ...extraCost } as Cost;
      }

      const effect = parseEffects(effectPart);
      if (effect) {
        return { cost, effect, type: "activated" };
      }
      const stripped = stripReminders(effectPart).trim();
      if (stripped) {
        const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
        return { cost, effect: rawEffect, type: "activated" };
      }
    }

    // Try "Discard <thing>" or "Disempower me" as leading text costs, optionally
    // Followed by additional `, :rb_...:` cost tokens before the `:` delimiter.
    // E.g. "Discard a gear, :rb_energy_1:, :rb_exhaust:: Deal 4 to a unit at a battlefield."
    //      "Disempower me, :rb_rune_rainbow:, :rb_exhaust:: Ready a unit."
    const textCost2Match = text.match(
      /^(Discard (?:a |an )?(?:gear|unit|card|spell)|Disempower (?:me|this|it))((?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*):\s*(.+)$/is,
    );
    if (textCost2Match) {
      const costText = textCost2Match[1].trim();
      const extraTokens = textCost2Match[2]?.trim() ?? "";
      const effectPart = textCost2Match[3].trim();

      let cost: Cost;
      if (/^Disempower/i.test(costText)) {
        cost = { disempower: "self" } as unknown as Cost;
      } else {
        const discardWhat = costText.replace(/^Discard\s+(?:a |an )?/i, "").toLowerCase();
        cost = { discard: { amount: 1, cardType: discardWhat } } as unknown as Cost;
      }
      if (extraTokens) {
        const extraCost = parseCost(extraTokens.replace(/^,\s*/, ""));
        cost = { ...cost, ...extraCost } as Cost;
      }

      const effect = parseEffects(effectPart);
      if (effect) {
        return { cost, effect, type: "activated" };
      }
      const stripped = stripReminders(effectPart).trim();
      if (stripped) {
        const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
        return { cost, effect: rawEffect, type: "activated" };
      }
    }
    return undefined;
  }

  const costStr = match[1];
  const effectPart = match[2].trim();

  const cost = parseActivationCost(costStr);

  // Parse optional timing and conditions from effect part
  let remaining = effectPart;
  let timing: "action" | "reaction" | undefined;
  let condition: { type: "legion" } | undefined;

  // Check for [Reaction] / [Action] timing after the cost ("[calm]: [Action] — …").
  // Strip the tag plus any trailing separator (comma, em dash, or ">>" marker).
  const timingMatch = remaining.match(/^\[(Reaction|Action)\](?:\s*(?:,|—|-|>>))?\s*/i);
  if (timingMatch) {
    timing = timingMatch[1].toLowerCase() as "action" | "reaction";
    remaining = remaining.slice(timingMatch[0].length);
  }

  // Check for [Legion] condition
  const legionMatch = remaining.match(/^\[Legion\]\s*—?\s*/i);
  if (legionMatch) {
    condition = { type: "legion" };
    remaining = remaining.slice(legionMatch[0].length);
  }

  // Pre-strip "Spend this Energy only during showdowns" trailing restriction so
  // It doesn't break the [Add] match below.
  let preRestrictions: { type: string }[] | undefined;
  const earlyShowdown = remaining.match(/\s*Spend this Energy only during showdowns\.?\s*$/i);
  if (earlyShowdown) {
    preRestrictions = [{ type: "energy-showdown-only" }];
    remaining = remaining.slice(0, remaining.length - earlyShowdown[0].length).trim();
  }

  // rule 429.4 (ogs-014-024, sfd-189-221): "Use only to play
  // spells / gear …" restricts what the added resources may pay for. Pre-strip
  // it so it doesn't break the [Add] match below.
  let addRestriction: "spell" | "gear" | undefined;
  const useOnlyToPlay = remaining.match(
    /\s*(?:Use|Spend this Energy) only to play (spells?|gear)\b[^.]*\.?(?:\s*\([^)]*\))?\s*$/i,
  );
  if (useOnlyToPlay) {
    addRestriction = useOnlyToPlay[1].toLowerCase().startsWith("spell") ? "spell" : "gear";
    remaining = remaining.slice(0, remaining.length - useOnlyToPlay[0].length).trim();
  }

  // Check for [Add] resource pattern
  const addMatch = remaining.match(/^\[Add\]\s+(.+?)\.?\s*(?:\(.*\))?\.?\s*$/s);
  if (addMatch) {
    const resourceText = addMatch[1].trim();

    // Rule 827 (rule-id: ven-075-166 Platewyrm Egg): "[Add] X. If this is
    // [Empowered], [Add] Y instead." — Y replaces X while Empowered, so emit a
    // conditional rather than summing both payloads.
    const RES = "(?::rb_(?:energy_\\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+";
    const empoweredInstead = remaining.match(
      new RegExp(
        `^\\[Add\\]\\s+(${RES})\\.?\\s+If (?:this is|I(?:'m| am)) \\[?Empowered\\]?,\\s*\\[Add\\]\\s+(${RES})\\s+instead\\.?\\s*$`,
        "i",
      ),
    );
    if (empoweredInstead) {
      const condEffect = {
        condition: { type: "while-empowered" },
        else: parseResourcePayload(empoweredInstead[1]),
        then: parseResourcePayload(empoweredInstead[2]),
        type: "conditional",
      } as unknown as Effect;
      const ability: ActivatedAbility = { cost, effect: condEffect, type: "activated" };
      if (timing) {
        (ability as { timing: string }).timing = timing;
      }
      if (condition) {
        (ability as { condition: { type: "legion" } }).condition = condition;
      }
      return ability;
    }

    // Check if there's additional effect text after the resource (e.g., "[Add] :rb_energy_1:. Draw 1.")
    const addAndMore = remaining.match(
      /^\[Add\]\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\.?\s+(.+)$/s,
    );
    if (addAndMore) {
      const resourceEffect = parseResourcePayload(addAndMore[1]);
      const additionalText = stripReminders(addAndMore[2]).trim();
      const additionalEffect = parseEffect(additionalText);
      if (additionalEffect) {
        const seqEffect: SequenceEffect = {
          effects: [resourceEffect, additionalEffect],
          type: "sequence",
        };
        const ability: ActivatedAbility = { cost, effect: seqEffect, type: "activated" };
        if (timing) {
          (ability as { timing: string }).timing = timing;
        }
        if (condition) {
          (ability as { condition: { type: "legion" } }).condition = condition;
        }
        return ability;
      }
    }

    const resourceEffect = parseResourcePayload(resourceText);
    if (addRestriction) {
      (resourceEffect as { restriction?: string }).restriction = addRestriction;
    }
    const ability: ActivatedAbility = { cost, effect: resourceEffect, type: "activated" };
    if (timing) {
      (ability as { timing: string }).timing = timing;
    }
    if (condition) {
      (ability as { condition: { type: "legion" } }).condition = condition;
    }
    if (preRestrictions) {
      (ability as { restrictions: { type: string }[] }).restrictions = preRestrictions;
    }
    return ability;
  }

  // Extract "Use only if..." restriction from the text
  let restrictions: { type: string }[] | undefined = preRestrictions;
  const useOnlyMatch = remaining.match(
    /\s*Use only if you(?:'ve|'ve) played an Equipment this turn\.?\s*$/i,
  );
  if (useOnlyMatch) {
    restrictions = [{ type: "played-equipment-this-turn" }];
    remaining = remaining.slice(0, remaining.length - useOnlyMatch[0].length);
  }

  // Extract "Use this ability only while I'm at a battlefield" location restriction
  const useOnlyAtBattlefield = remaining.match(
    /\s*Use this ability only while I(?:'m| am) at a battlefield\.?\s*$/i,
  );
  if (useOnlyAtBattlefield) {
    restrictions = [...(restrictions ?? []), { type: "self-at-battlefield" }];
    remaining = remaining.slice(0, remaining.length - useOnlyAtBattlefield[0].length).trim();
  }

  // Extract "Spend this Energy only during showdowns" restriction (mana mod)
  const showdownEnergyOnly = remaining.match(/\s*Spend this Energy only during showdowns\.?\s*$/i);
  if (showdownEnergyOnly) {
    restrictions = [...(restrictions ?? []), { type: "energy-showdown-only" }];
    remaining = remaining.slice(0, remaining.length - showdownEnergyOnly[0].length).trim();
  }

  // Parse the effect
  const effect = parseEffects(remaining);

  // If we have a cost and optionally a condition/timing but can't parse the effect,
  // Still return the activated ability with a raw text effect so the structure is valid
  if (!effect) {
    const stripped = stripReminders(remaining).trim();
    if (!stripped) {
      return undefined;
    }
    // Use a generic "raw" effect for unparsed text
    const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
    const ability: ActivatedAbility = { cost, effect: rawEffect, type: "activated" };
    if (timing) {
      (ability as { timing: string }).timing = timing;
    }
    if (condition) {
      (ability as { condition: { type: "legion" } }).condition = condition;
    }
    if (restrictions) {
      (ability as { restrictions: { type: string }[] }).restrictions = restrictions;
    }
    return ability;
  }

  const ability: ActivatedAbility = { cost, effect, type: "activated" };
  if (timing) {
    (ability as { timing: string }).timing = timing;
  }
  if (condition) {
    (ability as { condition: { type: "legion" } }).condition = condition;
  }
  if (restrictions) {
    (ability as { restrictions: { type: string }[] }).restrictions = restrictions;
  }
  return ability;
}
