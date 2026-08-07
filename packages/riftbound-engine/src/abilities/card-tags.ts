/**
 * Effective tags of a card on the board.
 *
 * rule 135.2.b.3 — a tag gained while the card was played ("As you play me,
 * choose Bird, Cat, Dog, or Poro. I gain that tag.") counts everywhere a
 * printed tag counts: tag filters, "among your units" tallies, tribal
 * triggers. Every tag reader should go through here so they agree.
 */

export interface TagBearingMeta {
  readonly namedTag?: string;
  readonly grantedTags?: readonly string[];
}

export function effectiveTags(
  printed: readonly string[] | undefined,
  meta: TagBearingMeta | undefined,
): string[] {
  const gained = [...(meta?.grantedTags ?? []), ...(meta?.namedTag ? [meta.namedTag] : [])];
  return [...(printed ?? []), ...gained];
}

export function hasEffectiveTag(
  printed: readonly string[] | undefined,
  meta: TagBearingMeta | undefined,
  tag: string,
): boolean {
  const wanted = tag.toLowerCase();
  return effectiveTags(printed, meta).some((t) => t.toLowerCase() === wanted);
}
