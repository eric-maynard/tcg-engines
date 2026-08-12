/**
 * Ruling 2278dc4b77b3d42a — Baited Hook (OGN-242 → ogn-242-298) · Order gear · [3]
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a
 *    unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost.
 *    Then recycle the rest."
 *
 * Q: Does the Might cap read the CURRENT Might of the killed unit, or its printed Might?
 * A: The current Might, as the unit was killed. A printed 2-Might unit standing at 4 Might raises the cap to 5,
 *    not to 3.
 * Rules: 359.3.e.13 (last-known information about an object that has left), 142 (Might is the current value).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";

const unitDef = (might: number, name: string) => ({ cardType: "unit", energyCost: might, might, name });

/**
 * P1's turn with [1][order] and a ready Baited Hook. The only friendly unit is a printed 2-Might Pawn whose
 * current Might is `pawnMight` (a lasting +N). The top 5 of the deck hold units of 3, 5 and 6 Might.
 */
function board(pawnMight: number) {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", unitDef(2, "Pawn"), "pawn", { mightModifier: pawnMight - 2 })
    .deck(
      P1,
      [unitDef(3, "Three"), unitDef(5, "Five"), unitDef(6, "Six"), unitDef(1, "One"), unitDef(9, "Nine")],
      ["three", "five", "six", "one", "nine"],
    );
}

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : ["<not a pick>"]);

/** Activate the Hook; the Pawn is the only kill target, so the look prompt follows immediately. */
async function activate(pawnMight: number): Promise<Game> {
  const game = await board(pawnMight).build();
  expect(game.state("pawn").might).toBe(pawnMight);
  expect(game.state("pawn").baseMight).toBe(2);
  await game.p1.activate("hook", 0);
  await game.settle();
  expect(game.zoneOf("pawn")).toBe("trash");
  return game;
}

describe("Ruling 2278dc4b77b3d42a — Baited Hook's cap reads the killed unit's CURRENT Might", () => {
  test("ruling: a printed 2-Might Pawn standing at 4 gives a cap of 5 — the 5-Might unit is offered, the 6-Might one is not", async () => {
    const game = await activate(4);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(offered(d)).toEqual(["five", "one", "three"]); // ≤ 4 + 1; "six" and "nine" are out
  });

  test("…and the 5-Might unit really can be taken and played for free", async () => {
    const game = await activate(4);
    await game.p1.pick("five");
    await game.settle();
    expect(game.zoneOf("five")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // only the ability's own cost
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with the same Pawn at its printed 2 Might the cap is 3 — only the 1- and 3-Might units are offered", async () => {
    const game = await activate(2);
    expect(offered(game.decision())).toEqual(["one", "three"]);
  });

  test("contrast: a Pawn debuffed below its printed Might lowers the cap too (current 1 ⇒ cap 2)", async () => {
    const game = await activate(1);
    expect(offered(game.decision())).toEqual(["one"]);
  });
});
