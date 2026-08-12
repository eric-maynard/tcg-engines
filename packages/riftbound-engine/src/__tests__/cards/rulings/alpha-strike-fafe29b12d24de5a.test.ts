/**
 * Ruling fafe29b12d24de5a — Alpha Strike (UNL-192 → unl-192-219) · [Action] 3 + [rainbow]
 *   "Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *    battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *
 * Q: Must I damage a unit at every battlefield, or may I hit just one battlefield?
 * A: Just one is fine. "Battlefields" is plural only to allow spreading; you choose which enemy units
 *    get the damage and "any number" includes one. The only per-target rule is that every unit you do
 *    choose must get at least 1 — you cannot assign a chosen unit 0.
 * Rules: 355.13 ("any number" may be one), 355.14.g (every chosen split recipient gets a positive amount).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";

/** P1's 3-Might Champion in base; P2 has two Recruits at bf1 and one at bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Champion" }, "ally")
    .unit(P2, "bf1", { might: 4, name: "Recruit A" }, "r1")
    .unit(P2, "bf1", { might: 4, name: "Recruit B" }, "r2")
    .unit(P2, "bf2", { might: 4, name: "Recruit C" }, "r3")
    .hand(P1, ALPHA_STRIKE, "alpha");
}

describe("Ruling fafe29b12d24de5a — Alpha Strike may be aimed at one battlefield only, and every chosen unit takes at least 1", () => {
  test("choosing only the two units at bf1 is legal — the unit at bf2 is simply not chosen and takes nothing", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["ally", "r1", "r2"] });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as Extract<Decision, { kind: "distribute" }>;
    expect(d.kind).toBe("distribute");
    expect(d.total).toBe(3);
    expect(d.buckets.map((b) => b.card).sort()).toEqual(["r1", "r2"]);
    await game.p1.distribute({ r1: 2, r2: 1 });
    await game.settle();
    expect(game.state("r1").damage).toBe(2);
    expect(game.state("r2").damage).toBe(1);
    expect(game.state("r3").damage).toBe(0); // untouched battlefield
    expect(game.violations()).toEqual([]);
  });

  test("all three damage may go into a single unit at a single battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["ally", "r1"] });
    await game.settle();
    expect(game.state("r1").damage).toBe(3); // one recipient ⇒ it all lands, no prompt
    expect(game.state("r2").damage).toBe(0);
    expect(game.state("r3").damage).toBe(0);
    expect(game.zoneOf("alpha")).toBe("trash");
  });

  test("a chosen unit cannot be given 0: each bucket demands at least 1 and an allocation with a zero is refused", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["ally", "r1", "r2"] });
    await game.settle();
    const d = game.decision() as Extract<Decision, { kind: "distribute" }>;
    for (const b of d.buckets) {
      expect(b.min).toBeGreaterThanOrEqual(1);
    }
    const zeroed = await game.p1.try((p) => p.distribute({ r1: 3, r2: 0 }));
    expect(zeroed.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute" });
  });

  test("spreading across BOTH battlefields is still allowed — the ruling is a permission, not a restriction", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["ally", "r1", "r3"] });
    await game.settle();
    const d = game.decision() as Extract<Decision, { kind: "distribute" }>;
    expect(d.buckets.map((b) => b.card).sort()).toEqual(["r1", "r3"]);
    await game.p1.distribute({ r1: 1, r3: 2 });
    await game.settle();
    expect(game.state("r1").damage).toBe(1);
    expect(game.state("r3").damage).toBe(2);
    expect(game.state("r2").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
