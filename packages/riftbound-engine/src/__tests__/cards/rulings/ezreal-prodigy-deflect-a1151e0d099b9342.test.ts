/**
 * Ruling a1151e0d099b9342 — Ezreal, Prodigy (SFD-149 → sfd-149-221) · "Optional additional costs
 *   you pay cost [1] or [rainbow] less."
 *   × a Bird token (UNL-t02 → unl-t02, bare "[Deflect]") × Void Seeker (OGN-024 → ogn-024-298)
 *   × an inline [Accelerate] [1][fury] unit for a genuinely OPTIONAL additional cost.
 *
 * Q: Does Ezreal help with [Deflect] costs? Aren't those optional now?
 * A: No, and no. [Deflect] is a MANDATORY additional cost: if you want to finalize a spell or
 *    ability that chooses something with Deflect you must pay it, so Ezreal's discount — which
 *    only touches OPTIONAL additional costs — never applies. Being able to decline a triggered
 *    ability rather than pay does not make the cost optional; it just means you did not finalize.
 * Rules: 809.1.d (Deflect imposes a Mandatory Additional Cost), 356.2.a.2 vs 356.4.c (mandatory vs
 *        optional additional costs; the discount names the latter), 402.4 (a triggered ability
 *        with an unpayable cost is removed, not discounted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EZREAL_PRODIGY = "sfd-149-221";
const BIRD = "unl-t02";
const VOID_SEEKER = "ogn-024-298"; // [3] + [fury]

/** [2][fury] · "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)" */
const ACCEL_UNIT = {
  abilities: [{ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  might: 3,
  name: "Test Vanguard",
  powerCost: ["fury"],
  rulesText: "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)",
} as const;

const SPARE = 4;

/** P2's turn; P2 casts Void Seeker at P1's Bird. `mine` = does P2 also control Ezreal? */
const casting = (withEzreal: boolean) => {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1, mind: SPARE } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", BIRD, "bird")
    .hand(P2, VOID_SEEKER, "seeker");
  return withEzreal ? s.unit(P2, "base", EZREAL_PRODIGY, "ezreal") : s;
};

describe("Ruling a1151e0d099b9342 — Ezreal's discount never touches [Deflect]", () => {
  test("without Ezreal, the bare [Deflect] surcharge is 1", async () => {
    const game = await casting(false).build();
    await game.p2.cast("seeker", { targets: "bird" });
    expect(game.p2.power("mind")).toBe(SPARE - 1);
  });

  test("with Ezreal on P2's board, it is STILL 1 — a mandatory additional cost is not an optional one", async () => {
    const game = await casting(true).build();
    expect(game.zoneOf("ezreal")).toBe("base");
    await game.p2.cast("seeker", { targets: "bird" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power("fury")).toBe(0);
    expect(game.p2.power("mind")).toBe(SPARE - 1); // not SPARE, and not reduced to 0
    expect(game.violations()).toEqual([]);
  });

  test("Deflect is not declinable either: with the surcharge unaffordable the target is simply not offered", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", BIRD, "bird")
      .unit(P2, "base", EZREAL_PRODIGY, "ezreal")
      .hand(P2, VOID_SEEKER, "seeker")
      .build();
    const denied = await game.p2.try((p) => p.cast("seeker", { targets: "bird" }));
    expect(denied.ok).toBe(false); // no "play it without paying Deflect" variant exists
    expect(game.zoneOf("seeker")).toBe("hand");
  });

  test("contrast — Ezreal's discount DOES apply to a real optional additional cost ([Accelerate])", async () => {
    const withoutEz = await scenario()
      .resources(P1, { energy: 9, power: { fury: 5 } })
      .hand(P1, ACCEL_UNIT, "u")
      .build();
    await withoutEz.p1.play("u", { accelerate: true });
    expect(withoutEz.p1.resources()).toEqual({ energy: 6, power: { fury: 3 } }); // [2]+[fury] + [1][fury]
    expect(withoutEz.state("u").isReady).toBe(true);

    const withEz = await scenario()
      .resources(P1, { energy: 9, power: { fury: 5 } })
      .unit(P1, "base", EZREAL_PRODIGY, "ezreal")
      .hand(P1, ACCEL_UNIT, "u")
      .build();
    // 356.4.c — Ezreal turns the one [1][fury] Accelerate into a CHOICE of two cheaper shapes.
    await withEz.p1.play("u", {
      accelerate: true,
      params: { additionalCostSpec: { energy: 0, power: ["fury"] } },
    });
    expect(withEz.p1.resources()).toEqual({ energy: 7, power: { fury: 3 } }); // one Energy cheaper
    expect(withEz.state("u").isReady).toBe(true);
  });

  test("…and that discounted shape simply does not exist without Ezreal", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { fury: 5 } })
      .hand(P1, ACCEL_UNIT, "u")
      .build();
    const denied = await game.p1.try((p) =>
      p.play("u", { accelerate: true, params: { additionalCostSpec: { energy: 0, power: ["fury"] } } }),
    );
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("u")).toBe("hand");
  });
});
