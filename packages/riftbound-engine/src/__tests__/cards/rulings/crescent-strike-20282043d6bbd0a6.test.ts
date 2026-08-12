/**
 * Ruling 20282043d6bbd0a6 — Crescent Strike (UNL-072 → unl-072-219) · Mind · [3] · [Action]
 *   "Choose a battlefield and an enemy unit there. Deal 4 to that unit and 1 to each other enemy unit there."
 *   × [Deflect] — "Opponents must pay [rainbow] to CHOOSE me with a spell or ability."
 *
 * Q: Does the splash 1 damage make me pay Deflect for the other enemy units?
 * A: No. Only the battlefield and the one enemy unit are chosen; the "other enemy units" are picked out by the
 *    game from their location and controller, so they are not targets and Deflect is not charged for them.
 *    Choosing the [Deflect] unit as the primary 4-damage target does charge the surcharge.
 * Rules: 809.1.c (Deflect taxes CHOOSING), 355.10 (effects that select by criteria do not choose/target).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CRESCENT_STRIKE = "unl-072-219";
const BIRD = "unl-t02"; // 1-Might token with [Deflect]

/** P1's turn with [3] + 1 mind (the spell's own cost) + 1 spare rainbow (enough for one Deflect surcharge). */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
    .unit(P2, "bf1", BIRD, "bird")
    .unit(P2, "bf1", { might: 4, name: "Squire" }, "squire")
    .hand(P1, CRESCENT_STRIKE, "crescent");
}

describe("Ruling 20282043d6bbd0a6 — Crescent Strike's splash 1 does not choose, so it never charges Deflect", () => {
  test("the Bird really does have [Deflect]", async () => {
    const game = await board().build();
    expect(game.state("bird").keywords).toContain("Deflect");
  });

  test("ruling: choosing the plain Brute costs the printed [3][mind] only — the spare rainbow is untouched even though a [Deflect] Bird is splashed", async () => {
    const game = await board().build();
    await game.p1.cast("crescent", { targets: "brute" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 1 } }); // no surcharge
    await game.settle();
    expect(game.state("brute").damage).toBe(4);
    expect(game.zoneOf("bird")).toBe("gone"); // the un-chosen 1-Might Bird still takes its 1 and dies (a token ceases to exist)
    expect(game.state("squire").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: choosing the [Deflect] Bird as the 4-damage target DOES charge the surcharge", async () => {
    const game = await board().build();
    await game.p1.cast("crescent", { targets: "bird" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } }); // surcharge paid
    await game.settle();
    expect(game.zoneOf("bird")).toBe("gone");
    expect(game.state("brute").damage).toBe(1);
    expect(game.state("squire").damage).toBe(1);
  });

  test("…and with no spare Power the [Deflect] Bird cannot be chosen at all, while the plain Brute still can", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .unit(P2, "bf1", BIRD, "bird")
      .hand(P1, CRESCENT_STRIKE, "crescent")
      .build();
    expect((await game.p1.try((p) => p.cast("crescent", { targets: "bird" }))).ok).toBe(false);
    await game.p1.cast("crescent", { targets: "brute" });
    await game.settle();
    expect(game.state("brute").damage).toBe(4);
    expect(game.zoneOf("bird")).toBe("gone"); // splashed for 1, unpaid and unchosen
  });
});
