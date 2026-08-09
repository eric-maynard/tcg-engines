/**
 * HTML-entity decoding for imported card text.
 *
 * The set generators scrape printed card text out of HTML, so a handful of
 * cards arrive with `&gt;`, `&quot;` and friends still encoded (`[Empowered][&gt;]`,
 * `"[rainbow][rainbow]: Ready me."`). Rules text reaching the engine must be
 * plain text: every consumer (the ability parser, the harness, any UI that
 * prints a card) would otherwise need its own workaround.
 *
 * Decoding happens once, at import, for BOTH pipelines (`.ts` card modules and
 * the set JSON), so nothing downstream sees an entity.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/** Decode the numeric and named HTML entities that appear in printed card text. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body.startsWith("#x") || body.startsWith("#X")
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** True when `text` still carries an HTML entity (used by the set-data guard test). */
export function hasHtmlEntity(text: string): boolean {
  return /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text);
}
