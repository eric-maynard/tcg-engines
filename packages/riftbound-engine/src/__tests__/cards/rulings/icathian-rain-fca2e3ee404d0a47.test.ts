/**
 * Ruling fca2e3ee404d0a47 — Icathian Rain (OGN-248 → ogn-248-298) · [7][rainbow][rainbow][rainbow]
 *   "Deal 2 to a unit." × 6 — six independent choices.
 *   × [Deflect] (Navori Scout, SFD-037 → sfd-037-221) "Opponents must pay [rainbow] to choose me with a spell or ability."
 *
 * Q: When Icathian Rain's six instructions hit a [Deflect] unit several times, is the Deflect cost paid once or per proc?
 * A: Once per proc. Every instruction that chooses the unit is its own choice, so each one owes the [Deflect] surcharge.
 * Rules: 809.1.c.1 ([Deflect] is owed at each choice), 355.10 (each instruction chooses separately), 204 (costs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const NAVORI_SCOUT = "sfd-037-221"; // 4 Might, [Deflect] (1× [rainbow])

/** P1's turn with the spell's own [7][rainbow]×3 plus `spare` extra [rainbow] for Deflect surcharges. */
function board(spare: number) {
  return scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 + spare } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", NAVORI_SCOUT, "scout")
    .unit(P2, "bf1", { might: 20, name: "Bystander" }, "other")
    .hand(P1, ICATHIAN_RAIN, "rain");
}

describe("Ruling fca2e3ee404d0a47 — Icathian Rain pays [Deflect] once for EACH instruction that chooses the unit", () => {
  test("premise: the Scout has [Deflect] and Icathian Rain makes six separate choices", async () => {
    const game = await board(6).build();
    expect(game.state("scout").keywords).toContain("Deflect");
    const field = game.p1.option("cast", "rain")?.fields.find((f) => f.arg === "targets");
    expect(field).toMatchObject({ max: 6, min: 6 });
  });

  test("choosing the Scout ONCE costs one extra [rainbow] on top of the spell's own cost", async () => {
    const game = await board(6).build();
    await game.p1.cast("rain", { targets: ["scout", "other", "other", "other", "other", "other"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 5 } }); // 6 spare − 1 Deflect
  });

  test("choosing the Scout THREE times costs three extra [rainbow] — one per proc, not one in total", async () => {
    const game = await board(6).build();
    await game.p1.cast("rain", { targets: ["scout", "scout", "scout", "other", "other", "other"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } }); // 6 spare − 3 Deflect
    await game.settle();
    expect(game.state("other").damage).toBe(6); // the other three 2s landed
    expect(game.zoneOf("scout")).toBe("trash"); // 3 × 2 ≥ its 4 Might
    expect(game.violations()).toEqual([]);
  });

  test("choosing the Scout all SIX times costs six extra [rainbow]", async () => {
    const game = await board(6).build();
    await game.p1.cast("rain", { targets: ["scout", "scout", "scout", "scout", "scout", "scout"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("with only enough [rainbow] for one surcharge, a three-proc aim at the Scout is not offered", async () => {
    const game = await board(1).build();
    const field = game.p1.option("cast", "rain")?.fields.find((f) => f.arg === "targets");
    const sets = (field?.options ?? []) as string[][];
    for (const set of sets) {
      expect(set.filter((id) => id === "scout").length).toBeLessThanOrEqual(1);
    }
    const r = await game.p1.try((p) => p.cast("rain", { targets: ["scout", "scout", "other", "other", "other", "other"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rain")).toBe("hand");
  });
});
