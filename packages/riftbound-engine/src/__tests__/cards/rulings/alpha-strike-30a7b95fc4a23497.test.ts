/**
 * Ruling 30a7b95fc4a23497 — Alpha Strike (unl-192-219) × Highlander (ogs-020-024) — deck construction
 *   Both are Master Yi Signature spells (Calm/Body).
 *
 * Q: With a second Yi signature spell released, can a deck run 3 Alpha Strike AND 3 Highlander?
 * A: No. A deck may contain at most 3 Signature cards TOTAL, summed across names. 2 Alpha Strike + 1 Highlander
 *    (or any split totalling ≤ 3) is legal; 3 + 3 is not.
 * Rules: 103.2.d (max 3 Signature cards sharing the Champion Legend's tag, regardless of name).
 *
 * This is a deck-validator ruling, so it is exercised through `validateDeck` rather than a board scenario.
 */
import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool } from "../../../harness";
import type { CardDefLike } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const ALPHA_STRIKE = "unl-192-219";
const HIGHLANDER = "ogs-020-024";
const WUJU_MASTER = "unl-191-219"; // Legend · Calm/Body · champion tag "Master Yi"
const MASTER_YI_TEMPERED = "unl-113-219"; // Champion unit · Body · Master Yi

async function kit() {
  const pool = await loadDefaultCardPool();
  const legend = pool.get(WUJU_MASTER)!;
  const champion = pool.get(MASTER_YI_TEMPERED)!;
  const alpha = pool.get(ALPHA_STRIKE)!;
  const highlander = pool.get(HIGHLANDER)!;
  const seen = new Set<string>();
  const playables = pool
    .all()
    .filter(
      (c) =>
        (c.cardType === "unit" || c.cardType === "spell") &&
        (c.domain === "calm" || c.domain === "body") &&
        c.isChampion !== true &&
        c.isSignature !== true &&
        (c.tags ?? []).length === 0 &&
        c.id !== ALPHA_STRIKE &&
        c.id !== HIGHLANDER,
    )
    .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))));
  const filler = playables.slice(0, 13).flatMap((c) => [c, c, c]); // 39 vanilla-ish 3-ofs
  expect(filler).toHaveLength(39);
  const rune = pool.all().find((c) => c.cardType === "rune" && c.domain === "calm")!;
  const battlefields = pool.all().filter((c) => c.cardType === "battlefield").slice(0, 3);
  const deck = (main: readonly CardDefLike[]) =>
    validateDeck({
      battlefields,
      chosenChampion: champion,
      legend,
      mainDeck: [champion, ...main],
      runeDeck: Array.from({ length: 12 }, () => rune),
    } as never);
  return { alpha, champion, deck, filler, highlander, legend };
}

describe("Ruling 30a7b95fc4a23497 — Signature cards share ONE 3-card limit across names", () => {
  test("baseline: the Master Yi shell (legend + chosen champion + 39 filler) validates clean, so any error below is about the signatures", async () => {
    const { deck, filler, legend } = await kit();
    expect(legend.championTag).toBe("Master Yi");
    expect(deck(filler)).toEqual({ errors: [], valid: true });
  });

  test("2 Alpha Strike + 1 Highlander (3 signatures total) is legal", async () => {
    const { alpha, deck, filler, highlander } = await kit();
    const r = deck([alpha, alpha, highlander, ...filler.slice(0, 36)]);
    expect(r).toEqual({ errors: [], valid: true });
  });

  test("3 Alpha Strike alone, or 3 Highlander alone, is legal (exactly at the cap)", async () => {
    const { alpha, deck, filler, highlander } = await kit();
    expect(deck([alpha, alpha, alpha, ...filler.slice(0, 36)]).valid).toBe(true);
    expect(deck([highlander, highlander, highlander, ...filler.slice(0, 36)]).valid).toBe(true);
  });

  test("ruling 30a7b95fc4a23497 — 3 Alpha Strike + 3 Highlander busts the shared Master Yi Signature cap", async () => {
    const { alpha, deck, filler, highlander } = await kit();
    expect(alpha.isSignature).toBe(true);
    expect(highlander.isSignature).toBe(true);
    const r = deck([alpha, alpha, alpha, highlander, highlander, highlander, ...filler.slice(0, 33)]);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("TOO_MANY_SIGNATURE_CARDS");
    // 4 in any split is also over the shared cap.
    const four = deck([alpha, alpha, highlander, highlander, ...filler.slice(0, 35)]);
    expect(four.valid).toBe(false);
    expect(four.errors.map((e) => e.code)).toContain("TOO_MANY_SIGNATURE_CARDS");
  });
});
