/**
 * Ruling 3392e29d3f8cf186 — Imperial Decree (OGN-221 → ogn-221-298) · [Action] · Order · [5][order][order]
 *     "When any unit takes damage this turn, kill it."
 *   × Grand Strategem (OGN-233 → ogn-233-298) · [Action] · "Give friendly units +5 [Might] this turn."
 *   × Wages of Pain (SFD-070 → sfd-070-221) · "Deal 3 to a unit at a battlefield. …"
 *
 * Q: Do "this turn" stat effects (Grand Strategem) also hit units that arrive later in the turn?
 * A: No — a one-shot "give … this turn" applies to the units present WHEN IT RESOLVES; later arrivals
 *    get nothing. Imperial Decree is the contrasting shape: it installs a turn-long delayed trigger,
 *    so it does catch units that arrive after it resolved.
 * Rules: 359 (an effect applies on resolution), 611 (continuous effects from one-shot instructions),
 *        386 (delayed triggered abilities).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const GRAND_STRATEGEM = "ogn-233-298";
const WAGES_OF_PAIN = "sfd-070-221";

const LATECOMER = { cardType: "unit", might: 4, energyCost: 1, name: "Latecomer" } as const;

/** P1's main phase holding bf1 with a 2-Might Anchor; a 4-Might Latecomer waits in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 15, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .hand(P1, LATECOMER, "late");
}

describe("Ruling 3392e29d3f8cf186 — 'this turn' stat effects snapshot the board; Imperial Decree's delayed trigger does not", () => {
  test("Grand Strategem buffs the unit that is on the board when it resolves (+5)", async () => {
    const game = await board().hand(P1, GRAND_STRATEGEM, "gs").build();
    await game.p1.cast("gs");
    await game.settle();
    expect(game.state("anchor")).toMatchObject({ might: 7, mightModifier: 5 });
  });

  test("ruling: a unit played AFTER Grand Strategem resolved gets nothing", async () => {
    const game = await board().hand(P1, GRAND_STRATEGEM, "gs").build();
    await game.p1.cast("gs");
    await game.settle();
    await game.p1.play("late", { to: "bf1" });
    await game.settle();
    expect(game.state("late")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.state("anchor").might).toBe(7); // the earlier unit keeps its +5
    expect(game.violations()).toEqual([]);
  });

  test("contrast (Imperial Decree): its turn-long delayed trigger DOES catch a unit that arrives later", async () => {
    const game = await board().hand(P1, IMPERIAL_DECREE, "decree").hand(P1, WAGES_OF_PAIN, "wages").build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.play("late", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("late")).toBe("battlefield-bf1");
    await game.p1.cast("wages", { targets: "late" }); // 3 damage on a 4-Might unit — not lethal by itself
    await game.settle();
    expect(game.zoneOf("late")).toBe("trash"); // killed by the Decree's delayed trigger
    expect(game.violations()).toEqual([]);
  });

  test("control: without Imperial Decree the same 3 damage leaves the 4-Might latecomer alive", async () => {
    const game = await board().hand(P1, WAGES_OF_PAIN, "wages").build();
    await game.p1.play("late", { to: "bf1" });
    await game.settle();
    await game.p1.cast("wages", { targets: "late" });
    await game.settle();
    expect(game.zoneOf("late")).toBe("battlefield-bf1");
    expect(game.state("late").damage).toBe(3);
  });
});
