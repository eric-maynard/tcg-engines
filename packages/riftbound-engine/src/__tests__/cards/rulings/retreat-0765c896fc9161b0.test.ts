/**
 * Ruling 0765c896fc9161b0 — Retreat (OGN-104 → ogn-104-298) · [Reaction] · 1 · "Return a friendly unit to its owner's hand. Its owner channels 1 rune
 *     exhausted."
 *
 * Q: Can Retreat target a champion unit sitting in your Champion Zone?
 * A: No. "A unit" means a unit on the BOARD; spells and abilities can only target units on the board unless they explicitly say they reach
 *    another zone.
 * Rules: 355.6 / 137 (targets are chosen among objects on the board unless stated otherwise), 108 (Champion Zone is not the board).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const YASUO = "ogn-076-298"; // a champion unit for the Champion Zone

const offered = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  (game.p1.option("cast", "retreat")?.fields.find((f) => f.name === "targets")?.options ?? []).map((o) => (Array.isArray(o) ? o[0] : o) as string);

describe("Ruling 0765c896fc9161b0 — Retreat only reaches units on the board, never the Champion Zone", () => {
  test("with a champion in the Champion Zone AND a unit on the board, Retreat offers only the board unit; naming the champion is rejected", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .champion(P1, YASUO, "champ")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .hand(P1, RETREAT, "retreat")
      .build();
    expect(game.zoneOf("champ")).toBe("championZone");
    expect(offered(game)).toEqual(["grunt"]);
    const r = await game.p1.try((p) => p.cast("retreat", { targets: "champ" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("champ")).toBe("championZone");
    expect(game.p1.energy()).toBe(1);
    // the legal cast works as printed
    await game.p1.cast("retreat", { targets: "grunt" });
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("with the champion in the Champion Zone as P1's ONLY 'unit', Retreat has no legal target at all and cannot be cast", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).champion(P1, YASUO, "champ").hand(P1, RETREAT, "retreat").build();
    expect(game.p1.can("cast", "retreat")).toBe(false);
    expect(offered(game)).toEqual([]);
    expect((await game.p1.try((p) => p.cast("retreat", { targets: "champ" }))).ok).toBe(false);
    expect(game.zoneOf("retreat")).toBe("hand");
  });

  test("the same unit IS targetable once it is actually on the board (played from the Champion Zone): the restriction is about the zone, not the card", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { calm: 2 } })
      .champion(P1, YASUO, "champ")
      .hand(P1, RETREAT, "retreat")
      .battlefield("bf1", { controller: P2 })
      .build();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("champ")).toBe("base");
    expect(offered(game)).toEqual(["champ"]);
    await game.p1.cast("retreat", { targets: "champ" });
    await game.settle();
    expect(game.zoneOf("champ")).not.toBe("base");
    expect(["hand", "championZone"]).toContain(game.zoneOf("champ"));
    expect(game.violations()).toEqual([]);
  });
});
