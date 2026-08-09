/**
 * Aphelios, Exalted — sfd-049-221 · third attach in one turn (one mode left)
 *
 *   When you attach an Equipment to me, choose one that hasn't been chosen
 *   this turn: …
 *
 * Rule 355.8 / 402.2: with two of the three modes already chosen this turn the
 * third attach has exactly ONE legal mode — it is locked in without asking and
 * the chain item still finalizes, so priority can pass and the item resolves.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-049-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment

function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { calm: 6, fury: 6 } })
    .unit(P1, "base", CARD, "aph")
    .gear(P1, DIRK, "dirk");
}

function modeKeys(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.key) : [];
}

describe("Aphelios, Exalted (sfd-049-221) — third attach", () => {
  test("the last remaining mode is locked in and the trigger resolves", async () => {
    const game = await board().build();

    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();
    expect(modeKeys(game)).toEqual(["0", "1", "2"]);
    await game.acting().chooseMode(1);
    await game.settle();

    await game.p1.do("unequipCard", { equipmentId: "dirk" });
    await game.settle();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();
    expect(modeKeys(game)).toEqual(["0", "2"]);
    await game.acting().chooseMode(0);
    await game.settle();

    await game.p1.do("unequipCard", { equipmentId: "dirk" });
    await game.settle();
    // rule 402.2 — a sole legal mode is chosen without a prompt; the item must
    // still finalize so the chain can be passed and resolved.
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();

    expect(game.state("aph").meta.modesChosenThisTurn).toEqual([1, 0, 2]);
    expect(game.chain?.()?.length ?? 0).toBe(0);
  });
});
