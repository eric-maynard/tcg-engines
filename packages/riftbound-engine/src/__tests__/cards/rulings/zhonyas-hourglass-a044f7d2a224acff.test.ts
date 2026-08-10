/**
 * Ruling a044f7d2a224acff — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Does a buffed unit lose its buff when Zhonya's recalls it from a battlefield to base?
 * A: No. A recall is a change of LOCATION, not of zone; buffs (and other board state) are only reset when a
 *    card changes zones (dies / returns to hand). The recalled unit never died, so it keeps its buff.
 * Rules: 124 (new object only on zone change), 456/457 (recall = relocation on the board), 366–373 (die replacement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
/** P2's removal: deal 6 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn. P1: buffed Veteran (3 printed +1 buff = 4) holding bf1, Zhonya's in base. P2: Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet", { buffed: true })
    .gear(P1, ZHONYAS, "zhonya")
    .hand(P2, BOLT, "bolt");
}

describe("Ruling a044f7d2a224acff — a unit saved by Zhonya's keeps its buff (recall is a location change, not a zone change)", () => {
  test("precondition: the Veteran at bf1 is buffed (3 + 1 = 4) and Zhonya's sits in P1's base", async () => {
    const game = await board().build();
    expect(game.state("vet")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("zhonya")).toBe("base");
  });

  test("Bolt (6) would kill the Veteran: Zhonya's is killed instead; the Veteran is healed, exhausted and recalled to base — STILL BUFFED at 4 Might", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "vet" });
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("vet")).toBe("base"); // recalled, never left the board
    expect(game.state("vet")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("vet").isBuffed).toBe(true);
    expect(game.state("vet").might).toBe(4);
    expect(game.p1.trash()).not.toContain("vet");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Zhonya's the Veteran DIES (zone change to trash) and a card in the trash carries no buff", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet", { buffed: true })
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "vet" });
    await game.settle();
    expect(game.zoneOf("vet")).toBe("trash");
    expect(game.state("vet").isBuffed).toBe(false);
  });
});
