/**
 * Ruling 40b5826bbf63fda6 — (no specific card) can a kill spell hit a unit in a base?
 *   Exercised with Vengeance (OGN-229 → ogn-229-298) "Kill a unit.", Blast of Power
 *   (OGS-012 → ogs-012-024) "[Action] Kill a unit at a battlefield." and Flash (OGS-011 → ogs-011-024).
 *
 * Q: Can you target a unit in a base with a kill spell?
 * A: Yes, unless the spell restricts itself to a battlefield. "Kill a unit" hits anything on the board;
 *    "Kill a unit at a battlefield" cannot name a unit in a base — and if the unit it named is moved to a
 *    base before the spell resolves, the target is illegal and that instruction does nothing.
 * Rules: 355.9 (a descriptor without a location clause covers the whole board), 359.3.e.9 / 359.3.e.5
 *        (a target that stopped matching its descriptor makes the instruction do nothing — no re-target).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VENGEANCE = "ogn-229-298"; // [4][order][order] — "Kill a unit."
const BLAST = "ogs-012-024"; // [6][order] — "[Action] Kill a unit at a battlefield."
const FLASH = "ogs-011-024"; // [2] — "[Reaction] Move up to 2 friendly units to base."

/** P1's turn. P2 has one unit in base and one at bf1 they hold. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Outpost Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Home Guard" }, "homer");
}

describe("Ruling 40b5826bbf63fda6 — 'Kill a unit' reaches a base, 'Kill a unit at a battlefield' does not", () => {
  test("Vengeance offers BOTH the base unit and the battlefield unit, and kills the one in the base", async () => {
    const game = await board().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "vengeance").build();
    const targets = (game.p1.option("cast", "vengeance")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect([...(targets as string[])].sort()).toEqual(["guard", "homer"]);
    await game.p1.cast("vengeance", { targets: "homer" });
    await game.settle();
    expect(game.zoneOf("homer")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("Blast of Power ('at a battlefield') offers only the battlefield unit — the base unit is not a legal target", async () => {
    const game = await board().resources(P1, { energy: 6, power: { order: 1 } }).hand(P1, BLAST, "blast").build();
    const targets = (game.p1.option("cast", "blast")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["guard"]);
    expect((await game.p1.try((p) => p.cast("blast", { targets: "homer" }))).ok).toBe(false);
  });

  test("359.3.e.9: a unit named by 'at a battlefield' that Flashes home before the spell resolves is no longer a legal target — it survives", async () => {
    const game = await board()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .resources(P2, { energy: 2 })
      .hand(P1, BLAST, "blast")
      .hand(P2, FLASH, "flash")
      .build();
    await game.p1.cast("blast", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["guard"] }); // moved to base in response
    await game.settle();
    expect(game.locationOf("guard")).toBe("base");
    expect(game.zoneOf("guard")).toBe("base"); // the kill instruction did nothing
    expect(game.zoneOf("blast")).toBe("trash"); // …but the spell was still played and resolved
    expect(game.violations()).toEqual([]);
  });

  test("…whereas the unrestricted Vengeance follows it home: moving to a base is no escape from 'Kill a unit'", async () => {
    const game = await board()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .resources(P2, { energy: 2 })
      .hand(P1, VENGEANCE, "vengeance")
      .hand(P2, FLASH, "flash")
      .build();
    await game.p1.cast("vengeance", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["guard"] });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
  });
});
