/**
 * Aphelios, Exalted — sfd-049-221 · Unit · Calm · 4 energy · 4 Might · Champion
 *
 *   When you attach an Equipment to me, choose one that hasn't been chosen
 *   this turn:
 *     - Ready 2 runes.
 *     - Channel 1 rune exhausted.
 *     - Buff a friendly unit.
 *
 * Rule 355.8: a "that hasn't been chosen this turn" modal only offers the modes
 * this card has not already resolved this turn; the restriction resets at end of
 * turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-049-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 2, fury: 2 } })
    .unit(P1, "base", CARD, "aph")
    .gear(P1, DIRK, "dirk");
}

function modeKeys(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.key) : [];
}

describe("Aphelios, Exalted (sfd-049-221)", () => {
  test("attaching an Equipment offers all three modes the first time", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();
    expect(modeKeys(game)).toEqual(["0", "1", "2"]);
    await game.acting().chooseMode(1);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
  });

  test("a mode chosen this turn is no longer offered on a later attach", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();
    await game.acting().chooseMode(1);
    await game.settle();
    expect(game.state("aph").meta.modesChosenThisTurn).toEqual([1]);

    await game.p1.do("unequipCard", { equipmentId: "dirk" });
    await game.settle();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();
    // rule 355.8 — "choose one that hasn't been chosen this turn".
    expect(modeKeys(game)).toEqual(["0", "2"]);
  });
});
