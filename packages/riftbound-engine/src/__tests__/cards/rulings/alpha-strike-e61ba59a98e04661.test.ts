/**
 * Ruling e61ba59a98e04661 — Alpha Strike (UNL-192 → unl-192-219) · Spell · [Action] · [3][rainbow]
 *   "Choose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields.
 *    Then for each unit this kills, do this: Gain 1 XP."
 *   × Bird token (unl-t02) · 1 Might · [Deflect] — the "you must pay to choose me" case.
 *
 * Q: Do you have to target every enemy unit at battlefields when you play Alpha Strike?
 * A: No. Splitting damage means you CHOOSE which units receive it; each chosen unit is Targeted and only
 *    those are. You may choose fewer than all of them (and per 355.13 even none). Any chosen unit with
 *    [Deflect] costs its Deflect surcharge on top of Alpha Strike — if you can't pay, you can't choose it.
 * Rules: 355.13 ("any number"/"up to" may be zero), 355.14.a (each unit a split names is Targeted),
 *        809.1.c.1 ([Deflect] is charged per chosen unit at finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const BIRD = "unl-t02";

/** P1's turn. P1's 3-Might Yi in base; P2 has three 1-Might Recruits spread over two battlefields. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Yi" }, "yi")
    .unit(P2, "bf1", { might: 1, name: "Recruit A" }, "r1")
    .unit(P2, "bf1", { might: 1, name: "Recruit B" }, "r2")
    .unit(P2, "bf2", { might: 1, name: "Recruit C" }, "r3")
    .hand(P1, ALPHA_STRIKE, "alpha");
}

describe("Ruling e61ba59a98e04661 — Alpha Strike targets only the enemy units you choose", () => {
  test("premise: three enemy units are available at battlefields and the caster's Yi has 3 Might", async () => {
    const game = await board().build();
    expect(game.state("yi").might).toBe(3);
    expect([...game.p2.units("bf1"), ...game.p2.units("bf2")].toSorted()).toEqual(["r1", "r2", "r3"]);
  });

  test("ruling: choosing only ONE of the three is a legal play — that unit takes all 3 and the other two are untouched", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["yi", "r2"] });
    await game.settle();
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.zoneOf("r1")).toBe("battlefield-bf1");
    expect(game.zoneOf("r3")).toBe("battlefield-bf2");
    expect(game.state("r1").damage).toBe(0);
    expect(game.state("r3").damage).toBe(0);
    expect(game.p1.xp()).toBe(1); // one kill
    expect(game.violations()).toEqual([]);
  });

  test("choosing TWO of the three is equally legal; the third is still never touched", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["yi", "r1", "r3"] });
    const stop = await game.settle();
    // 3 damage over 2 chosen units: the caster divides it (each chosen unit must get at least 1).
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    await game.p1.distribute({ r1: 2, r3: 1 });
    await game.settle();
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r3")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("battlefield-bf1");
    expect(game.state("r2").damage).toBe(0);
    expect(game.p1.xp()).toBe(2);
  });

  test("the harness offers the SUBSETS, not just the full set — proper subsets of the three enemies are legal target sets", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.arg === "targets");
    expect(field).toBeDefined();
    const sets = (field?.options ?? []).map((o) => (Array.isArray(o) ? [...o].toSorted().join(",") : String(o)));
    expect(sets.some((s) => s.includes("r1") && !s.includes("r2") && !s.includes("r3"))).toBe(true);
    expect(sets.some((s) => s.includes("r1") && s.includes("r2") && s.includes("r3"))).toBe(true);
  });

  test("[Deflect]: a chosen Bird costs an extra [rainbow] — with no spare power the Bird cannot be chosen, but the other unit still can", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } }) // exactly Alpha Strike's own cost, nothing spare
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Yi" }, "yi")
      .unit(P2, "bf1", { might: 1, name: "Recruit A" }, "r1")
      .unit(P2, "bf1", BIRD, "bird")
      .hand(P1, ALPHA_STRIKE, "alpha")
      .build();
    expect(game.state("bird").keywords).toContain("Deflect");
    const denied = await game.p1.try((p) => p.cast("alpha", { targets: ["yi", "bird"] }));
    expect(denied.ok).toBe(false);
    await game.p1.cast("alpha", { targets: ["yi", "r1"] });
    await game.settle();
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("bird")).toBe("battlefield-bf1");
    expect(game.state("bird").damage).toBe(0);
  });

  test("…and with the surcharge available the Bird CAN be chosen", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Yi" }, "yi")
      .unit(P2, "bf1", { might: 1, name: "Recruit A" }, "r1")
      .unit(P2, "bf1", BIRD, "bird")
      .hand(P1, ALPHA_STRIKE, "alpha")
      .build();
    await game.p1.cast("alpha", { targets: ["yi", "bird"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // spell cost + Deflect
    await game.settle();
    expect(game.zoneOf("bird")).toBe("gone"); // a token that left the board ceases to exist
    expect(game.zoneOf("r1")).toBe("battlefield-bf1");
    expect(game.state("r1").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
