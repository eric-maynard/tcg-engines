/**
 * Ruling fc7d46305d25ee96 — Falling Star (OGN-029 → ogn-029-298) · 2 + [fury][fury]
 *   "Deal 3 to a unit. Deal 3 to a unit."  (two independently chosen units)
 *
 * Q: Aiming both halves at the same [Deflect] unit — do I pay the Deflect cost twice?
 * A: Yes. [Deflect] is a mandatory additional cost owed for EACH time you choose that unit, and
 *    Falling Star chooses a unit twice. Both surcharges are paid when the spell is played; if you
 *    cannot pay both you cannot legally choose it twice.
 * Rules: 809.1.c (Deflect is an additional cost per choosing), 356 (additional costs are mandatory and
 *        paid on play).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";

/** P2 has a [Deflect] Warden and a plain Bruiser, both big enough to survive 3 or 6. */
function board(power: { fury: number; rainbow?: number }) {
  return scenario()
    .resources(P1, { energy: 2, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { keywords: ["Deflect"], might: 9, name: "Warden" }, "warden")
    .unit(P2, "bf1", { might: 9, name: "Bruiser" }, "bruiser")
    .hand(P1, FALLING_STAR, "star");
}

describe("Ruling fc7d46305d25ee96 — Falling Star owes the Deflect surcharge once per instance that chooses the unit", () => {
  test("choosing the Warden ONCE costs one [rainbow] on top of the printed cost", async () => {
    const game = await board({ fury: 2, rainbow: 1 }).build();
    await game.p1.cast("star", { targets: ["warden", "bruiser"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    await game.settle();
    expect(game.state("warden").damage).toBe(3);
    expect(game.state("bruiser").damage).toBe(3);
  });

  test("choosing the Warden TWICE with only one [rainbow] available is illegal — the second surcharge cannot be paid", async () => {
    const game = await board({ fury: 2, rainbow: 1 }).build();
    const attempt = await game.p1.try((p) => p.cast("star", { targets: ["warden", "warden"] }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("star")).toBe("hand");
    expect(game.state("warden").damage).toBe(0);
  });

  test("with two [rainbow] both instances may name the Warden — both surcharges are charged and it takes 6", async () => {
    const game = await board({ fury: 2, rainbow: 2 }).build();
    await game.p1.cast("star", { targets: ["warden", "warden"] });
    expect(game.p1.power("rainbow")).toBe(0); // both Deflect payments taken
    await game.settle();
    expect(game.state("warden").damage).toBe(6);
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("naming no [Deflect] unit at all costs nothing extra — the surcharge really is per choosing, not per spell", async () => {
    const game = await board({ fury: 2 }).build();
    await game.p1.cast("star", { targets: ["bruiser", "bruiser"] });
    await game.settle();
    expect(game.state("bruiser").damage).toBe(6);
    expect(game.state("warden").damage).toBe(0);
  });
});
