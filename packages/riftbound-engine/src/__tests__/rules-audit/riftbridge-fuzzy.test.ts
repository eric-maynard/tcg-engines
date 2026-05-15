/**
 * Test for the riftbridge `search-card-name` fuzzy lookup.
 *
 * The CLI exposes a `search-card-name` subcommand that takes a colloquial
 * query (e.g. "rocket") and returns up to N canonical card-name matches from
 * the riftbound-cards registry. The agentic orchestrator advertises this
 * subcommand so a sub-agent can resolve vague card references before calling
 * instantiate-card / play-card.
 */

import { describe, expect, it } from "bun:test";

import { fuzzyCardNameSearch } from "../../../../../.claude/skills/riftjudge-engine-bridge/scripts/riftbridge-state";

describe("riftbridge search-card-name fuzzy lookup", () => {
  it("returns an exact card on a full case-insensitive name", () => {
    const out = fuzzyCardNameSearch("battering ram", 3);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].name).toBe("Battering Ram");
    // Exact match should beat partial matches.
    expect(out[0].score).toBeGreaterThanOrEqual(900);
  });

  it("resolves a colloquial single-word query to a canonical multi-word card name", () => {
    const out = fuzzyCardNameSearch("rocket", 5);
    expect(out.length).toBeGreaterThan(0);
    const names = out.map((m) => m.name);
    // At least one rocket-named card should surface.
    expect(names.some((n) => /rocket/i.test(n))).toBe(true);
  });

  it("respects maxResults", () => {
    const out = fuzzyCardNameSearch("the", 3);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array on empty query", () => {
    expect(fuzzyCardNameSearch("", 5)).toEqual([]);
  });

  it("returns empty array when no card name overlaps", () => {
    const out = fuzzyCardNameSearch("xyzqqqqzzznotacard", 5);
    expect(out).toEqual([]);
  });

  it("ranks substring containment above partial-token-prefix", () => {
    // "legion rear" → "Legion Rearguard" (substring of joined tokens via
    // Word-overlap, top); "Legion Quartermaster" only shares one token.
    const out = fuzzyCardNameSearch("legion rear", 5);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].name).toBe("Legion Rearguard");
    // Second-place candidates (Legion Quartermaster etc) should score lower.
    if (out.length > 1) {
      expect(out[0].score).toBeGreaterThan(out[1].score);
    }
  });

  it("surfaces card metadata (cardType + might) for downstream use", () => {
    const out = fuzzyCardNameSearch("legion rear", 3);
    const hit = out.find((m) => m.name === "Legion Rearguard");
    expect(hit).toBeDefined();
    expect(hit!.cardType).toBe("unit");
    expect(typeof hit!.might === "number" || hit!.might === null).toBe(true);
  });
});
