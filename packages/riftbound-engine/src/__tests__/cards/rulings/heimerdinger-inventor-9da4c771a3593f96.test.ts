/**
 * Ruling 9da4c771a3593f96 — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · 3 Might
 *   "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Renata Glasc, Mastermind (SFD-088 → sfd-088-221) · 4 Might · "[1][mind]: Draw 1. [4][mind][mind][mind][mind], [Exhaust]:
 *     Score 1 point. Use my abilities only while I'm at a battlefield."
 *
 * Q: Does Heimerdinger need to be at a battlefield to use Renata's copied [Exhaust] ability?
 * A: No. He inherits the activated [Exhaust] ability but NOT Renata's passive "only while I'm at a battlefield" restriction,
 *    so he may activate it from base. (He exhausts once for one chosen ability.)
 * Rules: 366 (activated abilities), 145/Heimerdinger's static (copies [Exhaust] abilities only), Renata's restriction is a
 *        separate static line about "my abilities".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const RENATA = "sfd-088-221";

/** P1's turn with [5] + 5 mind (enough for either Renata ability). bf1 is P1's. */
function board(heimerAt: "base" | "bf1", renataAt: "base" | "bf1") {
  return scenario()
    .points(P1, 0)
    .resources(P1, { energy: 5, power: { mind: 5 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, heimerAt, HEIMERDINGER, "heimer")
    .unit(P1, renataAt, RENATA, "renata");
}

describe("Ruling 9da4c771a3593f96 — Heimerdinger uses Renata's copied [Exhaust] ability without her battlefield restriction", () => {
  test("control: Renata herself in base cannot use either of her abilities (her own restriction)", async () => {
    const game = await board("bf1", "base").build();
    expect(game.p1.can("activate", "renata")).toBe(false);
  });

  test("Heimerdinger copies only the [Exhaust] ability (Score 1) — not '[1][mind]: Draw 1' — and at a battlefield it works: pay [4]+4 mind, exhaust him, score 1", async () => {
    const game = await board("bf1", "base").build();
    const heimerAbilities = game.p1.legal().filter((o) => o.verb === "activate" && o.card === "heimer");
    expect(heimerAbilities).toHaveLength(1);
    await game.p1.activate("heimer");
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("renata").isExhausted).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual([]); // no Draw-1 ability was used/available
    expect(game.violations()).toEqual([]);
  });

  // Expected (ruling): Heimerdinger in BASE (Renata also in base) is offered the copied "[4][mind]x4, [Exhaust]: Score 1 point"
  // and can use it — the "only while I'm at a battlefield" line is Renata's own restriction and is not inherited.
  // Actual: the engine applies Renata's location restriction to Heimerdinger too — no activate option is offered in base.
  test("ruling 9da4c771a3593f96 — engine makes Heimerdinger obey Renata's 'only at a battlefield' restriction", async () => {
    const game = await board("base", "base").build();
    expect(game.p1.can("activate", "renata")).toBe(false);
    expect(game.p1.can("activate", "heimer")).toBe(true);
    await game.p1.activate("heimer");
    await game.settle();
    expect(game.state("heimer")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.p1.points()).toBe(1);
  });
});
