/**
 * Ruling 9bbb3efafbdf9ab4 — Seat of Power (SFD-217 → sfd-217-221) · Battlefield
 *   "When you conquer here, draw 1 for each other battlefield you or allies control."
 *
 * Q: I hold a battlefield with a single [Ganking] unit, then gank it over to Seat of Power. Do I still draw, even though
 *    the battlefield I left is now empty?
 * A: No card. Leaving your original battlefield empty makes you lose control of it at the next Open-State Cleanup
 *    (187.4.c / 323.6); the gank applies Contested at the Seat and a showdown follows (323.8). Winning it establishes
 *    control = a Conquer (464.1), so the Seat's trigger fires — but by then you control no OTHER battlefield → draw 0.
 * Rules: 323.6 (empty battlefield lapses in an Open State), 187.3.a/187.4 (contested → control after the showdown),
 *        464.1 / 469.1 (conquer), 471.2.a ("you … here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SEAT_OF_POWER = "sfd-217-221";

/** P1's turn. P1 holds bfA with a lone Ganking Rider (3); the Seat is empty and uncontrolled; P2 idles at home. */
function board() {
  return scenario()
    .battlefield("bfA", { controller: P1 })
    .battlefield("seat", { controller: null, def: SEAT_OF_POWER, inert: false })
    .unit(P1, "bfA", { keywords: ["Ganking"], might: 3, name: "Lone Rider" }, "rider")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home");
}

async function gankToSeat(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  expect(game.p1.can("gank", "rider")).toBe(true);
  await game.p1.gank("rider", "seat");
  return game;
}

describe("Ruling 9bbb3efafbdf9ab4 — ganking your only holder onto Seat of Power: conquer, but no 'other battlefield' left → no draw", () => {
  test("the gank empties bfA and applies Contested at the Seat: bfA's control has LAPSED (null) while a showdown is open at the Seat with P1 (who applied Contested) holding Focus", async () => {
    const game = await gankToSeat();
    expect(game.locationOf("rider")).toBe("seat");
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.gameState.battlefields.seat).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0); // nothing conquered until the showdown ends
  });

  test("both pass Focus → P1 establishes control of the Seat = a Conquer (+1 point) and the Seat's 'When you conquer here' trigger goes on the chain under P1's control", async () => {
    const game = await gankToSeat();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.seat).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seat", controller: P1, triggered: true })]);
  });

  test("the ruling: when the trigger resolves P1 controls no OTHER battlefield (bfA lapsed) → draws NOTHING; hand size unchanged, back to P1's open main phase", async () => {
    const game = await gankToSeat();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.seat?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfA?.controller).toBe(null);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: had a second unit stayed behind on bfA, P1 would still control it and the same conquer draws exactly 1", async () => {
    const game = await board().unit(P1, "bfA", { might: 2, name: "Stay-Behind" }, "stay").build();
    const hand0 = game.p1.hand().length;
    await game.p1.gank("rider", "seat");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    await game.settle();
    expect(game.gameState.battlefields.seat?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
