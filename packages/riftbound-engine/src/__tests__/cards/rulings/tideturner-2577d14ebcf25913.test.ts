/**
 * Ruling 2577d14ebcf25913 — Tideturner (OGN-199 → ogn-199-298) · 2 Might · "[Hidden] When you play me, you may choose a unit you
 *     control at another location. Move me to its location and it to my original location."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Was there an update on Tideturner "scoring" when you control BOTH battlefields, play Tideturner from hidden at A and swap
 *    units around (with Gust in the mix), ending with only Tideturner at A and another unit at B?
 * A: "No update has been provided regarding this Tideturner scoring interaction." — i.e. nothing special happens; the
 *    baseline rules stand. This file pins that baseline: the swap is a Move between two battlefields you ALREADY control,
 *    so nothing is conquered or scored mid-turn (you can't conquer what you control), control never lapses while each
 *    battlefield keeps a unit of yours, and both are simply HELD (1 point each) at the start of your next turn.
 * Rules: 811.1.d.1/2 (played from Hidden it enters at that battlefield; Tideturner's partner may be anywhere else),
 *        466.5 / 469.1 (conquer = establishing control you did not have), 464.2 (hold at start of turn), 190.4 (control
 *        persists while occupied).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const GUST = "ogn-169-298";

/**
 * P1's turn (turn 3), 0 points. P1 controls BOTH battlefields: bfA with Anchor (3) + Tideturner facedown, bfB with Rover (2).
 * P2: Gust + [1], a 4-Might Lurker in base. P1 has [1] and its own Gust too.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 3, name: "Anchor" }, "anchor")
    .facedown(P1, "bfA", TIDETURNER, "tt")
    .unit(P1, "bfB", { might: 2, name: "Rover" }, "rover")
    .unit(P2, "base", { might: 4, name: "Lurker" }, "lurker")
    .hand(P1, GUST, "gustP1")
    .hand(P2, GUST, "gustP2");
}

/** Reveal Tideturner at bfA, accept the swap with Rover (bfB): Tideturner → bfB, Rover → bfA. */
async function revealAndSwap(): Promise<Game> {
  const game = await board().build();
  await game.p1.reveal("tt");
  expect(game.p1.energy()).toBe(1); // played from hidden for [0]
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you may choose a unit you control at another location"
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("rover");
  }
  expect(game.chain()).toMatchObject([{ cardId: "tt", targets: ["rover"], triggered: true }]);
  await game.settle();
  return game;
}

describe("Ruling 2577d14ebcf25913 — Tideturner swap between two battlefields you already control: no ruling update, baseline = no mid-turn scoring", () => {
  test("Tideturner played from hidden at bfA swaps with Rover at bfB (811.1.d.2: the partner may be at another battlefield): Tideturner ends at bfB, Rover at bfA beside Anchor", async () => {
    const game = await revealAndSwap();
    expect(game.locationOf("tt")).toBe("bfB");
    expect(game.locationOf("rover")).toBe("bfA");
    expect(game.locationOf("anchor")).toBe("bfA");
  });

  test("no scoring interaction: both battlefields were and remain P1's throughout — nothing is conquered, P1 stays on 0 points, no showdown opens", async () => {
    const game = await revealAndSwap();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("with Gust in the mix (P1 Gusts its own Anchor home, leaving ONLY Tideturner… at one battlefield and one other unit at the other): still nothing scored, both battlefields still P1's", async () => {
    const game = await revealAndSwap();
    await game.p1.cast("gustP1", { targets: "anchor" });
    await game.settle();
    expect(game.zoneOf("anchor")).toBe("hand");
    expect(game.p1.units("bfA")).toEqual(["rover"]);
    expect(game.p1.units("bfB")).toEqual(["tt"]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("the points come the ordinary way: each battlefield still occupied by a P1 unit is HELD at the start of P1's next turn (+1 each → 2)", async () => {
    const game = await revealAndSwap();
    await game.advanceTurn(); // → P2
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // → P1: holds bfA and bfB
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });
});
