/**
 * Ruling b501e96a8a41b69b — Back to Back (OGN-206 → ogn-206-298) · [Reaction] · Order · [3]
 *     "Give two friendly units each +2 [Might] this turn."
 *   × Gust (OGN-169 → ogn-169-298) · [Reaction] · Chaos · [1] "Return a unit at a battlefield with 3 [Might]
 *     or less to its owner's hand."
 *
 * Q: Can you play several reaction cards back-to-back before passing priority to the opponent?
 * A: Yes. After an item goes on the chain you hold priority; playing a reaction does not hand priority over, so
 *    you may immediately play a second one. Priority only moves when you choose to pass. If the opponent then
 *    does nothing, the reactions resolve newest-first (reverse order).
 * Rules: 340.1/340.3 (the player who put the item on the chain keeps priority), 341 (a chain resolves
 *        last-in-first-out), 344.2 ([Reaction] speed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_TO_BACK = "ogn-206-298";
const GUST = "ogn-169-298";
/** A plain slow spell whose only job is to open a chain that the reactions can sit on top of. */
const PONDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Ponder",
  timing: "standard",
} as const;

/**
 * P1's turn 3 with [5] and [order]/[chaos] to spare. P1 has two units at bf1 (which P1 holds); P2 has a
 * 2-Might Scamp at bf1 — a legal Gust target.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 6, power: { chaos: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Vanguard" }, "vanguard")
    .unit(P1, "bf1", { might: 3, name: "Shieldmate" }, "shieldmate")
    .unit(P2, "bf1", { might: 2, name: "Scamp" }, "scamp")
    .hand(P1, PONDER, "ponder")
    .hand(P1, BACK_TO_BACK, "btb")
    .hand(P1, GUST, "gust");
}

/** Open a chain on P1's own turn: Ponder goes on the chain and P1 keeps priority. */
async function openChain(game: Game): Promise<void> {
  await game.p1.cast("ponder");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ponder"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling b501e96a8a41b69b — reactions can be played back-to-back: playing one does not pass priority", () => {
  test("with Ponder on the chain P1 still holds priority, plays Back to Back — and STILL holds priority", async () => {
    const game = await board().build();
    await openChain(game);
    await game.p1.cast("btb", { targets: ["vanguard", "shieldmate"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ponder", "btb"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("…so P1 immediately plays a SECOND reaction (Gust) without P2 ever getting a window: three items, priority still P1", async () => {
    const game = await board().build();
    await openChain(game);
    await game.p1.cast("btb", { targets: ["vanguard", "shieldmate"] });
    await game.p1.cast("gust", { targets: "scamp" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ponder", "btb", "gust"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("scamp")).toBe("battlefield-bf1"); // nothing has resolved yet
    expect(game.state("vanguard").might).toBe(3);
  });

  test("priority passes only when P1 chooses to pass — then it is P2's window, and P2 doing nothing resolves the newest item first (Gust)", async () => {
    const game = await board().build();
    await openChain(game);
    await game.p1.cast("btb", { targets: ["vanguard", "shieldmate"] });
    await game.p1.cast("gust", { targets: "scamp" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.zoneOf("scamp")).toBe("hand"); // Gust, the last played, resolved first
    expect(game.state("vanguard").might).toBe(3); // Back to Back has NOT resolved yet
    expect(game.chain().map((c) => c.cardId)).toEqual(["ponder", "btb"]);
  });

  test("after each resolution P1 gets another window; passing through resolves Back to Back next, then Ponder — reverse order all the way down", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await openChain(game);
    await game.p1.cast("btb", { targets: ["vanguard", "shieldmate"] });
    await game.p1.cast("gust", { targets: "scamp" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("vanguard").might).toBe(5);
    expect(game.state("shieldmate").might).toBe(5);
    // hand: -3 cast, +1 Gust bounce is P2's card (not P1's), +1 Ponder draw
    expect(game.p1.hand()).toHaveLength(hand0 - 3 + 1);
    expect(game.zoneOf("ponder")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
