/**
 * Ruling d3be94c4f8fc2440 — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm]
 *   "Counter a spell that costs no more than [4] and no more than [R]."
 *   × Sky Splitter (OGN-014 → ogn-014-298) · Action · [8][fury]
 *   "This spell's Energy cost is reduced by the highest Might among units you control. Deal 5 to a unit at a battlefield."
 *
 * Q: Does Defy work against Sky Splitter when its cost has been reduced by a high-Might unit?
 * A: Cost reductions don't change what Defy can target: effects that check a card's cost use its BASE cost. Sky
 *    Splitter's base cost is [8], so Defy (≤ [4]) reads 8 no matter how little was actually paid.
 * Rules: 118/119 (cost vs. what is paid; reductions apply as you play), Defy's cost filter reads printed Energy cost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const SKY_SPLITTER = "ogn-014-298";

/**
 * P1's turn. P1 controls a 6-Might Titan at bf1 (so Sky Splitter costs 8 − 6 = [2]) and has exactly [2][fury]. P2's Target (7)
 * also stands at bf1; P2 holds Defy with exactly [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Titan" }, "titan")
    .unit(P2, "bf1", { might: 7, name: "Target" }, "target")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P2, DEFY, "defy");
}

const defyTargets = (game: Game) => (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

describe("Ruling d3be94c4f8fc2440 — Defy reads Sky Splitter's BASE cost [8]; the Might reduction doesn't make it Defy-able", () => {
  test("premise: with a 6-Might unit, Sky Splitter is castable for just [2][fury] (8 reduced by 6)", async () => {
    const game = await board().build();
    expect(game.state("sky").energyCost).toBe(8); // printed
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "target" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1, targets: ["target"] })]);
  });

  test("with Sky Splitter on the chain (paid [2]), P2's Defy has NO legal object — Sky Splitter still 'costs' [8] > [4]; it resolves for 5", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "target" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(defyTargets(game)).not.toContain("sky");
    expect(game.p2.can("cast", "defy")).toBe(false);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "sky" }));
    expect(r.ok).toBe(false);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.state("target")).toMatchObject({ damage: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("contrast: the same Defy does counter a spell whose base cost is within [4] / [R]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 6, name: "Titan" }, "titan")
      .unit(P2, "bf1", { might: 7, name: "Target" }, "target")
      .hand(P1, { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Spark", timing: "action" }, "spark")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("spark", { targets: "target" });
    await game.p1.passPriority();
    expect(defyTargets(game)).toEqual(["spark"]);
    await game.p2.cast("defy", { targets: "spark" });
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.state("target").damage).toBe(0);
  });
});
