/**
 * Text splitting helpers (then-clauses, sentences, ability boundaries).
 */

/**
 * Split an effect string on sentence-level "then" connectors.
 *
 * Recognizes:
 *   - ". Then X"   (new sentence starting with "Then")
 *   - ", then X"   (clause continuation)
 *   - " Then X"    (sentence-terminal period missing)
 *
 * Avoids splitting on "then" that is part of a larger phrase (e.g. "then its
 * owner plays it" would still split — this is the desired behavior for
 * sequence detection; leaf parsers decide whether each chunk is well-formed).
 *
 * Returns an array of parts if the text was split on at least one "then"
 * boundary, otherwise undefined.
 */
export function splitOnThen(text: string): string[] | undefined {
  // Split on any of: ", then " / ". Then " / " Then " (start-of-sentence "Then")
  // But NOT on "and then" (handled by andCompound) and NOT inside parentheses.
  // Preserve relative order.
  const parts: string[] = [];
  let buffer = "";
  let i = 0;
  const len = text.length;
  let depth = 0;
  while (i < len) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (depth === 0) {
      // Case 1: ", then " connector
      if (text.slice(i, i + 7).toLowerCase() === ", then ") {
        parts.push(buffer.trim());
        buffer = "";
        i += 7;
        continue;
      }
      // Case 2: ". Then " connector
      if (text.slice(i, i + 7) === ". Then ") {
        parts.push(buffer.trim());
        buffer = "";
        i += 7;
        continue;
      }
      // Case 3: ". Then," (e.g. "Then, do this:")
      if (text.slice(i, i + 7) === ". Then,") {
        parts.push(buffer.trim());
        buffer = "";
        i += 7;
        continue;
      }
      // Case 4: leading " Then " (tolerant of missing period)
      if (text.slice(i, i + 6) === " Then " && buffer.trim().length > 0) {
        parts.push(buffer.trim());
        buffer = "";
        i += 6;
        continue;
      }
    }

    buffer += ch;
    i++;
  }
  if (buffer.trim().length > 0) {
    parts.push(buffer.trim());
  }
  // Ensure each part ends with a period for downstream parsers
  const cleaned = parts
    .map((p) =>
      p
        .replace(/^[,.\s]+/, "")
        .replace(/\.$/, "")
        .trim(),
    )
    .filter((p) => p.length > 0)
    .map((p) => `${p}.`);
  if (cleaned.length < 2) {
    return undefined;
  }
  return cleaned;
}

/**
 * Split text into sentences, respecting periods followed by spaces
 */
export function splitSentences(text: string): string[] {
  // Split on ". " or "." at end, but don't split on periods inside tokens like ":rb_might:"
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "." && (i === text.length - 1 || text[i + 1] === " " || text[i + 1] === "\n")) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += text[i];
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

/**
 * Split text on ability boundaries: triggers, statics, activated abilities, etc.
 *
 * Recognizes starts of:
 * - Triggered: "When ...", "At the start/end ...", "The first/third time ...", "Whenever ..."
 * - Static: "While ...", "Other ...", "Your ...", "Friendly ...", "Each ..."
 * - Activated: ":rb_..." (cost tokens at start of line)
 *
 * Only splits when there are 2+ recognized boundaries.
 */
export function splitOnAbilityBoundaries(text: string): string[] {
  // Pattern that matches the start of a new ability in card text.
  // Uses lookahead so we don't consume the matched text.
  const boundaryPattern =
    // `(?<!:\s)` — text right after an activation-cost colon ("Disempower this,
    // :rb_energy_1:, :rb_exhaust:: Play a …") is the ability's EFFECT, not a new
    // ability; splitting there strips the cost and demotes it to a free spell.
    /(?<!:\s)(?=(?:When (?:you |I |a |an |another |the )|At the (?:start|end) of |The (?:first|second|third|next) time |Whenever |While (?:I'm|you)|Other friendly |Your [A-Z]|Friendly (?:units|buffed)|Enemy (?:units|gear)|Stunned (?:enemy|friendly) |Each |If (?:you've|an |I )|Play (?:a |an |one |two |three |four |five |six |\d+ )|Recycle \d|Spend ))|(?<=[.\n)]\s*)(?=I enter ready)|(?<=\.\s?)(?=:rb_)|(?<=\.)\n(?=[A-Z\[:])/g;

  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = boundaryPattern.exec(text)) !== null) {
    indices.push(match.index);
    // Advance by 1 to avoid infinite loop on zero-width matches
    if (match[0].length === 0) {
      boundaryPattern.lastIndex = match.index + 1;
    }
  }

  // If the text doesn't start at a boundary, add 0 as the first index
  if (indices.length > 0 && indices[0] !== 0) {
    indices.unshift(0);
  }

  if (indices.length <= 1) {
    return [text];
  }

  const segments: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : text.length;
    const seg = text.slice(start, end).trim();
    if (seg) {
      segments.push(seg);
    }
  }

  return segments;
}
