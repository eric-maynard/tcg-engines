/**
 * Ruling f442e93897345608 — Gust (OGN-169 → ogn-169-298)
 *   "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Traveling Merchant (ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *
 * Q: Does the Merchant's move trigger happen before the showdown, and can opponents react to it?
 * A: Yes. Moving in triggers the Merchant; that trigger goes on the chain and is answered with
 *    priority BEFORE the showdown's action window opens. Opponents may react to it — and if they
 *    remove the Merchant with Gust in response, the discard/draw still happens: the ability is already
 *    on the chain and needs nothing from its source.
 * Rules: 383.2 (the trigger becomes a chain item), 340 (priority on the chain, LIFO), 359.3.e (an
 *        ability on the chain resolves independently of its source card).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const GUST = "ogn-169-298";
const FILLER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MERCHANT, "merchant")
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .hand(P1, FILLER, "spare")
    .hand(P2, GUST, "gust")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

/** Resolve chain items; stop at any non-priority prompt. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling f442e93897345608 — a move trigger is put on the chain and answered before the showdown's action window", () => {
  test("moving in raises the trigger onto the chain and hands out chain PRIORITY — not showdown Focus — first", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p1.hand()).toEqual(["spare"]); // nothing discarded/drawn yet
  });

  test("the opponent may react to the trigger: Gust goes on the chain above it", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "merchant" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);
  });

  test("Gusting the Merchant away does NOT cancel the trigger — the discard and draw still happen", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "merchant" });
    await drainChain(game);
    expect(game.zoneOf("merchant")).toBe("hand"); // bounced in response
    // The trigger is now resolving and still demands the discard.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("spare");
    await game.settle();
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "merchant"]); // discarded 1, drew 1
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the trigger resolves (discard 1, draw 1) and only then does the showdown's Focus window open", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await drainChain(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("spare");
    await game.settle();
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("merchant")).toBe("trash"); // 5-Might Guard kills the 2-Might Merchant in combat
    expect(game.violations()).toEqual([]);
  });
});
