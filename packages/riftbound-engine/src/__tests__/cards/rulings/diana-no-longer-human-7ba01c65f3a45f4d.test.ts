/**
 * Ruling 7ba01c65f3a45f4d — Diana, No Longer Human (UNL-149 → unl-149-219) · 3 Might · "[Ambush] When you play a spell, give me +2 [Might]
 *     this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1]+[calm] · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: If my spell is countered, does Diana still get +2 Might?
 * A: No. A spell counts as "played" only when it resolves; a countered spell is cleared from the chain, is not considered played
 *    (425.1.b), so Diana's trigger never goes on the chain and she gets nothing.
 * Rules: 425.1.a–b (countered: no effect, not played), 419.4.a (play triggers fire on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIANA = "unl-149-219";
const DEFY = "ogn-045-298";
/** A [1] Action spell (Defy-able: costs ≤ [4] and no power). */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/** P1's turn: Diana (3) in base, Spark in hand with [1]. P2: a 5-Might Target at bf1, Defy with exactly [1]+calm. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "target")
    .unit(P1, "base", DIANA, "diana")
    .hand(P1, SPARK, "spark")
    .hand(P2, DEFY, "defy");
}

/** Ordinals of P1's plays this turn that the engine has voided as COUNTERED (never resolved → never "played" for play-triggers). */
const counteredOrdinals = (game: Game) => game.gameState.counteredPlayOrdinalsThisTurn?.[P1] ?? [];

describe("Ruling 7ba01c65f3a45f4d — a countered spell was never 'played', so Diana gets no +2", () => {
  test("control: Spark resolves → Diana's 'when you play a spell' fires only then and she is 5 this turn (3 next turn)", async () => {
    const game = await board().build();
    await game.p1.cast("spark", { targets: "target" });
    // Merely putting it on the chain is not "playing" it yet: Diana still 3, no trigger item.
    expect(game.state("diana").might).toBe(3);
    expect(game.chain().some((c) => c.cardId === "diana")).toBe(false);
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.state("target").damage).toBe(1);
    expect(counteredOrdinals(game)).toEqual([]);
    expect(game.state("diana")).toMatchObject({ might: 5, mightModifier: 2 });
    await game.advanceTurn();
    expect(game.state("diana").might).toBe(3);
  });

  test("P2 Defies the Spark: Defy is legal against it and sits on top of the chain; Diana is still 3 while both wait", async () => {
    const game = await board().build();
    await game.p1.cast("spark", { targets: "target" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "spark" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spark", "defy"]);
    expect(game.state("diana").might).toBe(3);
    expect(game.chain().some((c) => c.cardId === "diana")).toBe(false);
  });

  test("Defy resolves and counters Spark: Spark → trash with no effect, it is NOT counted as played, Diana's trigger never appears on the chain, and she stays at 3", async () => {
    const game = await board().build();
    await game.p1.cast("spark", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "spark" });
    // Resolve step by step, watching that no Diana item is ever added.
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      expect(game.chain().some((c) => c.cardId === "diana")).toBe(false);
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.state("target").damage).toBe(0); // countered: no effect
    expect(game.p1.energy()).toBe(0); // 425.1.c — no refund
    expect(counteredOrdinals(game)).toEqual([1]); // 425.1.b — P1's 1st play this turn is void: not considered played
    expect(game.state("diana")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
