/**
 * Ruling 8135865645553c5a — Not So Fast (SFD-045 → sfd-045-221) · Reaction · [2][calm] "Counter an enemy spell or ability that chooses
 *   a friendly unit or gear." × Missile Barrage (a [Repeat] damage spell — not in this card pool; Frigid Touch SFD-066 "[Repeat][2] Give a
 *   unit -2 [Might] this turn" stands in as the Repeat spell that chooses units) (× Defy OGN-045 cited for "one combined spell").
 *
 * Q: Not So Fast against a Repeat spell aimed at two units (or one unit twice) — does it counter both effects or just one?
 * A: The ENTIRE spell, Repeat and all. Repeat does not create separate items; it is one spell (with one combined cost), so
 *    it is countered as one — whether the executions chose two different units or the same unit twice.
 * Rules: 820 (Repeat: additional cost, same spell executes again), 425.1 (a countered spell does nothing and is trashed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const FRIGID_TOUCH = "sfd-066-221";

/** P1's turn: Frigid Touch + [4] (2 + Repeat 2). P2 holds bf1 with A (4) and B (4) and has Not So Fast + [2][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Unit A" }, "a")
    .unit(P2, "bf1", { might: 4, name: "Unit B" }, "b")
    .hand(P1, FRIGID_TOUCH, "ft")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** P1 casts Frigid Touch with one Repeat at `targets`; passes → P2 has priority. */
async function repeatedFrigidTouch(targets: string | string[]): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ft", { repeat: 1, targets });
  expect(game.p1.energy()).toBe(0); // ONE combined cost: 2 + 2
  expect(game.chain()).toHaveLength(1); // ONE chain item — Repeat adds no second item/trigger
  expect(game.chain()[0]).toMatchObject({ cardId: "ft", controller: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

async function nsfCountersIt(game: Game): Promise<void> {
  expect(game.p2.can("cast", "nsf")).toBe(true);
  await game.p2.cast("nsf", { targets: "ft" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ft", "nsf"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("nsf")).toBe("trash");
  expect(game.zoneOf("ft")).toBe("trash");
}

describe("Ruling 8135865645553c5a — Not So Fast counters a Repeat spell in its entirety", () => {
  test("control (two different units): unopposed, the repeated Frigid Touch gives A −2 AND B −2", async () => {
    const game = await repeatedFrigidTouch(["a", "b"]);
    await game.p2.passPriority();
    expect(game.state("a").might).toBe(2);
    expect(game.state("b").might).toBe(2);
  });

  test("two different units: Not So Fast counters the whole spell — NEITHER A nor B gets −2; the spell is trashed, P1's [4] is gone", async () => {
    const game = await repeatedFrigidTouch(["a", "b"]);
    await nsfCountersIt(game);
    expect(game.state("a")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.state("b")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control (same unit twice): unopposed, A gets −4", async () => {
    const game = await repeatedFrigidTouch("a");
    await game.p2.passPriority();
    expect(game.state("a").might).toBe(0);
    expect(game.state("a").mightModifier).toBe(-4);
  });

  test("same unit twice: Not So Fast still counters BOTH executions — A stays at 4 (not 2, not 0)", async () => {
    const game = await repeatedFrigidTouch("a");
    await nsfCountersIt(game);
    expect(game.state("a")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.state("b")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
