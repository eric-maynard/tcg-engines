/**
 * Ruling 78afac88e9adaaf4 — Stellacorn Herder (SFD-048 → sfd-048-221) · 4 · 3 Might "When I move, draw 1."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · 1 "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: I move Stellacorn Herder to a battlefield. Does my opponent get a window to Gust it before the move trigger resolves?
 * A: Yes. The move itself is instantaneous and can't be reacted to, but "When I move, draw 1" goes on the chain (Closed state),
 *    so the opponent may play Gust (a Reaction) on top. LIFO: Gust resolves first and returns the Herder to hand; then the draw
 *    trigger still resolves normally even though its source has left the board — I draw 1.
 * Rules: 441.3 (moves are instantaneous), 376–378 (triggered ability → chain), 330 (Closed state), 340 (LIFO), 359 (an ability
 *        on the chain resolves independently of its source).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STELLACORN_HERDER = "sfd-048-221";
const GUST = "ogn-169-298";

/** P1's turn. bf1 open. P1: Herder in base, known deck top d1, d2. P2: Gust + [1]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", STELLACORN_HERDER, "herder")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

/** Herder moves to bf1; its trigger is on the chain; P1 passes priority so P2 may respond. */
async function herderMoves(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("herder", "bf1");
  // The move already happened (instantaneous) …
  expect(game.locationOf("herder")).toBe("bf1");
  // … and only its "When I move" trigger is on the chain; nothing drawn yet.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", controller: P1, triggered: true })]);
  expect(game.p1.hand()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 78afac88e9adaaf4 — Gust in response to Stellacorn Herder's move trigger: Herder bounced, draw still happens", () => {
  test("the window exists: with the move trigger on the chain P2 may cast Gust (Reaction) on the 3-Might Herder; it goes on top of the trigger", async () => {
    const game = await herderMoves();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "herder" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`)).toEqual(["herder*", "gust"]);
  });

  test("LIFO: Gust resolves first — the Herder is back in P1's hand while its draw trigger is still on the chain (no card drawn yet)", async () => {
    const game = await herderMoves();
    await game.p2.cast("gust", { targets: "herder" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("herder")).toBe("hand");
    expect(game.p1.hand()).toEqual(["herder"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", triggered: true })]);
    expect(game.p1.deck()[0]).toBe("d1");
  });

  test("then the 'draw 1' trigger resolves anyway (its source leaving the board doesn't matter): P1 draws d1", async () => {
    const game = await herderMoves();
    await game.p2.cast("gust", { targets: "herder" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("herder")).toBe("hand");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "herder"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the trigger just resolves — Herder stays at bf1 and P1 draws 1", async () => {
    const game = await herderMoves();
    await game.p2.passPriority();
    await game.settle();
    expect(game.locationOf("herder")).toBe("bf1");
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
