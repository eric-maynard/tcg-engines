/**
 * Ruling 4963913905dc5e51 — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Unit/Champion · Mind · [3][mind] · 3 Might
 *   "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Renata Glasc, Mastermind (SFD-088 → sfd-088-221) — "[1][mind]: Draw 1.
 *     [4][mind][mind][mind][mind], [Exhaust]: Score 1 point. Use my abilities only while I'm at a battlefield."
 *
 * Q: Can Heimerdinger use Renata's exhaust ability to score a point even while he is not at a battlefield?
 * A: Yes. He copies the [Exhaust] ability itself; Renata's "use my abilities only while I'm at a battlefield"
 *    is a separate line of text, not part of that ability, so it does not come along. He still has to pay
 *    [4][mind][mind][mind][mind] and exhaust HIMSELF — and having exhausted, he can only do it once a turn.
 * Rules: 151 (an ability's cost is paid by the object using it), 322 (a separate restriction line is its own
 *        continuous effect, tied to its own source), 406 (activated abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const RENATA_MASTERMIND = "sfd-088-221";

/** Heimerdinger and Renata both sit at P1's BASE, with exactly [4][mind][mind][mind][mind] in the pool. */
async function bothAtBase(): Promise<Game> {
  return await scenario()
    .resources(P1, { energy: 4, power: { mind: 4 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", HEIMERDINGER, "heimer")
    .unit(P1, "base", RENATA_MASTERMIND, "renata")
    .build();
}

describe("Ruling 4963913905dc5e51 — Heimerdinger inherits Renata's [Exhaust] ability but not her battlefield restriction", () => {
  test("from BASE, Heimerdinger fires the inherited ability and scores a point", async () => {
    const game = await bothAtBase();
    expect(game.locationOf("heimer")).toBe("base");
    expect(game.p1.legal().map((o) => o.key)).toContain("activateAbility:heimer#1");

    await game.p1.activate("heimer", 1);
    await game.settle();

    expect(game.p1.points()).toBe(1);
    expect(game.state("heimer").isExhausted).toBe(true); // HE paid the exhaust, not Renata
    expect(game.state("renata").isExhausted).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("Renata herself, sitting at base, cannot use any of her abilities — the restriction still binds HER", async () => {
    const game = await bothAtBase();

    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).not.toContain("activateAbility:renata#0");
    expect(keys).not.toContain("activateAbility:renata#1");
  });

  test("move Renata to a battlefield and both of her own abilities come back", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { mind: 8 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RENATA_MASTERMIND, "renata")
      .unit(P1, "base", HEIMERDINGER, "heimer")
      .build();

    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).toContain("activateAbility:renata#0");
    expect(keys).toContain("activateAbility:renata#1");
  });

  test("only [Exhaust] abilities are inherited — Renata's plain [1][mind]: Draw 1 is not on Heimerdinger", async () => {
    const game = await bothAtBase();

    expect(game.p1.legal().map((o) => o.key)).not.toContain("activateAbility:heimer#0");
  });

  test("once exhausted he cannot fire it again this turn, however much Power is left", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { mind: 9 } })
      .unit(P1, "base", HEIMERDINGER, "heimer")
      .unit(P1, "base", RENATA_MASTERMIND, "renata")
      .build();

    await game.p1.activate("heimer", 1);
    await game.settle();

    expect(game.p1.points()).toBe(1);
    expect(game.p1.legal().map((o) => o.key)).not.toContain("activateAbility:heimer#1");
  });
});
