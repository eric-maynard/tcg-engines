/**
 * Ruling 484f7703f06ce414 — Vayne, Hunter (OGN-035 → ogn-035-298) · Unit · 2 Might · [4][fury]
 *   "[Assault 3] — If an opponent controls a battlefield, I enter ready. When I conquer, you may pay [1] to
 *    return me to my owner's hand."
 *   × Mageseeker Warden (OGN-070 → ogn-070-298) · Unit · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. While I'm at a battlefield,
 *      spells and abilities can't ready enemy units and gear."
 *   × Legion Rearguard (OGN-010 → ogn-010-298) · Unit · 2 Might · "[Accelerate] [1][fury]".
 *
 * Q: Does Mageseeker block Vayne from entering play, the way it interacts with other Accelerate cards?
 * A: No. The Warden restricts WHERE opponents may play units and stops spells/abilities from READYING enemy
 *    units — it never stops a unit from ENTERING ready. Vayne (and an [Accelerate] unit) enter ready as normal.
 * Rules: 355.2 (play destinations), 414 (ready vs. entering ready), 803 ([Accelerate] — enter ready).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VAYNE = "ogn-035-298";
const MAGESEEKER_WARDEN = "ogn-070-298";
const LEGION_REARGUARD = "ogn-010-298";

/** P1's turn. P2's Mageseeker Warden holds bf2 (P2's); P1 holds bf1 with a Sentry. P1 has Vayne + Rearguard in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", MAGESEEKER_WARDEN, "warden")
    .hand(P1, VAYNE, "vayne")
    .hand(P1, LEGION_REARGUARD, "rear");
}

describe("Ruling 484f7703f06ce414 — Mageseeker Warden never stops a unit from ENTERING ready", () => {
  test("setup: the Warden is at a battlefield and P2 controls one, so Vayne's condition is met", async () => {
    const game = await board().build();
    expect(game.locationOf("warden")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("ruling: Vayne is playable and ENTERS READY despite the Warden", async () => {
    const game = await board().build();
    await game.p1.play("vayne", { to: "base" });
    await game.settle();
    expect(game.state("vayne")).toMatchObject({ isExhausted: false, isReady: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("ruling nuance: an [Accelerate] unit also enters ready — the Warden does not interact with Accelerate", async () => {
    const game = await board().build();
    await game.p1.play("rear", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("rear")).toMatchObject({ isExhausted: false, isReady: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("what the Warden DOES do: P1's units can only be played to their base — not to bf1, even though P1 controls it", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.play("vayne", { to: "bf1" }))).ok).toBe(false);
    expect(game.zoneOf("vayne")).toBe("hand");
    await game.p1.play("vayne", { to: "base" });
    await game.settle();
    expect(game.locationOf("vayne")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("both restrictions lift once the Warden is no longer at a battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .unit(P2, "base", MAGESEEKER_WARDEN, "warden") // in base, not at a battlefield
      .hand(P1, VAYNE, "vayne")
      .build();
    await game.p1.play("vayne", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("vayne")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
