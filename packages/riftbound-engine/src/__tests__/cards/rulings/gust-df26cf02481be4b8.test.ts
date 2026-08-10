/**
 * Ruling df26cf02481be4b8 — Gust (OGN-169 → ogn-169-298) · [Reaction] · [1] "Return a unit at a battlefield with 3 [Might] or
 *     less to its owner's hand."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *
 * Q: The Merchant moves and its trigger goes on the chain; the opponent Gusts the Merchant in response. Legal? Does the
 *    Merchant's discard/draw still happen?
 * A: Yes and yes. Gust may be played in reaction to the move trigger and bounces the Merchant (now at a battlefield, 2
 *    Might). The trigger is already on the chain and is not conditional on the Merchant staying in play, so it still
 *    resolves: discard 1, then draw 1.
 * Rules: 383 (triggered ability is an independent chain item once added), 359 (resolution does not require the source
 *        to remain), 339 (Reaction in response), 401.1 (state is Closed while the trigger is pending → showdown only staged).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const TRAVELING_MERCHANT = "ogn-185-298";

/** P1's turn. bf1 uncontrolled and empty. P1: Merchant in base, hand = Junk (a known discard). P2: Gust + exactly [1]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", energyCost: 9, might: 1, name: "Junk" }, "junk")
    .deck(P1, ["ogn-175-298"], ["p1top"])
    .hand(P2, GUST, "gust");
}

async function merchantMoves(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("merchant", "bf1");
  expect(game.locationOf("merchant")).toBe("bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling df26cf02481be4b8 — Gusting the Merchant in response to its own move trigger", () => {
  test("Gust is a legal Reaction to the move trigger: the Merchant (2 Might, now at a battlefield) is offered and returned to P1's hand while its trigger stays on the chain", async () => {
    const game = await merchantMoves();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toContain("merchant");
    await game.p2.cast("gust", { targets: "merchant" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);

    // Gust resolves first (LIFO): Merchant back in its owner's hand; the trigger item is untouched.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("hand");
    expect(game.p1.hand()).toContain("merchant");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
  });

  test("the Merchant's effect still resolves with the Merchant gone: P1 must discard 1 (the returned Merchant is even a legal choice), then draws 1", async () => {
    const game = await merchantMoves();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "merchant" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(new Set(game.p1.hand())).toEqual(new Set(["junk", "merchant"]));
    const deckBefore = game.p1.deck().length;

    // Both pass on the remaining trigger → it resolves: discard prompt for P1.
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["junk", "merchant"]);
    await game.p1.pick("junk");
    await game.settle();

    expect(game.zoneOf("junk")).toBe("trash"); // discarded
    expect(game.p1.deck()).toHaveLength(deckBefore - 1); // drew 1
    expect(new Set(game.p1.hand())).toEqual(new Set(["merchant", "p1top"]));
    expect(game.chain()).toEqual([]);
    // The Merchant never stayed at bf1: no showdown, bf1 still uncontrolled.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
