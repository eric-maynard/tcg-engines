/**
 * Ruling d00e9a9e96a15baa — Teemo, Scout (OGN-197 → ogn-197-298) · Champion Unit · Chaos · [2] · 1 (tag Teemo)
 *   × Ekko, Recurrent (OGN-110 → ogn-110-298) · Champion Unit · Mind · [5][mind] · 5 (tag Ekko)
 *   (Legend: Swift Scout ogn-263-298 · Mind/Chaos · champion tag "Teemo".)
 *
 * Q: Can the main deck include champion units different from your legend, and also copies of your legend's champion?
 * A: Yes to both: with Teemo as the legend/chosen champion you may run up to 3 copies of other champions (e.g. 3 Ekkos)
 *    and additional copies of Teemo in the main deck (e.g. 2 Teemos), subject to the usual limits.
 * Rules: 103.2.a (chosen champion matches the legend's tag), 103.2.b (max 3 per name), 103.1.b (domain identity).
 *
 * Deck-construction ruling → exercised through `validateDeck`, not a board scenario.
 */
import { describe, expect, test } from "bun:test";
import type { CardDefLike } from "../../../harness";
import { loadDefaultCardPool } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const TEEMO_SCOUT = "ogn-197-298";
const EKKO_RECURRENT = "ogn-110-298";
const SWIFT_SCOUT = "ogn-263-298"; // Legend · Mind/Chaos · "Teemo"

async function kit() {
  const pool = await loadDefaultCardPool();
  const get = (id: string) => pool.get(id) as CardDefLike;
  const inDomains = (c: CardDefLike) => {
    const ds = c.domain === undefined ? [] : Array.isArray(c.domain) ? c.domain : [c.domain];
    return ds.every((d) => d === "mind" || d === "chaos");
  };
  const seen = new Set<string>();
  const filler = pool
    .all()
    .filter((c) => (c.cardType === "unit" || c.cardType === "spell") && inDomains(c) && c.isChampion !== true && c.isSignature !== true && (c.tags ?? []).length === 0)
    .filter((c) => !(c.keywords ?? []).includes("Unique"))
    .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))))
    .slice(0, 13)
    .flatMap((c) => [c, c, c]); // 39 plain 3-ofs
  expect(filler).toHaveLength(39);
  const rune = pool.all().find((c) => c.cardType === "rune" && c.domain === "chaos") as CardDefLike;
  const battlefields = pool.all().filter((c) => c.cardType === "battlefield" && (c.domain === undefined || inDomains(c))).slice(0, 3);
  const deck = (main: readonly CardDefLike[]) =>
    validateDeck({
      battlefields,
      chosenChampion: get(TEEMO_SCOUT),
      legend: get(SWIFT_SCOUT),
      mainDeck: [...main],
      runeDeck: Array.from({ length: 12 }, () => rune),
    } as never);
  return { deck, filler, get };
}

describe("Ruling d00e9a9e96a15baa — off-legend champions and extra copies of your legend's champion are legal main-deck cards", () => {
  test("premise: Swift Scout is the Teemo legend (Mind/Chaos); Teemo, Scout and Ekko, Recurrent are champion units in those domains with different tags", async () => {
    const { get } = await kit();
    expect(get(SWIFT_SCOUT)).toMatchObject({ cardType: "legend", championTag: "Teemo" });
    expect(get(TEEMO_SCOUT)).toMatchObject({ cardType: "unit", domain: "chaos", isChampion: true, tags: ["Teemo"] });
    expect(get(EKKO_RECURRENT)).toMatchObject({ cardType: "unit", domain: "mind", isChampion: true, tags: ["Ekko"] });
  });

  test("baseline: legend Swift Scout + chosen champion Teemo + 40 plain cards is a legal deck", async () => {
    const { deck, filler, get } = await kit();
    const r = deck([get(TEEMO_SCOUT), ...filler]);
    expect(r).toEqual({ errors: [], valid: true });
  });

  test("ruling: 3 Ekko, Recurrent (a DIFFERENT champion) in the main deck of a Teemo deck — legal", async () => {
    const { deck, filler, get } = await kit();
    const r = deck([get(EKKO_RECURRENT), get(EKKO_RECURRENT), get(EKKO_RECURRENT), ...filler]);
    expect(r).toEqual({ errors: [], valid: true });
  });

  test("ruling: 2 extra Teemo, Scout in the main deck alongside 3 Ekkos — legal too", async () => {
    const { deck, filler, get } = await kit();
    const r = deck([get(TEEMO_SCOUT), get(TEEMO_SCOUT), get(EKKO_RECURRENT), get(EKKO_RECURRENT), get(EKKO_RECURRENT), ...filler]);
    expect(r).toEqual({ errors: [], valid: true });
  });

  test("nuance: the ordinary 3-per-name limit still applies to off-legend champions — a 4th Ekko is rejected", async () => {
    const { deck, filler, get } = await kit();
    const r = deck([get(EKKO_RECURRENT), get(EKKO_RECURRENT), get(EKKO_RECURRENT), get(EKKO_RECURRENT), ...filler]);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("TOO_MANY_COPIES");
  });
});
