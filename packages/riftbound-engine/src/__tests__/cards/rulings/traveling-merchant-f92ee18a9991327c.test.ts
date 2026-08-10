/**
 * Ruling f92ee18a9991327c — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Gust (OGN-169 → ogn-169-298) · [Reaction] · [1][chaos] · "Return a unit at a battlefield with 3 [Might] or less to
 *   its owner's hand."
 *
 * Q: The Merchant is moved to a battlefield and the opponent responds with Gust. Does the Merchant's effect still trigger?
 * A: Yes. The trigger is already on the chain and resolves regardless — triggers always resolve, sometimes to no effect
 *    (an ability that says "here" whose source went back to hand would resolve and do nothing; the Merchant's doesn't say
 *    "here", so P1 still discards 1 and draws 1).
 * Rules: 383.4 (move triggers), 359 (a chain item resolves independently of its source leaving the board), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const GUST = "ogn-169-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P2 holds bf1 with a 4-Might Guard and has Gust + [1][chaos]. P1: Merchant in base, hand = one Junk card, known deck. */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk")
    .hand(P2, GUST, "gust")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function merchantMovesAndGetsGusted(game: Game): Promise<void> {
  await game.p1.move("merchant", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "merchant" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);
}

describe("Ruling f92ee18a9991327c — Gust in response does not stop the Merchant's move trigger from resolving", () => {
  test("Gust resolves first (LIFO) and returns the Merchant to P1's hand; the move trigger is STILL on the chain", async () => {
    const game = await board().build();
    await merchantMovesAndGetsGusted(game);
    for (let i = 0; i < 4 && game.zoneOf("gust") === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant"]);
    expect(game.p1.hand().toSorted()).toEqual(["junk", "merchant"]); // nothing discarded/drawn yet
  });

  test("the trigger then resolves anyway: P1 discards 1 (asked which) and draws 1, even though the Merchant is no longer on the board", async () => {
    const game = await board().build();
    await merchantMovesAndGetsGusted(game);
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (d as PickD).options.map((o) => o.card ?? o.key);
    expect(offered).toContain("junk");
    await game.p1.pick("junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "merchant"]); // drew d1
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 }); // no combat happened
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
