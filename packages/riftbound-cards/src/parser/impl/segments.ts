/**
 * Splitting ability text into keyword / other segments.
 */

import {
  ALL_COST_KEYWORDS,
  ALL_EFFECT_KEYWORDS,
  ALL_SIMPLE_KEYWORDS,
  ALL_VALUE_KEYWORDS,
  KEYWORD_AT_POS_RE,
  findNextKeywordIndex,
  findNextStandaloneKeywordIndex,
} from "./keywords";

// ============================================================================
// Multi-Ability Text Splitting
// ============================================================================

/**
 * Represents a segment of card text identified during splitting.
 */
export interface TextSegment {
  readonly text: string;
  readonly type: "keyword" | "other";
}

/**
 * Skip past balanced parentheses and any italic markers surrounding them.
 * Returns index immediately after the closing paren (and trailing italic/space).
 */
export function skipReminderText(text: string, startIndex: number): number {
  let i = startIndex;

  // Skip italic markers and spaces before the paren
  while (i < text.length && (text[i] === "_" || text[i] === " " || text[i] === "*")) {
    i++;
  }

  if (i >= text.length || text[i] !== "(") {
    return startIndex;
  }

  // Find the matching closing paren
  let depth = 0;
  while (i < text.length) {
    if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        i++;
        // Skip trailing italic markers and spaces
        while (i < text.length && (text[i] === "_" || text[i] === " " || text[i] === "*")) {
          i++;
        }
        return i;
      }
    }
    i++;
  }
  return startIndex;
}

/**
 * Split card text into segments, each representing a single ability.
 *
 * Identifies keyword boundaries based on `[Keyword]` patterns and separates
 * the remaining text (triggers, statics, activated, spells) into its own segments.
 */
