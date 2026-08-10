/**
 * Ruling c6e237431d023952 — Star-Crossed (UNL-128 → unl-128-219) · Reaction · Chaos · [3][chaos]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Leona, Determined (OGN-238 → ogn-238-298) · Unit · Order · [4][order] · 4 Might · [Shield]
 *   "When I attack, stun an enemy unit here."
 *
 * Q: If I Star-Crossed a Leona, Determined in response to her attack trigger, is my unit still stunned?
 * A: No. Star-Crossed resolves first and returns Leona to hand; when her trigger then resolves, "here" is
 *    checked against Leona's current location — she is no longer on the board, so the location is null and
 *    the stun does nothing.
 * Rules: 383 (triggered abilities), LIFO chain resolution, "here" evaluated from the source on resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const LEONA_DETERMINED = "ogn-238-298";

/**
 * P2's turn. P1 holds bf1 with Mine (5) and has a Spare (1) in base to give up to Star-Crossed; P1 has exactly
 * [3][chaos]. P2's Leona, Determined is ready in base.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Mine" }, "mine")
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .unit(P2, "base", LEONA_DETERMINED, "leona")
    .hand(P1, STAR_CROSSED, "sc");
}

/** Leona attacks bf1; her trigger (→ Mine) is on the chain; P2 passes; P1 answers with Star-Crossed [Spare, Leona]. */
async function leonaAttacksP1StarCrosses(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("leona", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("mine"); // the only enemy unit here
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", controller: P2, targets: ["mine"], triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "sc")).toBe(true);
  await game.p1.cast("sc", { targets: ["spare", "leona"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["leona", "sc"]);
  return game;
}

describe("Ruling c6e237431d023952 — Star-Crossed bouncing Leona, Determined blanks her 'stun an enemy unit here'", () => {
  test("Star-Crossed is a legal response to Leona's attack trigger and resolves first (LIFO): Spare → P1's hand, Leona → P2's hand, her trigger still waiting", async () => {
    const game = await leonaAttacksP1StarCrosses();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("hand");
    expect(game.p1.hand()).toContain("spare");
    expect(game.zoneOf("leona")).toBe("hand");
    expect(game.p2.hand()).toContain("leona");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", triggered: true })]);
    expect(game.state("mine").isStunned).toBe(false); // nothing has resolved against Mine yet
  });

  test("then Leona's trigger resolves with Leona in hand: 'here' is null, so Mine is NOT stunned", async () => {
    const game = await leonaAttacksP1StarCrosses();
    await game.settle(); // Star-Crossed, then Leona's trigger, then the (now attacker-less) showdown winds down
    expect(game.zoneOf("leona")).toBe("hand");
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("mine").isStunned).toBe(false);
  });

  test("contrast — no Star-Crossed: Leona's trigger resolves with her still 'here' and Mine IS stunned", async () => {
    const game = await board().build();
    await game.p2.move("leona", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("mine");
    }
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("leona")).toBe("battlefield-bf1");
    expect(game.state("mine").isStunned).toBe(true);
  });
});
