/**
 * Ruling f8807e2aca125542 — Acceptable Losses (OGN-179 → ogn-179-298) · [Action] · Chaos · [1][chaos]
 *     "Each player kills one of their gear."
 *   × Darius, Executioner (OGN-243 → ogn-243-298) · "[Legion] — When you play me, ready me."
 *   Plain vanilla gear ("Trinket") stands in for whatever gear is on the board.
 *
 * Q: Can Acceptable Losses be played when only one player — or neither player — has gear?
 * A: Yes, always. It names no gear as a target: each player kills one of THEIR gear on resolution, and a
 *    player with none simply does nothing. Casting it with no gear anywhere is still a card played this
 *    turn (it can switch [Legion] on).
 * Rules: 422.1.a (each player picks among their own), 355.10.d / 426.1.c (no target ⇒ no targeting gate),
 *        812.1.b.1 / 812.1.c ([Legion] = "you have played another card this turn").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const DARIUS_EXECUTIONER = "ogn-243-298";

/** P1's turn, P1 holding Acceptable Losses with [1][chaos]; `gear` says who has a Trinket on the board. */
function board(gear: "none" | "p1" | "p2" | "both") {
  const s = scenario()
    .resources(P1, { energy: 1, power: { chaos: 1 } })
    .hand(P1, ACCEPTABLE_LOSSES, "losses");
  if (gear === "p1" || gear === "both") {
    s.gear(P1, { cardType: "gear", name: "Trinket" }, "myTrinket");
  }
  if (gear === "p2" || gear === "both") {
    s.gear(P2, { cardType: "gear", name: "Trinket" }, "theirTrinket");
  }
  return s;
}

describe("Ruling f8807e2aca125542 — Acceptable Losses is playable with any amount of gear on the board, including none", () => {
  test("no gear anywhere: the spell is offered, casts, and resolves to the trash with nothing killed", async () => {
    const game = await board("none").build();
    expect(game.p1.can("cast", "losses")).toBe(true);
    await game.p1.cast("losses");
    await game.settle();
    expect(game.zoneOf("losses")).toBe("trash");
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("only the OPPONENT has gear: still legal — their Trinket dies, the caster loses nothing", async () => {
    const game = await board("p2").build();
    expect(game.p1.can("cast", "losses")).toBe(true);
    await game.p1.cast("losses");
    await game.settle();
    expect(game.zoneOf("theirTrinket")).toBe("trash");
    expect(game.p1.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("only the CASTER has gear: still legal — the caster's own Trinket is the one that dies", async () => {
    const game = await board("p1").build();
    expect(game.p1.can("cast", "losses")).toBe(true);
    await game.p1.cast("losses");
    await game.settle();
    expect(game.zoneOf("myTrinket")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
  });

  test("both players have gear: each loses one of their own", async () => {
    const game = await board("both").build();
    await game.p1.cast("losses");
    await game.settle();
    expect(game.zoneOf("myTrinket")).toBe("trash");
    expect(game.zoneOf("theirTrinket")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: cast with no gear at all it is still 'a card played this turn' — Darius' [Legion] is on and he enters ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { chaos: 1, order: 1 } })
      .hand(P1, ACCEPTABLE_LOSSES, "losses")
      .hand(P1, DARIUS_EXECUTIONER, "darius")
      .build();
    await game.p1.cast("losses");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    expect(game.p1.units("base")).toContain("darius");
    expect(game.state("darius").isReady).toBe(true); // [Legion] satisfied by Acceptable Losses
    expect(game.violations()).toEqual([]);
  });
});
