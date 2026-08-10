/**
 * Ruling b0e7e32d9eed3e4c — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Action · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Disintegrate (OGN-005 → ogn-005-298) · Spell · Fury · [4] · Action · "Deal 3 to a unit at a battlefield. If this kills it, draw 1."
 *
 * Q: Can an Action card be played in response to another Action card, or only Reactions?
 * A: Only Reactions can be chained onto a pending card. Actions need normal (empty-chain) timing. Nuance: a HIDDEN card gains
 *    [Reaction] while face down, so a Hidden Blade that is already hidden could be flipped in response — but Hidden Blade cannot be
 *    cast as an Action from HAND while Disintegrate is waiting to resolve.
 * Rules: 336–338 (closed state: Reactions only), 811.6 (face-down cards have [Reaction]), 811.1.c–d (play from hidden for [0], "here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const DISINTEGRATE = "ogn-005-298";

/**
 * P1's turn 3. P2 holds bf1 with Target (3) and Pawn (1); P2 has one Hidden Blade IN HAND (with [2][order] to spare) and another
 * already FACE DOWN at bf1 from an earlier turn. P1 has Disintegrate with exactly [4]. Deck tops known.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
    .unit(P2, "bf1", { might: 1, name: "Pawn" }, "pawn")
    .facedown(P2, "bf1", HIDDEN_BLADE, "hiddenBlade")
    .hand(P2, HIDDEN_BLADE, "handBlade")
    .hand(P1, DISINTEGRATE, "dis")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["p1d1", "p1d2"])
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["p2d1", "p2d2", "p2d3"]);
}

/** P1 Disintegrates the Target and passes priority to P2. */
async function disintegratePending(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("dis", { targets: "target" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dis", controller: P1, targets: ["target"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling b0e7e32d9eed3e4c — only Reactions answer a pending Action; a face-down Hidden Blade qualifies, one in hand does not", () => {
  test("with Disintegrate on the chain, P2 (holding priority and [2][order]) can NOT cast the Hidden Blade from hand — it is an Action; forcing it fails, chain unchanged", async () => {
    const game = await disintegratePending();
    expect(game.p2.can("cast", "handBlade")).toBe(false);
    const r = await game.p2.try((p) => p.cast("handBlade", { targets: "pawn" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis"]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { order: 1 } });
  });

  test("…but the ALREADY-HIDDEN Hidden Blade at bf1 has [Reaction]: P2 may flip it right now (for [0]) in response, choosing a unit here", async () => {
    const game = await disintegratePending();
    expect(game.p2.can("reveal", "hiddenBlade")).toBe(true);
    await game.p2.reveal("hiddenBlade", { answers: ["pawn"] });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { order: 1 } }); // free from face down
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["dis", P1],
      ["hiddenBlade", P2],
    ]);
    expect(game.chain()[1]?.targets).toEqual(["pawn"]);
  });

  test("it resolves first (LIFO): the Pawn dies and its controller P2 draws 2; then Disintegrate resolves on the Target (3 damage kills a 3-Might unit → P1 draws 1)", async () => {
    const game = await disintegratePending();
    await game.p2.reveal("hiddenBlade", { answers: ["pawn"] });
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p2.hand().toSorted()).toEqual(["handBlade", "p2d1", "p2d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis"]);
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.p1.hand()).toEqual(["p1d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("no response at all: Disintegrate simply resolves; and even afterwards, on P1's turn outside a showdown, P2's in-hand Hidden Blade (Action) is still not castable — Actions need your own turn or a showdown", async () => {
    const game = await disintegratePending();
    await game.p2.passPriority();
    await game.settle(); // Disintegrate (and its "if this kills it: draw 1" follow-up) finish
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.p1.hand()).toEqual(["p1d1"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "handBlade")).toBe(false);
    // On P2's own turn (empty chain, main phase, the Pawn still at bf1) it is an ordinary legal Action.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2, power: { order: 1 } });
    expect(game.locationOf("pawn")).toBe("bf1");
    expect(game.p2.can("cast", "handBlade")).toBe(true);
  });
});
