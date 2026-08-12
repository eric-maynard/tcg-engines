/**
 * Ruling 34ff9409343f3695 — Bellows Breath (SFD-080 → sfd-080-221) · Mind · [1][mind] · [Action]
 *   "[Repeat] [1][mind]  Deal 1 to up to three units at the same location."
 *
 * Q: Does a repeated Bellows Breath put two things on the chain / create two triggered abilities?
 * A: No. [Repeat] is an additional cost that makes the ONE spell execute its instructions twice as it resolves.
 *    It stays a single chain item, creates no triggered ability, and nobody gets priority between the two
 *    instances of damage.
 * Rules: 820.1.d / 820.3.a (Repeat re-executes the effect of the same chain item), 820.1.d.1 (no window
 *        between the executions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn with [2][mind][mind] — enough for the spell plus its [Repeat]. P2 holds bf1 with two units. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Alpha" }, "a")
    .unit(P2, "bf1", { might: 5, name: "Bravo" }, "b")
    .hand(P1, BELLOWS_BREATH, "bb");
}

/** Cast it with the Repeat paid, naming a single unit. */
async function castRepeated(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bb", { repeat: 1, targets: ["a"] }); // one chosen unit, two executions
  return game;
}

describe("Ruling 34ff9409343f3695 — a repeated Bellows Breath is ONE chain item resolving twice", () => {
  test("ruling: exactly one item goes on the chain, and it is the spell itself — no triggered ability appears", async () => {
    const game = await castRepeated();
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "bb", controller: P1, triggered: false });
  });

  test("[Repeat] is an additional COST: both pips and both Energy are paid as it is played", async () => {
    const game = await castRepeated();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("ruling: one pass each resolves the whole thing — both instances of damage land with no window in between", async () => {
    const game = await castRepeated();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("a").damage).toBe(0); // nothing has resolved yet
    await game.p2.passPriority(); // the single item resolves — both executions at once
    expect(game.chain()).toEqual([]);
    expect(game.state("a").damage).toBe(2); // both executions landed in that one resolution
    expect(game.state("b").damage).toBe(0);
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without [Repeat] it is still exactly one chain item — the count never depended on Repeat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Alpha" }, "a")
      .hand(P1, BELLOWS_BREATH, "bb")
      .build();
    await game.p1.cast("bb", { targets: ["a"] });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("a").damage).toBe(1);
  });
});
