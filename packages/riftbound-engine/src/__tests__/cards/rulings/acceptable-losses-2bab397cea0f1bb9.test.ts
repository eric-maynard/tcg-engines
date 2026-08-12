/**
 * Ruling 2bab397cea0f1bb9 — Acceptable Losses (OGN-179 → ogn-179-298) · Action · Chaos · [1][chaos]
 *     "Each player kills one of their gear."
 *   × Doran's Shield (sfd-033-221) as the gear each side may control.
 *
 * Q: Do I need my own gear to play Acceptable Losses, or may I play it when only my opponent has gear?
 * A: You need no gear at all. The spell chooses nothing when it is played; at resolution EACH player who
 *    controls gear picks one of theirs to kill, and a player with none simply does nothing.
 * Rules: 355.10 (no target ⇒ no legality requirement on targets), 422.1.a (each player chooses among the
 *        objects they control), 359.3.e.7 (an instruction with nothing to affect does nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const DORANS_SHIELD = "sfd-033-221";

describe("Ruling 2bab397cea0f1bb9 — Acceptable Losses is playable with no gear of your own", () => {
  test("P1 controls NO gear and P2 controls one: the spell is legal for P1, and only P2's gear dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .gear(P2, DORANS_SHIELD, "theirs")
      .hand(P1, ACCEPTABLE_LOSSES, "losses")
      .build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.can("cast", "losses")).toBe(true);
    await game.p1.cast("losses");
    await game.settle();
    expect(game.zoneOf("losses")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("with NEITHER player holding gear it is still castable and simply does nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .hand(P1, ACCEPTABLE_LOSSES, "losses")
      .build();
    expect(game.p1.can("cast", "losses")).toBe(true);
    await game.p1.cast("losses");
    await game.settle();
    expect(game.zoneOf("losses")).toBe("trash");
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
  });

  test("when both sides have gear it is symmetric — each player kills one of their OWN, and P2 picks theirs (never P1's)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .gear(P1, DORANS_SHIELD, "mine")
      .gear(P2, DORANS_SHIELD, "theirs")
      .hand(P1, ACCEPTABLE_LOSSES, "losses")
      .build();
    await game.p1.cast("losses");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
  });
});
