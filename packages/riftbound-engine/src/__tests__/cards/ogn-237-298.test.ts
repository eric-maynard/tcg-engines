/**
 * King's Edict — ogn-237-298 · Spell · Order · 6 energy + [order][order]
 *
 *   Starting with the next player, each other player chooses a unit you don't
 *   control that hasn't been chosen for this spell. Kill those units.
 *
 * The OPPONENTS choose (in turn order starting with the next player), one
 * distinct unit each, from among all units the caster doesn't control; then
 * all chosen units are killed. No [Action]/[Reaction] keyword → own turn,
 * Neutral Open state only. Where the engine instead asks the caster while
 * playing, we feed that prompt via `answers` so outcome clauses still run.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../harness";

const CARD = "ogn-237-298";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 2 } })
    .unit(P1, "base", { might: 1, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 1, name: "FoeWeak" }, "foeWeak")
    .unit(P2, "base", { might: 6, name: "FoeBig" }, "foeBig")
    .hand(P1, CARD, "edict");
}

describe("King's Edict (ogn-237-298)", () => {
  test("2 players, opponent has a single unit: that unit is killed; pays 6 energy + 2 order; spell to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 2 } })
      .unit(P1, "base", { might: 1 }, "mine")
      .unit(P2, "base", { might: 6 }, "only")
      .script(P2, ["only"])
      .hand(P1, CARD, "edict")
      .build();
    await game.p1.cast("edict", { answers: ["only"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("only")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("edict")).toBe("trash");
  });

  test("'a unit you don't control': the caster's own units are never eligible", async () => {
    const game = await board().build();
    const offered = (game.p1.option("cast", "edict")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(offered.flat()).not.toContain("mine");
    const r = await game.p1.try((p) => p.cast("edict", { targets: "mine" }));
    expect(r.ok).toBe(false);
  });

  test("the OTHER player chooses which unit dies — the caster picks nothing", async () => {
    // Expected: casting needs no target from P1; on resolution P2 is asked to choose among
    // foeWeak/foeBig (units P1 doesn't control) and their pick dies.
    // Actual: the caster targets one enemy unit at play time and P2 is never asked.
    const game = await board().script(P2, ["foeWeak"]).build();
    expect(game.p1.option("cast", "edict")?.fields.find((f) => f.arg === "targets")).toBeUndefined();
    await game.p1.cast("edict");
    await game.settle();
    expect(game.zoneOf("foeWeak")).toBe("trash");
    expect(game.zoneOf("foeBig")).toBe("base");
  });

  test("3 players — each other player chooses a distinct unit, so two units are killed", async () => {
    // Expected: P2 chooses first (say p3unit — any unit P1 doesn't control), then P3 must choose a
    // different one (p2unit); both die. Actual: exactly one caster-chosen enemy unit is killed.
    const game = await scenario({ players: 3 })
      .resources(P1, { energy: 6, power: { order: 2 } })
      .unit(P1, "base", { might: 1 }, "mine")
      .unit(P2, "base", { might: 4 }, "p2unit")
      .unit(P3, "base", { might: 4 }, "p3unit")
      .script(P2, ["p3unit"])
      .script(P3, ["p2unit"])
      .hand(P1, CARD, "edict")
      .build();
    await game.p1.cast("edict", { answers: ["p2unit"] });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("p2unit")).toBe("trash");
    expect(game.zoneOf("p3unit")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("base");
  });

  test("no [Action] keyword: not playable on the opponent's turn, not even inside a showdown (rule 316.5.b)", async () => {
    const game = await board().active(P2).battlefield("bf1").unit(P2, "base", { might: 1 }, "walker").build();
    expect(game.p1.can("cast", "edict")).toBe(false);
    await game.p2.move("walker", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "edict")).toBe(false);
  });

  test("cost: unaffordable with 5 energy or with only 1 order", async () => {
    const low = await board().resources(P1, { energy: 5, power: { order: 2 } }).build();
    expect(low.p1.can("cast", "edict")).toBe(false);
    const oneOrder = await board().resources(P1, { energy: 6, power: { order: 1 } }).build();
    expect(oneOrder.p1.can("cast", "edict")).toBe(false);
  });
});
