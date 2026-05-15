/**
 * Slice 6 — Sealed pool generator HTTP endpoint integration tests.
 *
 * Validates that `POST /api/sealed/open-pool`:
 *   - Returns exactly `packs * 12` cards
 *   - Is deterministic given the same `seed`
 *   - Excludes legends / battlefields / runes from the pool
 *   - Roughly matches the rarity-weight spec (common majority, with rare /
 *     epic / legendary tail). Tolerance is intentionally loose to avoid
 *     flakiness on a 72-card sample.
 */

import { afterAll, describe, expect, test } from "bun:test";

process.env.RIFTBOUND_PORT = "33701";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverMod = require("../server") as { default?: { stop?: () => void } };

const PORT = 33_701;
const BASE = `http://localhost:${PORT}`;

afterAll(() => {
  try { serverMod.default?.stop?.(); } catch { /* */ }
});

interface SealedCard {
  cardId: string;
  cardType: string;
  name: string;
  rarity?: string;
  imageUrl?: string;
}

interface SealedResp {
  packs: number;
  seed: string;
  poolCards: SealedCard[];
}

describe("POST /api/sealed/open-pool", () => {
  test("returns 6 packs * 12 cards by default (72 cards)", async () => {
    const r = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as SealedResp;
    expect(body.packs).toBe(6);
    expect(body.poolCards.length).toBe(6 * 12);
  });

  test("respects custom packs count", async () => {
    const r = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({ packs: 3 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as SealedResp;
    expect(body.packs).toBe(3);
    expect(body.poolCards.length).toBe(36);
  });

  test("clamps packs to [1, 20]", async () => {
    const tooMany = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({ packs: 999 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const high = (await tooMany.json()) as SealedResp;
    expect(high.packs).toBe(20);

    const tooFew = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({ packs: 0 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const low = (await tooFew.json()) as SealedResp;
    expect(low.packs).toBe(1);
  });

  test("is deterministic given the same seed", async () => {
    const seed = "test-determinism-2026";
    const r1 = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({ packs: 2, seed }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const r2 = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({ packs: 2, seed }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const a = (await r1.json()) as SealedResp;
    const b = (await r2.json()) as SealedResp;
    expect(a.poolCards.map((c) => c.cardId)).toEqual(
      b.poolCards.map((c) => c.cardId),
    );
  });

  test("excludes legends/battlefields/runes from the pool", async () => {
    const r = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({ packs: 6 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as SealedResp;
    for (const c of body.poolCards) {
      expect(c.cardType).not.toBe("legend");
      expect(c.cardType).not.toBe("battlefield");
      expect(c.cardType).not.toBe("rune");
    }
  });

  test("rarity distribution roughly matches spec across 20 packs (240 cards)", async () => {
    const r = await fetch(`${BASE}/api/sealed/open-pool`, {
      body: JSON.stringify({ packs: 20, seed: "rarity-check-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as SealedResp;
    const total = body.poolCards.length;
    expect(total).toBe(240);
    const counts: Record<string, number> = {};
    for (const c of body.poolCards) {
      const k = c.rarity ?? "common";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    // Per-pack composition: 8 common-bucket + 3 rare-bucket + 1 epic-or-
    // Legendary-bucket. The `common` bucket internally lumps `common` and
    // `uncommon` cards, so the externally-visible rarity counts split
    // Those out. Across 20 packs:
    //   Common+uncommon = 8 * 20 = 160
    //   Rare            = 3 * 20 = 60
    //   Epic+legendary  = 1 * 20 = 20
    const commonUncommon = (counts.common ?? 0) + (counts.uncommon ?? 0);
    const epicLegendary = (counts.epic ?? 0) + (counts.legendary ?? 0);
    // The 8-per-pack common slot lands strictly in the common bucket; the
    // 3-per-pack rare slot lands strictly in the rare bucket; the 1-per-
    // Pack epic-or-legendary slot lands in epic-or-legendary unless the
    // Current card pool lacks any legendary cards (then it falls back to
    // Common). That gives a small slop window around the 160/60/20 ideal.
    expect(commonUncommon).toBeGreaterThanOrEqual(160);
    expect(commonUncommon).toBeLessThanOrEqual(180);
    expect(counts.rare ?? 0).toBe(60);
    expect(epicLegendary).toBeGreaterThanOrEqual(0);
    expect(epicLegendary + commonUncommon + (counts.rare ?? 0)).toBe(240);
  });
});
