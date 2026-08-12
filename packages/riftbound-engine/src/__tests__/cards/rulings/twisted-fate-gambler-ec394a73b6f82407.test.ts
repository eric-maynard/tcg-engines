/**
 * Ruling ec394a73b6f82407 — Twisted Fate, Gambler (OGN-200 → ogn-200-298) · Chaos champion unit · [4] · 4 [Might]
 *   "When I attack, reveal the top rune of your rune deck… [fury] — deal 2… [mind] — draw 1… [order] — stun…"
 *
 * Q: Can I put runes of a domain my legend does not have into my rune deck (to turn on more of TF's branches)?
 * A: No. Every rune in the rune deck must be inside the legend's Domain Identity (rule 103.3.a.1). TF reads three
 *    different domains, but a legend supplies at most two — so in constructed only the branch(es) matching your
 *    legend's domains can ever come up.
 * Rules: 103.3.a (exactly 12 runes), 103.3.a.1 (rune domain ⊆ Domain Identity), 103.1.b (Domain Identity).
 *
 * Deck-construction ruling → exercised through `validateDeck`, not a board scenario.
 */
import { describe, expect, test } from "bun:test";
import type { CardDefLike } from "../../../harness";
import { loadDefaultCardPool } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const TWISTED_FATE = "ogn-200-298"; // Chaos
const LOOSE_CANNON = "ogn-251-298"; // Legend · Fury/Chaos · champion tag "Jinx"
const JINX_DEMOLITIONIST = "ogn-030-298"; // Champion unit · Fury · Jinx
const FURY_RUNE = "ogn-007-298";
const CHAOS_RUNE = "ogn-166-298";
const MIND_RUNE = "ogn-089-298";
const ORDER_RUNE = "ogn-214-298";

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
  const battlefields = pool.all().filter((c) => c.cardType === "battlefield").slice(0, 3);
  /** Loose Cannon (Fury/Chaos) with 3 Twisted Fates in the main deck and the given rune deck. */
  const deck = (runeIds: readonly string[]) =>
    validateDeck({
      battlefields,
      chosenChampion: get(JINX_DEMOLITIONIST),
      legend: get(LOOSE_CANNON),
      mainDeck: [get(JINX_DEMOLITIONIST), get(TWISTED_FATE), get(TWISTED_FATE), get(TWISTED_FATE), ...filler.slice(0, 36)],
      runeDeck: runeIds.map(get),
    } as never);
  const repeat = (id: string, n: number) => Array.from({ length: n }, () => id);
  return { deck, get, repeat };
}

describe("Ruling ec394a73b6f82407 — rune-deck domains are locked to the legend's Domain Identity", () => {
  test("premise: TF is a Chaos champion whose branches read [fury], [mind] and [order]", async () => {
    const { get } = await kit();
    expect(get(TWISTED_FATE)).toMatchObject({ cardType: "unit", domain: "chaos", isChampion: true });
    expect(get(TWISTED_FATE).rulesText).toContain("[fury]");
    expect(get(TWISTED_FATE).rulesText).toContain("[mind]");
    expect(get(TWISTED_FATE).rulesText).toContain("[order]");
    expect(get(LOOSE_CANNON).domain).toEqual(["fury", "chaos"]);
  });

  test("a rune deck inside the identity is legal — 12 Fury runes, or a Fury/Chaos mix", async () => {
    const { deck, repeat } = await kit();
    expect(deck(repeat(FURY_RUNE, 12))).toEqual({ errors: [], valid: true });
    expect(deck([...repeat(FURY_RUNE, 6), ...repeat(CHAOS_RUNE, 6)])).toEqual({ errors: [], valid: true });
  });

  test("a single off-identity Mind rune makes the deck illegal", async () => {
    const { deck, repeat } = await kit();
    const r = deck([...repeat(FURY_RUNE, 11), MIND_RUNE]);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("RUNE_DOMAIN_VIOLATION");
    expect(r.errors.find((e) => e.code === "RUNE_DOMAIN_VIOLATION")?.message).toContain("mind");
  });

  test("an Order rune is rejected the same way — you cannot buy TF's [order] branch by deckbuilding", async () => {
    const { deck, repeat } = await kit();
    const r = deck([...repeat(CHAOS_RUNE, 11), ORDER_RUNE]);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("RUNE_DOMAIN_VIOLATION");
  });

  test("consequence: under this legend only TF's [fury] branch can ever be revealed", async () => {
    const { deck, repeat } = await kit();
    // Every legal rune deck for a Fury/Chaos legend is made of Fury and Chaos runes only…
    expect(deck(repeat(CHAOS_RUNE, 12))).toEqual({ errors: [], valid: true });
    // …and both of TF's other branches need a rune that is illegal here.
    expect(deck([...repeat(FURY_RUNE, 10), MIND_RUNE, ORDER_RUNE]).valid).toBe(false);
  });
});
