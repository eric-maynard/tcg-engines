/**
 * Ruling a3a8ff438655a6b1 — Baron Nashor (UNL-147 → unl-147-219) · 12 Might "… I can't be chosen by enemy spells and abilities.
 *   Other friendly units have +2 [Might]."
 *   × Iron Ballista (OGN-017 → ogn-017-298) Gear "This enters exhausted. [Exhaust]: Deal 2 to a unit at a battlefield."
 *
 * Q: Can I target Baron Nashor with Iron Ballista?
 * A: No. "Deal 2 to a unit at a battlefield" selects a specific unit — that is choosing it — and Baron can't be chosen by ENEMY
 *    spells and abilities. (His own controller's effects may still choose him.)
 * Rules: 355.5 (an instruction naming "a unit" chooses/targets it), 355.9 (untargetable objects are not legal choices).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const IRON_BALLISTA = "ogn-017-298";

/** P1's turn. P2 holds bf1 with Baron Nashor (12) and a Minion (2 → 4 with Baron). P1: a READY Iron Ballista in base; P2 also owns a ready Ballista. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", BARON_NASHOR, "baron")
    .unit(P2, "bf1", { might: 2, name: "Minion" }, "minion")
    .gear(P1, IRON_BALLISTA, "ballista")
    .gear(P2, IRON_BALLISTA, "theirBallista");
}

function ballistaTargets(game: Game, seat: "p1" | "p2", card: string): string[] {
  const f = game[seat].option("activate", card)?.fields.find((x) => x.name === "targets");
  return [...new Set((f?.options ?? []).flat() as string[])];
}

describe("Ruling a3a8ff438655a6b1 — Iron Ballista cannot choose an enemy Baron Nashor", () => {
  test("P1's Ballista offers the Minion at bf1 but NOT Baron; forcing Baron is rejected and nothing is paid", async () => {
    const game = await board().build();
    expect(game.state("minion").might).toBe(4); // Baron's +2 to other friendly units is live
    expect(game.p1.can("activate", "ballista")).toBe(true);
    const offered = ballistaTargets(game, "p1", "ballista");
    expect(offered).toContain("minion");
    expect(offered).not.toContain("baron");
    const forced = await game.p1.try((p) => p.activate("ballista", undefined, { targets: "baron" }));
    expect(forced.ok).toBe(false);
    expect(game.state("ballista").isExhausted).toBe(false);
    expect(game.state("baron").damage).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("the Ballista works normally on the Minion next to him: exhaust → 2 damage", async () => {
    const game = await board().build();
    await game.p1.activate("ballista", undefined, { targets: "minion" });
    expect(game.state("ballista").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("minion").damage).toBe(2);
    expect(game.state("baron").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("'enemy' only: on P2's turn, P2's own Ballista may choose Baron", async () => {
    const game = await board().active(P2).build();
    expect(game.p2.can("activate", "theirBallista")).toBe(true);
    expect(ballistaTargets(game, "p2", "theirBallista")).toContain("baron");
    await game.p2.activate("theirBallista", undefined, { targets: "baron" });
    await game.settle();
    expect(game.state("baron").damage).toBe(2);
  });
});
