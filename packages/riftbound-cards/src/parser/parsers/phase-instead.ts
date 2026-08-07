/**
 * Shared rider: "<instruction> N. If it's your <Phase> Phase, <verb> M instead."
 *
 * rule 318 / 319 (unl-172-219 LeBlanc, Fragmented) — every phase belongs to the
 * turn player, so "YOUR Beginning Phase" is satisfied only while the effect's
 * controller is the turn player and the game is in that phase. The rider
 * REPLACES the printed amount (2 cards, never 1 + 2).
 */
import type { Effect } from "@tcg/riftbound-types";

const PHASE_INSTEAD_PATTERN =
  /^(.+?[^.])\.\s*If it(?:'s| is) your\s+(Awaken|Beginning|Draw|Main|Combat|Ending)\s+Phase,\s*(?:[a-z]+\s+)?(\d+)(?:\s+[^.]*?)?\s+instead\.?\s*$/is;

/**
 * Returns a `conditional` effect when `text` is an amount-replacing phase
 * rider, else undefined. `parseBase` parses the leading instruction.
 */
export function parsePhaseInsteadRider(
  text: string,
  parseBase: (text: string) => Effect | undefined,
): Effect | undefined {
  const match = text.match(PHASE_INSTEAD_PATTERN);
  if (!match) {
    return undefined;
  }
  const base = parseBase(`${match[1]}.`);
  const amount = Number(match[3]);
  const baseAmount = (base as { amount?: unknown } | undefined)?.amount;
  if (!base || typeof baseAmount !== "number" || baseAmount === amount) {
    return undefined;
  }
  return {
    condition: { phase: match[2].toLowerCase(), type: "during-phase", whose: "you" },
    else: base,
    then: { ...base, amount },
    type: "conditional",
  } as unknown as Effect;
}
