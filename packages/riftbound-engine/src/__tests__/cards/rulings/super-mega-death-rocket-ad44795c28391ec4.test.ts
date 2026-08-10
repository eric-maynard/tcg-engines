/**
 * Ruling ad44795c28391ec4 — Super Mega Death Rocket! (OGN-252 → ogn-252-298) · Jinx Signature spell · [4][rainbow]
 *   × Tibbers (OGS-018 → ogs-018-024) · 7-Might unit (Annie's signature unit in the starter) — deck construction / setup
 *
 * Q: Can a signature spell like SMDR be placed in the Chosen Champion zone at setup, or must that be a unit?
 * A: Only a champion UNIT whose tag matches the legend goes in the Chosen Champion zone. Signature spells (and signature units
 *    like Tibbers) start in the main deck and must be drawn.
 * Rules: 103.2.a (Chosen Champion: a champion unit matching the Champion Legend's tag), 103.2.d (Signature cards live in the
 *        main deck, max 3, sharing the legend's tag).
 *
 * This is a deck-construction ruling, so it is exercised through `validateDeck` rather than a board scenario.
 */
import { describe, expect, test } from "bun:test";
import type { CardDefLike } from "../../../harness";
import { loadDefaultCardPool } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const SMDR = "ogn-252-298";
const LOOSE_CANNON = "ogn-251-298"; // Legend · Fury/Chaos · champion tag "Jinx"
const JINX_DEMOLITIONIST = "ogn-030-298"; // Champion unit · Fury · Jinx
const TIBBERS = "ogs-018-024"; // non-champion unit · Fury/Chaos
const DARK_CHILD = "ogs-017-024"; // Legend · Fury/Chaos · champion tag "Annie"

async function kit() {
  const pool = await loadDefaultCardPool();
  const get = (id: string) => pool.get(id) as CardDefLike;
  const inDomains = (c: CardDefLike) => {
    const ds = Array.isArray(c.domain) ? c.domain : [c.domain];
    return ds.every((d) => d === "fury" || d === "chaos");
  };
  const seen = new Set<string>();
  const filler = pool
    .all()
    .filter((c) => (c.cardType === "unit" || c.cardType === "spell") && inDomains(c) && c.isChampion !== true && c.isSignature !== true && (c.tags ?? []).length === 0)
    .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))))
    .slice(0, 13)
    .flatMap((c) => [c, c, c]); // 39 plain 3-ofs
  expect(filler).toHaveLength(39);
  const rune = pool.all().find((c) => c.cardType === "rune" && c.domain === "fury") as CardDefLike;
  const battlefields = pool.all().filter((c) => c.cardType === "battlefield").slice(0, 3);
  const deck = (legend: CardDefLike, chosenChampion: CardDefLike, main: readonly CardDefLike[]) =>
    validateDeck({ battlefields, chosenChampion, legend, mainDeck: [...main], runeDeck: Array.from({ length: 12 }, () => rune) } as never);
  return { deck, filler, get };
}

describe("Ruling ad44795c28391ec4 — the Chosen Champion slot takes a champion unit, never a signature spell", () => {
  test("baseline: Loose Cannon (Jinx) + Jinx, Demolitionist as Chosen Champion + SMDR ×3 in the MAIN deck is a legal deck", async () => {
    const { deck, filler, get } = await kit();
    expect(get(LOOSE_CANNON).championTag).toBe("Jinx");
    expect(get(SMDR)).toMatchObject({ cardType: "spell", isSignature: true, tags: ["Jinx"] });
    const r = deck(get(LOOSE_CANNON), get(JINX_DEMOLITIONIST), [get(JINX_DEMOLITIONIST), get(SMDR), get(SMDR), get(SMDR), ...filler.slice(0, 36)]);
    expect(r).toEqual({ errors: [], valid: true });
  });

  test("ruling: SMDR in the Chosen Champion zone is rejected — it is not a champion unit", async () => {
    const { deck, filler, get } = await kit();
    const r = deck(get(LOOSE_CANNON), get(SMDR), [get(JINX_DEMOLITIONIST), ...filler]);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("CHAMPION_NOT_CHAMPION_UNIT");
  });

  test("nuance: a signature UNIT (Tibbers, for the Annie legend) can't be the Chosen Champion either — it belongs in the main deck", async () => {
    const { deck, filler, get } = await kit();
    expect(get(TIBBERS)).toMatchObject({ cardType: "unit" });
    expect(get(TIBBERS).isChampion).not.toBe(true);
    const r = deck(get(DARK_CHILD), get(TIBBERS), [...filler, get(TIBBERS)]);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("CHAMPION_NOT_CHAMPION_UNIT");
  });

  test("nuance: a signature card needs the matching legend — SMDR (Jinx) in an Annie (Dark Child) deck is illegal even in the main deck", async () => {
    const { deck, filler, get } = await kit();
    const pool = await loadDefaultCardPool();
    const annieChampion = pool.all().find((c) => c.cardType === "unit" && c.isChampion === true && (c.tags ?? []).includes("Annie")) as CardDefLike;
    expect(annieChampion).toBeDefined();
    const ok = deck(get(DARK_CHILD), annieChampion, [annieChampion, ...filler]);
    expect(ok).toEqual({ errors: [], valid: true });
    const bad = deck(get(DARK_CHILD), annieChampion, [annieChampion, get(SMDR), ...filler.slice(0, 38)]);
    expect(bad.valid).toBe(false);
  });
});
