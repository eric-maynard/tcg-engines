/**
 * Ruling e9501b56cd6cbab5 — Falling Star (OGN-029 → ogn-029-298) · [2][fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · [7][mind] · 7 Might "When you play me, give enemy units -3 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *   × Noxus Hopeful (OGN-012 → ogn-012-298) · 4 Might — the two victims.
 *   Nuance pair: Hextech Ray (OGN-009 → ogn-009-298) "Deal 3 to a unit at a battlefield." then Stupefy (OGN-095 → ogn-095-298)
 *   "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Falling Star puts 3 on each of two 4-Might Hopefuls (they live), then Thousand-Tailed Watcher is played. Do both die?
 * A: Yes. Marked damage stays; when the Watcher's -3 resolves they are 1-Might units with 3 damage, and the cleanup after
 *    that effect finds lethal damage on both. Same for Hextech Ray followed by Stupify on one Hopeful.
 * Rules: 437 (damage stays marked until healed at end of turn), 323.1 / 319 (cleanup after each resolution checks
 *        damage ≥ Might), 433 (Might modification).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const THOUSAND_TAILED_WATCHER = "ogn-116-298";
const NOXUS_HOPEFUL = "ogn-012-298";
const HEXTECH_RAY = "ogn-009-298";
const STUPEFY = "ogn-095-298";

describe("Ruling e9501b56cd6cbab5 — damage first, Might reduction second: the later cleanup kills", () => {
  test("Falling Star 3 + 3 onto two 4-Might Hopefuls: both survive with 3 marked; the Watcher's -3 (min 1) then resolves and BOTH die in the cleanup that follows", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 9, power: { fury: 2, mind: 1 } })
      .unit(P1, "base", NOXUS_HOPEFUL, "hopeA")
      .unit(P1, "base", NOXUS_HOPEFUL, "hopeB")
      .hand(P2, FALLING_STAR, "star")
      .hand(P2, THOUSAND_TAILED_WATCHER, "watcher")
      .build();
    expect(game.state("hopeA").might).toBe(4);

    await game.p2.cast("star", { targets: ["hopeA", "hopeB"] });
    expect(game.p2.resources()).toEqual({ energy: 7, power: { fury: 0, mind: 1 } });
    await game.settle();
    // Step 1: they survive with 3 damage marked.
    expect(game.state("hopeA")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    expect(game.state("hopeB")).toMatchObject({ damage: 3, might: 4, zone: "base" });

    // Step 2: the Watcher is played; its play trigger goes on the chain.
    await game.p2.play("watcher");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P2, triggered: true })]);
    expect(game.zoneOf("hopeA")).toBe("base"); // nothing yet — the trigger hasn't resolved
    // Steps 3–4: it resolves (-3 → 1 Might each) and the cleanup kills both (3 damage ≥ 1 Might).
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hopeA")).toBe("trash");
    expect(game.zoneOf("hopeB")).toBe("trash");
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Hextech Ray (3 to a Hopeful at a battlefield — survives at 4) followed by Stupefy (-1 → 3 Might) kills it the same way; P2 still draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", NOXUS_HOPEFUL, "hope")
      .hand(P2, HEXTECH_RAY, "ray")
      .hand(P2, STUPEFY, "stupefy")
      .build();
    await game.p2.cast("ray", { targets: "hope" });
    await game.settle();
    expect(game.state("hope")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" });
    const handBefore = game.p2.hand().length; // ["stupefy"]
    await game.p2.cast("stupefy", { targets: "hope" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("hope")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handBefore - 1 + 1); // Stupefy left, one card drawn
    expect(game.violations()).toEqual([]);
  });
});
