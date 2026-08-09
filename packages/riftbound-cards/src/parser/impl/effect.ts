/**
 * Single-effect dispatcher (parseEffect).
 */

import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseAttachEffect, parseDetachEffect } from "./effects-attach";
import {
  parseCounterEffect,
  parseExtraTurnEffect,
  parseGainControlOfSpellEffect,
  parseLoseControlEffect,
  parseTakeControlEffect,
  parseWinGameEffect,
} from "./effects-control";
import {
  parseDamageEffect,
  parseFightEffect,
  parseKillEffect,
  parsePreventDamageEffect,
} from "./effects-damage";
import {
  parseBurnEffect,
  parseDiscardEffect,
  parseDrawEffect,
  parseLookEffect,
  parsePredictEffect,
  parseRecycleEffect,
} from "./effects-draw";
import { parseExhaustEffect, parseReadyEffect, parseStunEffect } from "./effects-exhaust";
import { parseGrantKeywordEffect } from "./effects-grant-keyword";
import {
  parseBuffEffect,
  parseDoubleMightEffect,
  parseHealEffect,
  parseModifyMightEffect,
  parseSetBaseMightEffect,
  parseSpendBuffEffect,
} from "./effects-might";
import {
  parseNextSpellBonusDamageEffect,
  parseNextUnitEntersReadyEffect,
  parsePlayEffect,
} from "./effects-misc";
import { parseMoveAndTakeControlEffect, parseMoveEffect } from "./effects-move";
import {
  parseAddResourceEffect,
  parseChannelEffect,
  parseEmpowerEffect,
  parseGainXpEffect,
  parseScoreEffect,
  parseSpendXpEffect,
  parseSpendXpToEffect,
} from "./effects-resources";
import { parseBanishEffect, parseRecallEffect, parseReturnToHandEffect } from "./effects-return";
import { parseCreateTokenEffect, parseReplaceBattlefieldEffect } from "./effects-tokens";
import { normalizeTokens, stripReminders } from "./normalize";

export function parseEffect(text: string): Effect | undefined {
  let cleaned = normalizeTokens(stripReminders(text)).trim();
  if (!cleaned) {
    return undefined;
  }

  // Strip "You may" prefix for optional effects
  const youMayMatch = cleaned.match(/^You may\s+/i);
  if (youMayMatch) {
    cleaned = cleaned.slice(youMayMatch[0].length);
  }

  return (
    parseNextUnitEntersReadyEffect(cleaned) ??
    parseNextSpellBonusDamageEffect(cleaned) ??
    parseBurnEffect(cleaned) ??
    parseDrawEffect(cleaned) ??
    parseChannelEffect(cleaned) ??
    parseBuffEffect(cleaned) ??
    parseDamageEffect(cleaned) ??
    parseSetBaseMightEffect(cleaned) ??
    parseModifyMightEffect(cleaned) ??
    parseDoubleMightEffect(cleaned) ??
    parseKillEffect(cleaned) ??
    parseHealEffect(cleaned) ??
    parseStunEffect(cleaned) ??
    parseBanishEffect(cleaned) ??
    parseMoveAndTakeControlEffect(cleaned) ??
    parseMoveEffect(cleaned) ??
    parseReturnToHandEffect(cleaned) ??
    parseRecallEffect(cleaned) ??
    parseReadyEffect(cleaned) ??
    parseExhaustEffect(cleaned) ??
    parseGrantKeywordEffect(cleaned) ??
    parseCounterEffect(cleaned) ??
    parseLookEffect(cleaned) ??
    parseFightEffect(cleaned) ??
    parsePreventDamageEffect(cleaned) ??
    parseGainControlOfSpellEffect(cleaned) ??
    parseTakeControlEffect(cleaned) ??
    parseSpendBuffEffect(cleaned) ??
    parseLoseControlEffect(cleaned) ??
    parseExtraTurnEffect(cleaned) ??
    parseWinGameEffect(cleaned) ??
    parseCreateTokenEffect(cleaned) ??
    parseReplaceBattlefieldEffect(cleaned) ??
    parseDiscardEffect(cleaned) ??
    parseRecycleEffect(cleaned) ??
    parseAddResourceEffect(cleaned) ??
    parseScoreEffect(cleaned) ??
    parsePlayEffect(cleaned) ??
    parseAttachEffect(cleaned) ??
    parseDetachEffect(cleaned) ??
    parseGainXpEffect(cleaned) ??
    parseSpendXpToEffect(cleaned) ??
    parseSpendXpEffect(cleaned) ??
    parsePredictEffect(cleaned) ??
    parseEmpowerEffect(cleaned) ??
    undefined
  );
}
