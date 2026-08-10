/**
 * Ruling e4bd201d662d2880 — Falling Star (OGN-029 → ogn-029-298) · Action · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit.
 *     (You can choose different units.)"
 *   × Annie, Fiery (OGS-001 → ogs-001-024) · "Your spells and abilities deal 1 Bonus Damage."
 *
 * Q: Can Falling Star's two 3-damage instances go to separate units?
 * A: Yes. Both targets are declared together on play; they may be two different units or the same unit twice (6 total). A
 *    [Deflect] target must be paid for per instance aimed at it (twice if named twice). Bonus Damage applies to each instance
 *    separately (Annie: 4 and 4).
 * Rules: 355 (targets chosen at finalization), 809.1.c (Deflect surcharge per targeting), 712–715 (Bonus Damage per instance).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const ANNIE_FIERY = "ogs-001-024";

/** P1's turn with exactly Falling Star's [2][fury][fury] (+ `rainbow` for Deflect surcharges). P2: A (4), B (5), Warded (2, [Deflect]) in base. */
function board(rainbow = 0) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2, rainbow } })
    .unit(P2, "base", { might: 4, name: "A" }, "A")
    .unit(P2, "base", { might: 5, name: "B" }, "B")
    .unit(P2, "base", { keywords: ["Deflect"], might: 2, name: "Warded" }, "warded")
    .hand(P1, FALLING_STAR, "star");
}

describe("Ruling e4bd201d662d2880 — Falling Star's two instances: separate units, same unit, Deflect per instance, Bonus Damage per instance", () => {
  test("both targets are declared on play as ONE chain item and may be DIFFERENT units: A takes 3, B takes 3", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["A", "B"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["A", "B"] })]);
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("A")).toMatchObject({ damage: 3, zone: "base" }); // 3 < 4: survives
    expect(game.state("B")).toMatchObject({ damage: 3, zone: "base" }); // 3 < 5: survives
    expect(game.violations()).toEqual([]);
  });

  test("the SAME unit may be named for both instances: B (5 Might) takes 3 + 3 = 6 and dies", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "star")?.fields.find((f) => f.name === "targets");
    expect((fields?.options ?? []).some((o) => JSON.stringify(o) === JSON.stringify(["B", "B"]))).toBe(true);
    await game.p1.cast("star", { targets: ["B", "B"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["B", "B"] })]);
    await game.settle();
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.state("A").damage).toBe(0);
  });

  test("Deflect is paid per instance: Warded once + A needs 1 extra power (unaffordable at 0, fine at 1); Warded TWICE needs 2 (unaffordable at 1, fine at 2 — and it dies to 6)", async () => {
    const none = await board(0).build();
    expect((await none.p1.try((p) => p.cast("star", { targets: ["warded", "A"] }))).ok).toBe(false);
    expect(none.chain()).toEqual([]);

    const one = await board(1).build();
    expect((await one.p1.try((p) => p.cast("star", { targets: ["warded", "warded"] }))).ok).toBe(false); // would need 2
    await one.p1.cast("star", { targets: ["warded", "A"] });
    expect(one.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } }); // 1 surcharge paid
    await one.settle();
    expect(one.zoneOf("warded")).toBe("trash");
    expect(one.state("A").damage).toBe(3);

    const two = await board(2).build();
    await two.p1.cast("star", { targets: ["warded", "warded"] });
    expect(two.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } }); // 2 surcharges paid
    await two.settle();
    expect(two.zoneOf("warded")).toBe("trash");
    expect(two.violations()).toEqual([]);
  });

  test("Bonus Damage applies to EACH instance: with Annie, Fiery on P1's board Falling Star deals 4 to A (dies at 4 Might) and 4 to B (survives at 5 with 4 damage)", async () => {
    const game = await board().unit(P1, "base", ANNIE_FIERY, "annie").build();
    await game.p1.cast("star", { targets: ["A", "B"] });
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash"); // 3 + 1 = 4 ≥ 4
    expect(game.state("B")).toMatchObject({ damage: 4, zone: "base" }); // 3 + 1 = 4 < 5 — not 3, and not 5 (bonus once per instance)
    expect(game.violations()).toEqual([]);
  });
});
