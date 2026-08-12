/**
 * Ruling f49826313c4f86a8 — Fox-Fire (OGN-256 → ogn-256-298) · [Action] [3]
 *   "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Shen, Kinkou (OGN-241 → ogn-241-298) — a [Reaction] 3-Might unit that can be played to a battlefield you control.
 *
 * Q: Can Fox-Fire kill a Shen that the opponent plays in RESPONSE to Fox-Fire going on the chain?
 * A: No. Fox-Fire's chosen objects are locked in when it is put on the chain; a unit that arrives afterwards was
 *    never among the candidates and cannot be added. Fox-Fire resolves with exactly the set it named.
 * Rules: 355 (targets chosen on play), 340 (LIFO), 359.3.e.5 (illegal chosen objects are dropped, never re-aimed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const SHEN = "ogn-241-298";

/** P1's turn. P2 holds bf1 with two 2-Might Cubs (total 4 — exactly Fox-Fire's budget) and can flash in Shen. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 3, calm: 2, mind: 2 } })
    .resources(P2, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Cub A" }, "cubA")
    .unit(P2, "bf1", { might: 2, name: "Cub B" }, "cubB")
    .hand(P1, FOX_FIRE, "foxfire")
    .hand(P2, SHEN, "shen");
}

/** P1 names both Cubs; P2 answers by flashing Shen onto bf1. */
async function foxFireThenShen(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("foxfire", { targets: ["cubA", "cubB"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "foxfire", targets: ["cubA", "cubB"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("play", "shen")).toBe(true);
  await game.p2.play("shen", { to: "bf1" });
  expect(game.locationOf("shen")).toBe("bf1");
  return game;
}

describe("Ruling f49826313c4f86a8 — Fox-Fire's kill set is locked when it is played", () => {
  test("premise: before anything is played, Shen is not on the board and only the two Cubs are candidates", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "foxfire")?.fields.find((f) => f.arg === "targets");
    const offered = new Set((field?.options ?? []).flat() as string[]);
    expect(offered).toEqual(new Set(["cubA", "cubB"]));
    expect(game.zoneOf("shen")).toBe("hand");
  });

  test("Shen arrives after Fox-Fire is on the chain — Fox-Fire's recorded set does NOT grow", async () => {
    const game = await foxFireThenShen();
    const item = game.chain().find((c) => c.cardId === "foxfire");
    expect(item?.targets).toEqual(["cubA", "cubB"]);
    expect(item?.targets).not.toContain("shen");
  });

  test("Fox-Fire resolves on its original set: both Cubs die, Shen is untouched", async () => {
    const game = await foxFireThenShen();
    await game.settle();
    expect(game.zoneOf("cubA")).toBe("trash");
    expect(game.zoneOf("cubB")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen").damage).toBe(0);
    expect(game.zoneOf("foxfire")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Shen was never a legal choice anyway: 3 more Might would blow the 'total Might 4 or less' budget", async () => {
    const game = await board().unit(P2, "bf1", SHEN, "shenOnBoard").build();
    const field = game.p1.option("cast", "foxfire")?.fields.find((f) => f.arg === "targets");
    const sets = (field?.options ?? []) as string[][];
    for (const set of sets) {
      const total = set.reduce((n, id) => n + game.state(id).might, 0);
      expect(total).toBeLessThanOrEqual(4);
    }
  });
});
