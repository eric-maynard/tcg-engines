/**
 * rule 387 / 388 — Reflexive Triggers: "<main>. Then [you may] do this[ N times]: <body>"
 * (or a bare leading "Do this: <body>"). When <main> resolves, <body> is not
 * carried out inline: a separate triggered Chain Item carrying it is created
 * (N of them for "N times", 387.1.a). Emits `{ type: "reflexive", effect, times?,
 * optional? }`, sequenced after <main>.
 *
 * Not handled here (their own parsers own them): a CONDITIONED reflexive
 * ("If this kills it, do this: …", "Then if you revealed a Bird, do this: …",
 * "for each unit this kills, do this: …", "When you burn a unit this way, do
 * this: …" — the clause is preceded by a comma, not a sentence break) and the
 * Look → banish → play idiom whose "Then you may do this: Empower it" already
 * becomes its own chain item once the played card is on the board.
 */

import type { Effect, SequenceEffect } from "@tcg/riftbound-types/abilities/effect-types";

const TIMES_WORDS: Record<string, number> = { four: 4, once: 1, one: 1, three: 3, thrice: 3, twice: 2, two: 2 };

/** "[Then[,]] [you may] do this[ N times| twice]:" at the start of the text or right after a sentence break. */
const REFLEXIVE_RE =
  /(^|\.\s+)(?:Then,?\s+)?(you may\s+)?do this(?:\s+(?:(\d+|one|two|three|four)\s+times?|(once|twice|thrice)))?:\s*/i;

export function parseReflexiveClause(
  text: string,
  parseEffects: (t: string) => Effect | undefined,
): Effect | undefined {
  if (/^Look at\b/i.test(text)) {
    return undefined;
  }
  const m = REFLEXIVE_RE.exec(text);
  if (!m) {
    return undefined;
  }
  const head = text.slice(0, m.index + (m[1]?.startsWith(".") ? 1 : 0)).trim();
  const bodyText = text.slice(m.index + m[0].length).trim();
  if (!bodyText) {
    return undefined;
  }
  const body = parseEffects(/[.!]$/.test(bodyText) ? bodyText : `${bodyText}.`);
  if (!body || (body as { type?: string }).type === "raw") {
    return undefined;
  }
  const timesRaw = (m[3] ?? m[4])?.toLowerCase();
  const times = timesRaw === undefined ? undefined : (TIMES_WORDS[timesRaw] ?? Number.parseInt(timesRaw, 10));
  let headEffect: Effect | undefined;
  if (head) {
    headEffect = parseEffects(head);
    if (!headEffect || (headEffect as { type?: string }).type === "raw") {
      return undefined;
    }
  }
  // rule 359.3.e.14 — "… of them" / "… it" in the reflexive text is linked to
  // what the main instruction produced: a bare pronoun target reads the
  // sequence's pending value instead of scanning the board.
  const linked = headEffect !== undefined && /\b(?:them|it)\b/i.test(bodyText) ? linkPronounTarget(body) : body;
  const node = {
    effect: linked,
    ...(m[2] ? { optional: true } : {}),
    ...(times !== undefined && Number.isFinite(times) && times !== 1 ? { times } : {}),
    type: "reflexive",
  } as unknown as Effect;
  if (!headEffect) {
    return node;
  }
  const headSteps =
    (headEffect as { type?: string }).type === "sequence" &&
    (headEffect as { pendingValue?: unknown }).pendingValue === undefined
      ? [...(headEffect as unknown as SequenceEffect).effects]
      : [headEffect];
  return {
    effects: [...headSteps, node],
    ...(linked !== body ? { pendingValue: { source: headSteps.length - 1 } } : {}),
    type: "sequence",
  } as unknown as SequenceEffect;
}

/** A bare `{type:"unit"|"permanent"|"gear"}` target (no controller/location/filter) → `pending-value`. */
function linkPronounTarget(effect: Effect): Effect {
  const target = (effect as { target?: unknown }).target as
    | { type?: string; controller?: unknown; location?: unknown; filter?: unknown; quantity?: unknown }
    | string
    | undefined;
  if (target === "self" || (typeof target === "object" && target?.type === "trigger-source")) {
    return { ...(effect as object), target: { type: "pending-value" } } as unknown as Effect;
  }
  if (
    typeof target === "object" &&
    target !== null &&
    (target.type === "unit" || target.type === "permanent" || target.type === "gear") &&
    target.controller === undefined &&
    target.location === undefined &&
    target.filter === undefined
  ) {
    return {
      ...(effect as object),
      target: { ...(target.quantity !== undefined ? { quantity: target.quantity } : {}), type: "pending-value" },
    } as unknown as Effect;
  }
  return effect;
}
