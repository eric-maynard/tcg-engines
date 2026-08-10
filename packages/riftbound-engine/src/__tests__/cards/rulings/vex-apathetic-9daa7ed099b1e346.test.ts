/**
 * Ruling 9daa7ed099b1e346 — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · "[Deflect] (Opponents must pay [rainbow] to
 *     choose me with a spell or ability.) …"
 *   × Falling Star (OGN-029 → ogn-029-298) · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: If both instances of Falling Star target Vex, is the Deflect cost paid for both?
 * A: Yes. Each "Deal 3 to a unit" chooses a unit; Deflect adds [rainbow] "for each time they choose me", so choosing
 *    Vex twice costs 2 extra Power (any domain) on top of [2][fury][fury].
 * Rules: 809.1.c (Deflect per choice), 809.1.c.1 (any domain), 356.2.a.2 (mandatory additional cost), 355.8.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const FALLING_STAR = "ogn-029-298";

/** P1's turn: Falling Star in hand, [2] + fury×2 + `spare` calm. P2's Vex (4) in base plus a plain 3-Might Bystander. */
function board(spare: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: spare, fury: 2 } })
    .unit(P2, "base", VEX, "vex")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "by")
    .hand(P1, FALLING_STAR, "star");
}

describe("Ruling 9daa7ed099b1e346 — Falling Star on Vex twice pays Deflect twice", () => {
  test("both instances on Vex: [2][fury][fury] + 2 extra Power are taken (pool 2 calm → 0); Vex takes 3 + 3 = 6 and dies", async () => {
    const game = await board(2).build();
    expect(game.state("vex").keywords).toContain("Deflect");
    await game.p1.cast("star", { targets: ["vex", "vex"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P1, targets: ["vex", "vex"] })]);
    await game.settle();
    expect(game.zoneOf("vex")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("by").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("one instance on Vex, one on the Bystander: only ONE Deflect surcharge (2 calm → 1)", async () => {
    const game = await board(2).build();
    await game.p1.cast("star", { targets: ["vex", "by"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1, fury: 0 } });
    await game.settle();
    expect(game.state("vex")).toMatchObject({ damage: 3, zone: "base" }); // 3 < 4, survives
    expect(game.zoneOf("by")).toBe("trash");
  });

  test("with only ONE spare Power, Vex can be chosen once but not twice — the double choice cannot be paid and is rejected", async () => {
    const game = await board(1).build();
    const r = await game.p1.try((p) => p.cast("star", { targets: ["vex", "vex"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("star")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, fury: 2 } });
    // …whereas Vex once + Bystander once is affordable.
    await game.p1.cast("star", { targets: ["vex", "by"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });
});
