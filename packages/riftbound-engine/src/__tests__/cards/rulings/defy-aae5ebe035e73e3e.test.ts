/**
 * Ruling aae5ebe035e73e3e — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] · "Counter a spell that costs no more than
 *     [4] and no more than [rainbow]."
 *   × Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3] · "As you play this, you may spend a buff as an additional
 *     cost. If you do, ignore this spell's cost. Give a unit +3 [Might] this turn."
 *
 * Q: Can Defy counter a Call to Glory that was played by spending a buff (Energy cost ignored)?
 * A: Yes. Defy checks the spell's PRINTED cost — [3] and no Power — which is within "no more than [4] / [rainbow]".
 *    Paying with the buff only changes what was paid for that cast, not the card's cost, so Call to Glory stays a legal
 *    Defy target and is countered (no +3).
 * Rules: 206 (a card's cost is its printed cost), 356 (additional / alternative payment doesn't alter cost), 412 / 425
 *        (counter: the spell leaves the chain unresolved → trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const CALL_TO_GLORY = "ogn-207-298";

/** P1's turn. P1: a BUFFED Veteran (3 + 1 = 4) in base, Call to Glory in hand and NO energy — it can only be cast by spending the buff. P2: Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 0 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", { might: 3, name: "Veteran" }, "vet", { buffed: true })
    .hand(P1, CALL_TO_GLORY, "glory")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Call to Glory on the Veteran paying with its buff; passes. */
async function gloryByBuff(): Promise<Game> {
  const game = await board().build();
  expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 4 });
  expect(game.p1.can("cast", "glory")).toBe(true);
  await game.p1.cast("glory", { payOptional: true, targets: "vet" });
  expect(game.p1.energy()).toBe(0); // nothing to pay with — the [3] was ignored
  expect(game.state("vet").isBuffed).toBe(false); // the buff was spent as the additional cost
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glory", controller: P1, targets: ["vet"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling aae5ebe035e73e3e — Defy counters a buff-paid Call to Glory (printed cost [3], no Power)", () => {
  test("the card's cost is still its printed [3] / no Power even though this cast was paid with a buff", async () => {
    const game = await gloryByBuff();
    expect(game.state("glory")).toMatchObject({ energyCost: 3, powerCost: [] });
  });

  test("Defy (≤ [4], ≤ [rainbow]) is offered the buff-paid Call to Glory as a legal target", async () => {
    const game = await gloryByBuff();
    expect(game.p2.can("cast", "defy")).toBe(true);
    const targets = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["glory"]);
  });

  test("Defy resolves first and counters it: Call to Glory goes to the trash unresolved — the Veteran gets NO +3 (and its buff is gone: 3 Might)", async () => {
    const game = await gloryByBuff();
    await game.p2.cast("defy", { targets: "glory" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["glory", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("glory")).toBe("trash");
    expect(game.state("vet")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("control: un-Defied, the buff-paid Call to Glory resolves — Veteran 3 + 3 = 6", async () => {
    const game = await gloryByBuff();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("vet").might).toBe(6);
  });
});
