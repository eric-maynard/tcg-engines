/**
 * Ruling 45fb1d8ef46b8962 — Viktor, Leader (OGN-246 → ogn-246-298) · Unit · Order · [4][order] · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *   × Singularity (OGN-105 → ogn-105-298) · [6][mind][mind] "Deal 6 to each of up to two units." (a board wipe)
 *
 * Q: If Viktor, Leader dies at the same time as another unit I control, how many tokens do I get?
 * A: Zero. Simultaneous deaths do not see each other: Viktor has to be on the board to evaluate his trigger
 *    condition, and he has already left it at the very moment the other unit's death is checked.
 * Rules: 383.2.c.2 (an object cannot evaluate its trigger condition if it leaves the zone the trigger is
 *        active from at the same time the condition is satisfied), 465.2.d (combat damage is simultaneous).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR_LEADER = "ogn-246-298";
const SINGULARITY = "ogn-105-298";

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

describe("Ruling 45fb1d8ef46b8962 — Viktor, Leader dying together with another unit makes zero tokens", () => {
  test("ruling (combat): Viktor (4) and an Ally (2) both die to a 9-Might Wall in the same damage step — no Recruit at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .build();
    await game.p1.move(["viktor", "ally"], "bf1");
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(recruits(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("ruling (board wipe): one Singularity kills Viktor and the Ally simultaneously — still zero Recruits", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .unit(P1, "base", { might: 5, name: "Ally" }, "ally")
      .hand(P2, SINGULARITY, "wipe")
      .build();
    await game.p2.cast("wipe", { targets: ["viktor", "ally"] });
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(recruits(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the Ally dies while Viktor stays alive — Viktor sees it and plays a 1-Might Recruit token into P1's base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("base");
    const toks = recruits(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isToken: true, might: 1, zone: "base" });
  });

  test("contrast: Viktor alone dying triggers nothing either — his ability watches OTHER units, not himself", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .build();
    await game.p1.move("viktor", "bf1");
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(recruits(game)).toEqual([]);
  });
});
