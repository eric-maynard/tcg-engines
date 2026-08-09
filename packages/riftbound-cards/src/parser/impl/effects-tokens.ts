/**
 * Effect parsers: create token.
 */

import type {
  CreateTokenEffect,
  ReplaceBattlefieldEffect,
  TokenDefinition,
} from "@tcg/riftbound-types/abilities/effect-types";
import { wordToNumber } from "./tokens";

/** Printed battlefield tokens, by printed name (rule 187.7 / 187.8). */
const BATTLEFIELD_TOKEN_IDS: Record<string, string> = { brush: "unl-t03" };

/**
 * rule 438.1 — "replace that battlefield with a Brush battlefield token."
 * The wording names a battlefield TOKEN, so it is a Replace (the printed
 * battlefield goes to Banishment, 438.5), not a play.
 */
export function parseReplaceBattlefieldEffect(text: string): ReplaceBattlefieldEffect | undefined {
  const match = text.match(
    /^replace (?:that|this) battlefield with (?:a|an|the)\s+([\w'\- ]+?)\s+battlefield tokens?\.?$/i,
  );
  if (!match?.[1]) {
    return undefined;
  }
  const name = match[1].trim();
  const id = BATTLEFIELD_TOKEN_IDS[name.toLowerCase()];
  return { token: id ? { id, name } : { name }, type: "replace-battlefield", which: "that" };
}

/**
 * Try to parse a create-token effect.
 * Handles patterns like:
 *   "Play a 1 :rb_might: Recruit unit token."
 *   "Play four 1 :rb_might: Recruit unit tokens."
 *   "Play a ready 3 :rb_might: Sprite unit token with [Temporary]."
 *   "Play a Gold gear token exhausted."
 *   Location suffixes: "here", "to your base"
 */
export function parseCreateTokenEffect(text: string): CreateTokenEffect | undefined {
  // Pattern for gear tokens (no might): "Play a Gold gear token [exhausted]."
  const gearMatch = text.match(
    /^Play (a|an|one|two|three|four|five|six|\d+)\s+(\w+(?:\s+\w+)?)\s+(gear)\s+tokens?\s*(exhausted)?(?:\s+(?:here|to your base))?\.?$/i,
  );
  if (gearMatch) {
    const token: TokenDefinition = {
      name: gearMatch[2],
      type: gearMatch[3] as "gear",
    };
    const effect: {
      type: "create-token";
      token: TokenDefinition;
      amount?: number;
      ready?: boolean;
      location?: string;
    } = {
      token,
      type: "create-token",
    };
    const amount = wordToNumber(gearMatch[1]);
    if (amount > 1) {
      effect.amount = amount;
    }
    // Rule 185.2.d (sfd-004-221): "…gear token exhausted" enters exhausted.
    if (gearMatch[4]) {
      effect.ready = false;
    }
    return effect as CreateTokenEffect;
  }

  // Pattern for unit tokens with might: "Play [a|N] [ready] N :rb_might: NAME unit token(s) [with [KEYWORD]] [from REGION] [location]."
  // Might value may also be expressed as ":rb_energy_N:" (the [N] bracket form
  // Gets normalized that way upstream).
  // "from <Region>" (ven-100-166 "…from Bilgewater") is flavour naming the
  // token's origin region, not a zone — rule 184.2 still uses the normal
  // unit-play destinations, so the clause is matched and discarded.
  const unitMatch = text.match(
    /^Play (a|an|one|two|three|four|five|six|\d+)\s+(?:(ready)\s+)?(?::rb_energy_(\d+):\s*)?(\d+)?\s*:rb_might:\s+(\w+(?:\s+\w+)?)\s+(unit)\s+tokens?(?:\s+with\s+\[(\w+(?:-\w+)?)\])?(?:\s+from\s+(?!your\b|their\b|the\b)\w+)?\s*(here|to (?:your|their) base|into (?:your|their) base|at (?:your|their) base|exhausted)?\.?$/i,
  );
  if (unitMatch) {
    const quantityStr = unitMatch[1];
    const readyStr = unitMatch[2];
    const energyMightStr = unitMatch[3];
    const plainMightStr = unitMatch[4];
    const tokenName = unitMatch[5];
    const tokenType = unitMatch[6] as "unit";
    const keywordStr = unitMatch[7];
    const suffixStr = unitMatch[8];

    const mightStr = energyMightStr ?? plainMightStr;
    if (!mightStr) {
      return undefined;
    }
    const might = Number.parseInt(mightStr, 10);
    const amount = wordToNumber(quantityStr);

    const token: { name: string; type: "unit"; might: number; keywords?: string[] } = {
      might,
      name: tokenName,
      type: tokenType,
    };
    if (keywordStr) {
      token.keywords = [keywordStr];
    }

    const effect: {
      type: "create-token";
      token: TokenDefinition;
      amount?: number;
      ready?: boolean;
      location?: string;
    } = {
      token: token as TokenDefinition,
      type: "create-token",
    };

    if (amount > 1) {
      effect.amount = amount;
    }
    if (readyStr) {
      effect.ready = true;
    }

    if (suffixStr) {
      const lower = suffixStr.toLowerCase();
      if (lower === "here") {
        effect.location = "here";
      } else if (
        lower === "to your base" ||
        lower === "into your base" ||
        lower === "at your base" ||
        lower === "to their base" ||
        lower === "into their base" ||
        lower === "at their base"
      ) {
        effect.location = "base";
      }
    }

    return effect as CreateTokenEffect;
  }

  return undefined;
}
