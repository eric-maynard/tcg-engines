/**
 * En Garde — ogn-046-298 · Spell · Calm · 1 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a friendly unit +1 [Might] this turn, then an additional +1 [Might]
 *   this turn if it is the only unit you control there.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-046-298";

function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2 }, "loner") // alone at bf1 (only an enemy beside it)
    .unit(P2, "bf1", { might: 3 }, "foeAtBf1")
    .unit(P1, "base", { might: 2 }, "a") // two friendly units in base
    .unit(P1, "base", { might: 2 }, "b")
    .hand(P1, CARD, "eg");
}

describe("En Garde (ogn-046-298)", () => {
  test("costs 1 energy; targets only FRIENDLY units; goes to trash", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "eg")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["loner"], ["a"], ["b"]]));
    const t = await game.p1.try((p) => p.cast("eg", { targets: "foeAtBf1" }));
    expect(t.ok).toBe(false);
    await game.p1.cast("eg", { targets: "a" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("eg")).toBe("trash");
    const poor = await scenario().unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "eg").build();
    expect(poor.p1.can("cast", "eg")).toBe(false);
  });

  test.failing("BUG: +1 Might only when you control another unit at the same location (the extra +1 requires being alone there)", async () => {
    // Expected: "a" shares the base with "b" → only +1 (3 Might). Actual: the effect-level
    // `while-alone` condition is not evaluated (defaults to true), so every target gets +2.
    const game = await board().build();
    await game.p1.cast("eg", { targets: "a" });
    await game.settle();
    expect(game.state("a").might).toBe(3);
    expect(game.state("b").might).toBe(2);
  });

  test("+2 Might total when it is the only unit YOU control there (enemy units there don't count)", async () => {
    const game = await board().build();
    await game.p1.cast("eg", { targets: "loner" });
    await game.settle();
    expect(game.state("loner").might).toBe(4);
  });

  test("'this turn': the bonus is gone after the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("eg", { targets: "loner" });
    await game.settle();
    expect(game.state("loner").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("loner").might).toBe(2);
  });

  test("[Reaction] timing: castable on the opponent's turn and in response on a chain", async () => {
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "eg")).toBe(true);

    const game = await board().resources(P2, { energy: 1, power: { fury: 1 } }).hand(P2, "ogn-009-298", "ray").active(P2).build();
    await game.p2.cast("ray", { targets: "loner" }); // Hextech Ray: deal 3 to loner (2 Might)
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.p2.passPriority();
    await game.p1.cast("eg", { targets: "loner" });
    expect(game.chain()).toHaveLength(2);
    await game.settle(); // En Garde resolves first (+2 → 4 Might), then Ray deals 3: loner survives
    expect(game.zoneOf("loner")).toBe("battlefield-bf1");
    expect(game.state("loner").damage).toBe(3);
  });
});
