/**
 * Defiant Dance — sfd-196-221 · Spell (Reaction) · Calm/Chaos · 1 energy + [rainbow]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a unit +2 [Might] this turn and another unit -2 [Might] this turn.
 *
 * rule 355.8 — "another unit" is a SECOND, independently chosen target that must
 * differ from the first: the +2 and the -2 never land on the same unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const DEFIANT_DANCE = "sfd-196-221";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .unit(P1, "base", { might: 3 }, "ally")
    .unit(P2, "base", { might: 3 }, "foe")
    .hand(P1, DEFIANT_DANCE, "dance");
}

describe("Defiant Dance (sfd-196-221)", () => {
  test("the two clauses hit DIFFERENT units: +2 on the first pick, -2 on the second", async () => {
    const game = await board().build();
    await game.p1.cast("dance", { targets: ["ally", "foe"] });
    await game.settle();
    expect(game.zoneOf("dance")).toBe("trash");
    expect(game.state("ally").might).toBe(5);
    expect(game.state("foe").might).toBe(1);
  });

  test("order matters — the first named unit gets the +2", async () => {
    const game = await board().build();
    await game.p1.cast("dance", { targets: ["foe", "ally"] });
    await game.settle();
    expect(game.state("foe").might).toBe(5);
    expect(game.state("ally").might).toBe(1);
  });

  test("'another' — the same unit is never offered for both slots", async () => {
    const game = await board().build();
    const options = game.p1
      .option("cast", "dance")
      ?.fields.find((f) => f.arg === "targets")?.options as string[][] | undefined;
    const pairs = (options ?? []).filter((o) => o.length === 2);
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair[0]).not.toBe(pair[1]);
    }
    expect(pairs).toEqual(expect.arrayContaining([["ally", "foe"], ["foe", "ally"]]));
  });
});