export function splitAbilityText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Try to match a keyword at current position
    const remaining = text.slice(i);
    const kwMatch = KEYWORD_AT_POS_RE.exec(remaining);

    if (kwMatch) {
      // Skip keyword brackets that appear in inline reference context
      // (e.g., "with [Temporary]", "from [Hidden]", "has [Deflect]")
      const precedingText = text.slice(Math.max(0, i - 6), i);
      if (precedingText.match(/(?:with|from)\s*$/i)) {
        // Not a real keyword boundary - consume as regular text
        const restText = text.slice(i);
        const nextKwIdx = findNextKeywordIndex(restText.slice(kwMatch[0].length));
        let endIdx: number;
        if (nextKwIdx > 0) {
          endIdx = i + kwMatch[0].length + nextKwIdx;
        } else {
          endIdx = len;
        }
        // Append to previous "other" segment if exists, otherwise create new one
        const chunk = text.slice(i, endIdx).trim();
        if (chunk) {
          if (segments.length > 0 && segments[segments.length - 1].type === "other") {
            segments[segments.length - 1] = {
              text: segments[segments.length - 1].text + " " + chunk,
              type: "other",
            };
          } else {
            segments.push({ text: chunk, type: "other" });
          }
        }
        i = endIdx;
        continue;
      }

      const keyword = kwMatch[1];
      let endOfKeyword = i + kwMatch[0].length;

      // Depending on keyword type, consume associated text
      if (ALL_SIMPLE_KEYWORDS.includes(keyword)) {
        // Simple keywords: consume optional reminder text
        endOfKeyword = skipReminderText(text, endOfKeyword);
        segments.push({ text: text.slice(i, endOfKeyword).trim(), type: "keyword" });
        i = endOfKeyword;
      } else if (ALL_VALUE_KEYWORDS.includes(keyword)) {
        // Value keywords: "[Assault 2]" - consume optional reminder text
        endOfKeyword = skipReminderText(text, endOfKeyword);
        segments.push({ text: text.slice(i, endOfKeyword).trim(), type: "keyword" });
        i = endOfKeyword;
      } else if (ALL_COST_KEYWORDS.includes(keyword)) {
        // Cost keywords: "[Accelerate] (reminder)" or "[Equip] :cost: (reminder)"
        // Or "[Repeat] :cost: (reminder)"
        // Need to consume the cost tokens and reminder text
        let costEnd = endOfKeyword;

        // For Equip / Repeat / Flow: consume inline cost tokens and optional "— " prefix
        if (keyword === "Equip" || keyword === "Repeat" || keyword === "Flow") {
          // Skip optional " — " prefix (also always skip leading whitespace)
          const dashMatch = text.slice(costEnd).match(/^\s*(?:—\s*)?/);
          if (dashMatch) {
            costEnd += dashMatch[0].length;
          }
          // Consume cost tokens (energy/rune patterns)
          const costTokenMatch = text
            .slice(costEnd)
            .match(/^((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)/);
          if (costTokenMatch) {
            costEnd += costTokenMatch[0].length;
          }
          // For Equip, also consume ", additional cost text"
          if (keyword === "Equip") {
            const additionalMatch = text.slice(costEnd).match(/^,\s*[^(]+/);
            if (additionalMatch) {
              costEnd += additionalMatch[0].length;
            }
          }
        }

        // Skip spaces
        while (costEnd < len && text[costEnd] === " ") {
          costEnd++;
        }

        // Consume reminder text
        costEnd = skipReminderText(text, costEnd);

        segments.push({ text: text.slice(i, costEnd).trim(), type: "keyword" });
        i = costEnd;
      } else if (ALL_EFFECT_KEYWORDS.includes(keyword)) {
        // Effect keywords: "[Deathknell] — effect text. (reminder)"
        // "[Vision] (reminder)" or "[Legion] — effect text (reminder)"
        // Also tolerates the dash-less form: "[Deathknell] [Predict 2]." /
        // "[Deathknell] Draw 1." (common in UNL card text).
        let effectEnd = endOfKeyword;
        let hadEffectPrefix = false;

        // Skip optional " — "
        const dashMatch = text.slice(effectEnd).match(/^\s*—\s*/);
        if (dashMatch) {
          effectEnd += dashMatch[0].length;
          hadEffectPrefix = true;
        } else {
          // Dash-less form: still treat the following text as the effect if
          // There is any non-reminder text before the next standalone keyword.
          // Skip any leading whitespace first.
          let probe = effectEnd;
          while (probe < len && text[probe] === " ") {
            probe++;
          }
          // If we land on another standalone keyword with no text in between,
          // Fall through to the old reminder-only path.
          const nextKwIdxImmediate = findNextStandaloneKeywordIndex(text.slice(probe));
          if (nextKwIdxImmediate !== 0) {
            effectEnd = probe;
            hadEffectPrefix = true;
          }
        }

        if (hadEffectPrefix) {
          // Consume effect text bounded by reminder text or next keyword.
          const restAfterPrefix = text.slice(effectEnd);
          const reminderIdx = restAfterPrefix.search(/_?\s*\(/);
          const nextKwIdx = findNextKeywordIndex(restAfterPrefix);
          if (reminderIdx >= 0 && (nextKwIdx < 0 || reminderIdx < nextKwIdx)) {
            effectEnd = skipReminderText(text, effectEnd + reminderIdx);
          } else if (nextKwIdx > 0) {
            effectEnd += nextKwIdx;
          } else if (nextKwIdx === 0) {
            // No effect text
          } else {
            effectEnd = len;
          }
        } else {
          // No dash and no following effect: only consume reminder text.
          effectEnd = skipReminderText(text, effectEnd);
        }

        // Build the segment text and remove trailing reminders
        let segText = text.slice(i, effectEnd).trim();
        segText = segText.replace(/\s*_?\s*\([^)]*\)\s*_?\s*$/, "").trim();

        segments.push({ text: segText, type: "keyword" });
        i = effectEnd;
      } else {
        // Unknown keyword, just consume the bracket
        segments.push({ text: kwMatch[0], type: "keyword" });
        i = endOfKeyword;
      }
    } else {
      // Not a keyword - consume until the next standalone keyword bracket.
      // Use findNextStandaloneKeywordIndex to avoid splitting on keyword
      // References inside sentences (e.g., "have [Vision]").
      const rest = text.slice(i);
      const nextKwIdx = findNextStandaloneKeywordIndex(rest);

      let endIdx: number;
      if (nextKwIdx > 0) {
        endIdx = i + nextKwIdx;
      } else {
        endIdx = len;
      }

      const segment = text.slice(i, endIdx).trim();
      if (segment) {
        segments.push({ text: segment, type: "other" });
      }
      i = endIdx;
    }
  }

  return segments;
}
