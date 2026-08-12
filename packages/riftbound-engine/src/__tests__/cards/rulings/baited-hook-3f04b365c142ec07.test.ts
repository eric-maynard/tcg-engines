/**
 * Ruling 3f04b365c142ec07 — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order · [3]
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a
 *    unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost.
 *    Then recycle the rest."
 *   × Legion Rearguard (OGN-010 → ogn-010-298) — 2 Might, "[Accelerate] (You may pay [1][fury] as an
 *     additional cost to have me enter ready.)"
 *
 * Q: When Baited Hook plays a unit "ignoring its cost", do you still have to pay [Accelerate]?
 * A: Yes. "Ignoring the cost" waives only the BASE cost. [Accelerate] is an additional cost, so it is still
 *    offered and still has to be paid in full if you want the unit to enter ready.
 * Rules: 356.1.b/356.5.a ("ignoring its cost" waives the base cost of the instructed play),
 *        356.4 (additional costs are separate from the base cost), 811 ([Accelerate]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const LEGION_REARGUARD = "ogn-010-298"; // [2] · 2 Might · [Accelerate] [1][fury]
const FILLER = "ogn-175-298"; // Shipyard Skulker, a 3-Might vanilla (too big for the "+1 Might" gate)
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/**
 * P1 has Baited Hook and a 1-Might Pawn to feed it, with Legion Rearguard on top of the deck.
 * The pool holds [1][order] (the Hook's cost) plus whatever `extra` the test wants for [Accelerate].
 */
async function fireTheHook(extra: { energy?: number; power?: Record<string, number> }): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 1 + (extra.energy ?? 0), power: { order: 1, ...(extra.power ?? {}) } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", unit(1, "Pawn"), "pawn")
    .deck(P1, [LEGION_REARGUARD, FILLER, FILLER, FILLER, FILLER], ["rear", "f1", "f2", "f3", "f4"])
    .build();
  await game.p1.activate("hook", 0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("pawn")).toBe("trash"); // the cost-kill
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("rear");
  return game;
}

describe("Ruling 3f04b365c142ec07 — 'ignoring its cost' waives the base cost only; [Accelerate] is still charged", () => {
  test("with [1][fury] spare: the [Accelerate] opt-in is offered, and paying it makes the Rearguard enter READY", async () => {
    const game = await fireTheHook({ energy: 1, power: { fury: 1 } });

    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    await game.settle();

    expect(game.locationOf("rear")).toBe("base");
    expect(game.state("rear").isExhausted).toBe(false); // Accelerate did its job
    // 1 Energy + [order] went on the Hook, 1 Energy + [fury] on Accelerate — the Rearguard's printed [2] never was.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("declining the [Accelerate] cost: the Rearguard still enters (base cost ignored) but EXHAUSTED", async () => {
    const game = await fireTheHook({ energy: 1, power: { fury: 1 } });

    await game.p1.no();
    await game.settle();

    expect(game.locationOf("rear")).toBe("base");
    expect(game.state("rear").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } }); // nothing extra paid
  });

  test("no [fury] at all: the unit still enters for free, exhausted — [Accelerate] cannot be had on the house", async () => {
    const game = await fireTheHook({});

    await game.settle();

    expect(game.locationOf("rear")).toBe("base"); // the base [2] really was ignored — P1 has 0 Energy left
    expect(game.state("rear").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});
