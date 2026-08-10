/**
 * Ruling 217551f27a3439d9 — Eager Apprentice (OGN-084 → ogn-084-298) · Unit · Mind · 3
 *   current text: "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1]."
 *   × Find Your Center (OGN-047 → ogn-047-298) [Action] · 3 "If an opponent's score is within 3 points of the Victory
 *     Score, this costs [2] less. Draw 1 and channel 1 rune exhausted."
 *
 * Q: Find Your Center is already conditionally discounted; does Eager Apprentice reduce it further (to 0)? What about
 *    several Apprentices?
 * A: Discounts stack: apply Find Your Center's own conditional discount FIRST, then each Apprentice's reduction; multiple
 *    Apprentices stack; a cost can never go below zero (floored). [The ruling's literal "costs 0" predates the Apprentice
 *    erratum that added "to a minimum of [1]" — with the current text the Apprentice step floors at 1 instead of 0.]
 * Rules: 356.4 (cost increases/reductions applied while determining the cost to pay), 128 (costs floor at 0).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EAGER_APPRENTICE = "ogn-084-298";
const FIND_YOUR_CENTER = "ogn-047-298";
const FALLING_COMET = "ogn-085-298"; // printed 5 — a neutral spell to show plain stacking

/** P1's turn, Victory Score 8. `oppPoints` for P2; `apprentices` Eager Apprentices at bf1; P1 has `energy`. */
function board(opts: { apprentices: number; oppPoints: number; energy: number }) {
  let b = scenario()
    .victoryScore(8)
    .points(P2, opts.oppPoints)
    .resources(P1, { energy: opts.energy })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "bf1", { might: 9, name: "Foe" }, "foe")
    .hand(P1, FIND_YOUR_CENTER, "fyc")
    .hand(P1, FALLING_COMET, "comet");
  for (let i = 0; i < opts.apprentices; i++) {
    b = b.unit(P1, "bf1", EAGER_APPRENTICE, `apprentice${i}`);
  }
  return b;
}

describe("Ruling 217551f27a3439d9 — Find Your Center's own discount and Eager Apprentice's discount stack, floored", () => {
  test("Find Your Center alone: full 3 normally; with the opponent within 3 of the Victory Score (5/8) it costs 3 − 2 = 1", async () => {
    const far = await board({ apprentices: 0, energy: 3, oppPoints: 0 }).build();
    await far.p1.cast("fyc");
    expect(far.p1.energy()).toBe(0);

    const near = await board({ apprentices: 0, energy: 3, oppPoints: 5 }).build();
    await near.p1.cast("fyc");
    expect(near.p1.energy()).toBe(2); // paid 1
  });

  test("Apprentice discounts stack with each other: Falling Comet (5) with TWO Apprentices at a battlefield costs 5 − 1 − 1 = 3", async () => {
    const game = await board({ apprentices: 2, energy: 5, oppPoints: 0 }).build();
    await game.p1.cast("comet", { targets: "foe" });
    expect(game.p1.energy()).toBe(2);
  });

  test("Apprentice stacks with Find Your Center's printed cost too: opponent far away, two Apprentices → 3 − 1 − 1 = 1", async () => {
    const game = await board({ apprentices: 2, energy: 3, oppPoints: 0 }).build();
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(2); // paid 1
  });

  test("floored, never negative: conditional discount + two Apprentices on Find Your Center is castable with an EMPTY-or-1 pool and the pool never drops below 0", async () => {
    const game = await board({ apprentices: 2, energy: 1, oppPoints: 5 }).build();
    expect(game.p1.can("cast", "fyc")).toBe(true);
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBeGreaterThanOrEqual(0);
    expect(game.p1.energy()).toBeLessThanOrEqual(1);
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
  });

  // RULING-CONFLICT: riftjudge 217551f27a3439d9 says the reductions apply in a fixed order — Find Your Center's own
  // conditional discount first (3 → 1) and only then Eager Apprentice, whose "to a minimum of [1]" erratum would floor
  // the result at 1; CR 356.4.d.1 / 356.4.e say the PAYER chooses the order in which cost reductions apply while
  // determining the cost to pay — engine follows CR. Payer-optimal here is Apprentice first (3 → 2, above its own
  // minimum-[1] floor), then Find Your Center's −2 (2 → 0), so the spell costs 0 and the pool is untouched.
  // rule 128: costs floor at 0. Two landed core-rules tests (core-rules/paying-costs-energy-power.test.ts) assert the
  // same payer-optimal ordering, so flipping the engine here would contradict them.
  test("ruling 217551f27a3439d9 (CR ordering) — payer-optimal order applies Eager Apprentice first, so a conditionally-discounted Find Your Center costs 0", async () => {
    const game = await board({ apprentices: 1, energy: 3, oppPoints: 5 }).build();
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(3); // 3 → (Apprentice −1, min 1) 2 → (FYC −2) 0 paid
  });
});
