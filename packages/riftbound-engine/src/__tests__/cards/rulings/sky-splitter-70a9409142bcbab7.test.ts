/**
 * Ruling 70a9409142bcbab7 — Sky Splitter (OGN-014 → ogn-014-298) · Spell · Fury · [8][fury] · [Action]
 *     "This spell's Energy cost is reduced by the highest Might among units you control. Deal 5 to a unit at a
 *      battlefield."
 *   × Defy (OGN-045 → ogn-045-298) · Spell · Calm · [1][calm] · [Reaction]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Can Sky Splitter be Defied if cost reductions bring what I actually pay down to [4]?
 * A: No. Defy looks at the card's cost — the printed [8] — not the reduced amount actually paid. Sky Splitter is
 *    never a legal Defy target, however cheap it becomes.
 * Rules: 204.1 (a card's cost is what is printed on it), 204.4 (cost modifications change what is paid, not the
 *        card's cost), 355.8 (an illegal target cannot be chosen).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKY_SPLITTER = "ogn-014-298";
const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298"; // printed [1][fury] — the control case

/** P1's turn. P1's 4-Might Champion is in base (so Sky Splitter costs [8−4]=[4] to pay) and P1 has exactly [4][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Ogre" }, "ogre")
    .unit(P1, "base", { might: 4, name: "Champion" }, "champ")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, DEFY, "defy");
}

const defyTargets = (game: Game): unknown[] =>
  (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

describe("Ruling 70a9409142bcbab7 — Defy reads Sky Splitter's printed [8], not the reduced amount paid", () => {
  test("premise: the reduction is real — with a 4-Might Champion, Sky Splitter is paid with [4][fury], but the card's cost is still [8]", async () => {
    const game = await board().build();
    expect(game.state("sky").energyCost).toBe(8); // printed
    await game.p1.cast("sky", { targets: "ogre" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // 5−4 energy, 2−1 fury
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1 })]);
  });

  test("Defy cannot answer it: with Sky Splitter on the chain the spell is not among Defy's targets and Defy is not even castable", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "ogre" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(defyTargets(game)).not.toContain("sky");
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect((await game.p2.try((p) => p.cast("defy", { targets: "sky" }))).ok).toBe(false);
  });

  test("… so it resolves: 5 damage lands on the Ogre and P2 still has its untouched Defy and [1][calm]", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "ogre" });
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.state("ogre").damage).toBe(5);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("control — the refusal really is the cost check: a printed [1][fury] Hextech Ray on the same chain IS a legal Defy target and gets countered", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "ogre" });
    await game.p1.passPriority();
    expect(defyTargets(game)).toEqual(["ray"]);
    await game.p2.cast("defy", { targets: "ray" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("ogre").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
