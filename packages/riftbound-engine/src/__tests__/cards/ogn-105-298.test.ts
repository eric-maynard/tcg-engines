/**
 * Singularity — ogn-105-298 · Spell · Mind · 6 energy + 2 [mind]
 *
 *   Deal 6 to each of up to two units.
 *
 * No [Action]/[Reaction] keyword: playable only on your own turn in an Open,
 * non-showdown state (rules 308.1.a, 313.1.a).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-105-298";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7 }, "bigFoe")
    .unit(P2, "base", { might: 6 }, "foe")
    .unit(P1, "base", { might: 7 }, "ally")
    .hand(P1, CARD, "sing");
}

describe("Singularity (ogn-105-298)", () => {
  test("costs 6 energy + 2 mind; not playable with only 1 mind or 5 energy", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const oneMind = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "sing").build();
    expect(oneMind.p1.can("cast", "sing")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { mind: 2 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "sing").build();
    expect(lowEnergy.p1.can("cast", "sing")).toBe(false);
  });

  test("deals 6 to EACH of two chosen units, anywhere, either side (7-Might survives with 6 damage; 6-Might dies)", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["bigFoe", "foe"] });
    await game.settle();
    expect(game.state("bigFoe").damage).toBe(6);
    expect(game.zoneOf("bigFoe")).toBe("battlefield-bf1");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("ally").damage).toBe(0);
    expect(game.zoneOf("sing")).toBe("trash");
  });

  test("'up to two': a single target (even your own unit) is legal; three targets are not", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "sing")?.fields.find((f) => f.arg === "targets");
    expect(field?.max).toBe(2);
    const three = await game.p1.try((p) => p.cast("sing", { targets: ["bigFoe", "foe", "ally"] }));
    expect(!three.ok && three.error.code).toBe("ILLEGAL_ARGS");
    await game.p1.cast("sing", { targets: ["ally"] });
    await game.settle();
    expect(game.state("ally").damage).toBe(6);
    expect(game.state("bigFoe").damage).toBe(0);
    expect(game.zoneOf("foe")).toBe("base");
  });

  test.failing("BUG: no [Action] keyword — Singularity cannot be cast during a showdown (rules 308.1.a, 313.1.a)", async () => {
    // Expected: with Focus in a showdown only Action/Reaction cards may be played, so Singularity is
    // not legal. Actual: the card def carries `timing: "action"` (the engine default for every spell),
    // which the engine treats as the [Action] permission, so it is offered in the showdown.
    const game = await board().unit(P1, "base", { might: 1 }, "scout").build();
    await game.p1.move("scout", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P1);
    expect(game.p1.can("cast", "sing")).toBe(false);
  });
});
