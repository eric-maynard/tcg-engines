/**
 * Solari Shieldbearer — ogn-051-298 · Unit · Calm · 3 energy · 2 might
 *
 *   When you play me, stun a unit. (It doesn't deal combat damage this turn.)
 *
 * Rule 423.1 — Stunned is a binary status; a stunned unit contributes no Might
 * to combat damage (423.1.b) and loses the status at end-of-turn cleanup (423.1.a.2).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-051-298";

function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5 }, "foe")
    .unit(P1, "base", { might: 5 }, "ally")
    .hand(P1, CARD, "solari");
}

/** Play Solari and answer the stun prompt with `target`. */
async function playAndStun(target: string) {
  const game = await board().build();
  await game.p1.play("solari");
  const stop = await game.settle();
  if (stop.reason === "unanswered") {
    await game.p1.pick(target);
    await game.settle();
  }
  return game;
}

describe("Solari Shieldbearer (ogn-051-298)", () => {
  test("costs 3 energy; not playable with 2", async () => {
    const game = await board(3).build();
    await game.p1.play("solari");
    expect(game.p1.energy()).toBe(0);
    const short = await board(2).build();
    expect(short.p1.can("play", "solari")).toBe(false);
  });

  test("on play: the chosen unit (enemy) becomes stunned", async () => {
    const game = await playAndStun("foe");
    expect(game.zoneOf("solari")).toBe("base");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("ally").isStunned).toBe(false);
  });

  test("on play: 'a unit' includes friendly units", async () => {
    const game = await board().build();
    await game.p1.play("solari");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["foe", "ally", "solari"]));
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").isStunned).toBe(true);
  });

  test.failing("BUG: a stunned defender deals no combat damage — 5-might attacker kills it and survives (423.1.b/c)", async () => {
    // Expected: stunned foe contributes 0 to combat damage, so the 5-might ally lives and conquers.
    // Actual: the stun flag is set but combat still deals the foe's 5 damage and the ally dies.
    const game = await playAndStun("foe");
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // still needs full 5 to die — and gets it
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test.failing("BUG: the stun wears off at end of turn (423.1.a.2 / 317.2.c step 3d)", async () => {
    // Expected: after P1's Ending Phase the foe is no longer stunned.
    // Actual: the stunned status persists into P2's turn.
    const game = await playAndStun("foe");
    expect(game.state("foe").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.state("foe").isStunned).toBe(false);
  });
});
