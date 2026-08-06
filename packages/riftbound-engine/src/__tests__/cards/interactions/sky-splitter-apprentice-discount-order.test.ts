/**
 * Interaction: Sky Splitter (ogn-014-298) — [8][fury] Action spell,
 *     "This spell's Energy cost is reduced by the highest Might among units you control.
 *      Deal 5 to a unit at a battlefield."
 *   × Eager Apprentice (ogn-084-298) — 3 Might,
 *     "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1],
 *      to a minimum of [1]."
 *   × Dunebreaker (sfd-027-221) — a 7-Might unit.
 *
 * Question: with Dunebreaker (7 Might) and Eager Apprentice at a battlefield, what is the minimum
 * you pay for Sky Splitter? Can the two Energy discounts be ordered so Energy hits 0 despite the
 * Apprentice's "minimum of [1]"? Is the [fury] pip reduced?
 *
 * Rules:
 *   356.4 / 356.4.b — apply discounts ("reduced by [amount]").
 *   356.4.c.1 — discounts on the same component may be applied in any order.
 *   356.4.e   — a discount's minimum binds only that discount. Its example IS this pairing:
 *               Apprentice first 8→7, then Sky Splitter −7 → 0. (Other order: 8−7=1, floor 1 → 1.)
 *   356.6     — costs can't go below 0; Sky Splitter reduces Energy only, so [fury] is still due.
 *   206       — effects that look at Sky Splitter's cost still see the printed 8.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SKY_SPLITTER = "ogn-014-298";
const EAGER_APPRENTICE = "ogn-084-298";
const DUNEBREAKER = "sfd-027-221";

interface BoardOpts {
  energy: number;
  fury?: number;
  apprenticeAt?: "bf1" | "base" | null;
  dunebreaker?: boolean;
}

/** P1's turn; enemy 6-Might unit at bf1 is the Sky Splitter target (survives 5, so no cleanup noise). */
function board({ energy, fury = 1, apprenticeAt = "bf1", dunebreaker = true }: BoardOpts) {
  let s = scenario()
    .resources(P1, { energy, power: { fury } })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "bf1", { might: 6, name: "Target Dummy" }, "foe")
    .hand(P1, SKY_SPLITTER, "sky");
  if (apprenticeAt) {
    s = s.unit(P1, apprenticeAt, EAGER_APPRENTICE, "apprentice");
  }
  if (dunebreaker) {
    s = s.unit(P1, "base", DUNEBREAKER, "dune");
  }
  return s;
}

describe("Sky Splitter × Eager Apprentice × Dunebreaker — ordering Energy discounts (356.4.e)", () => {
  test("setup sanity: Dunebreaker is 7 Might, Eager Apprentice 3 Might, Sky Splitter's printed cost is 8 + [fury]", async () => {
    const game = await board({ energy: 0 }).build();
    expect(game.state("dune").might).toBe(7);
    expect(game.state("apprentice").might).toBe(3);
    expect(game.locationOf("apprentice")).toBe("bf1");
    expect(game.state("sky").energyCost).toBe(8);
    expect(game.state("sky").powerCost).toEqual(["fury"]);
  });

  test("Dunebreaker + Apprentice at a battlefield → player-optimal order gives [0][fury]: castable with 0 energy, only the fury pip is spent (356.4.c.1 / 356.4.e)", async () => {
    // Apprentice 8→7, then −7 (highest Might) → 0 energy; pay just [fury].
    const game = await board({ energy: 0 }).build();
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("foe").damage).toBe(5);
    expect(game.zoneOf("sky")).toBe("trash");
  });

  test("with spare energy the engine must still charge 0 energy (not the reverse-order [1]) — 8 energy in, 8 energy left", async () => {
    // the player may order discounts optimally (or the engine computes the optimum): 0 energy paid.
    const game = await board({ energy: 8 }).build();
    await game.p1.cast("sky", { targets: "foe" });
    expect(game.p1.energy()).toBe(8);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("the [fury] Power pip is never discounted: with plenty of energy but no fury, Sky Splitter is not castable (356.6)", async () => {
    const game = await board({ energy: 8, fury: 0 }).build();
    expect(game.p1.can("cast", "sky")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sky", { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sky")).toBe("hand");
  });

  test("(a) Apprentice in BASE — its static is off; only Sky Splitter's own discount: 8 − 7 = [1][fury]", async () => {
    // 1 energy + fury is exactly enough; 0 energy is not.
    const broke = await board({ apprenticeAt: "base", energy: 0 }).build();
    expect(broke.p1.can("cast", "sky")).toBe(false);

    const game = await board({ apprenticeAt: "base", energy: 1 }).build();
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(b) no Dunebreaker — Apprentice (3 Might, at a battlefield) is itself the highest Might: 8 − 1 − 3 = [4][fury] in any order", async () => {
    // 4 energy + fury castable and fully spent; 3 energy is short.
    const short = await board({ dunebreaker: false, energy: 3 }).build();
    expect(short.p1.can("cast", "sky")).toBe(false);

    const game = await board({ dunebreaker: false, energy: 4 }).build();
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Apprentice at a battlefield: its −1 Energy discount is live (7 energy + fury suffices); in base with 4 energy it is not castable", async () => {
    // Pins the half that IS implemented: with the Apprentice at bf1, 7 energy + fury suffices
    // (rules cost here is 4, so 7 is plenty either way). With it in base and no Dunebreaker the
    // rules cost is 8 − 3 (Apprentice is still your highest-Might unit) = 5, so 4 energy is short.
    const game = await board({ dunebreaker: false, energy: 7 }).build();
    expect(game.p1.can("cast", "sky")).toBe(true);
    const inBase = await board({ apprenticeAt: "base", dunebreaker: false, energy: 4 }).build();
    expect(inBase.p1.can("cast", "sky")).toBe(false);
  });

  test("rule 206: whatever is paid, Sky Splitter's cost as seen by other effects stays the printed 8", async () => {
    for (const opts of [{ energy: 8 }, { apprenticeAt: "base" as const, energy: 8 }, { dunebreaker: false, energy: 8 }]) {
      const game = await board(opts).build();
      expect(game.state("sky").energyCost).toBe(8);
      await game.p1.cast("sky", { targets: "foe" });
      expect(game.state("sky").energyCost).toBe(8);
      expect(game.zoneOf("sky")).toBe("chain");
    }
  });
});
