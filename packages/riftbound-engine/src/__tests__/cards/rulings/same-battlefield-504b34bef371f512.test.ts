/**
 * Ruling 504b34bef371f512 — (a "same battlefield" spell whose second target leaves; no specific card named)
 *   Stand-in: Facebreaker (OGN-220 → ogn-220-298) · [Action] [2] · "Stun a friendly unit and an enemy unit at the
 *   same battlefield." — answered by Gust (OGN-169 → ogn-169-298) · [Reaction] [1] · "Return a unit at a
 *   battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: If one of the two targets is no longer at the battlefield when a "both at the same battlefield" spell
 *    resolves, does the spell still affect the remaining target?
 * A (riftjudge): no — the pairing is said to be an ongoing requirement, so the survivor is untouched.
 * A (Core Rules, what this file asserts): the one instruction still executes on whichever target is still legal;
 *    the target that left is simply dropped and nothing is re-chosen.
 * Rules: 359.3.e.5 (a target that no longer matches its descriptor is dropped at resolution), 359.3.e.8 (one
 *        instruction with two targets still executes on the remaining legal one), 355.15 (no re-targeting).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const GUST = "ogn-169-298";

/** P1's turn. Both a friendly Ally (4) and an enemy Foe (3) stand at bf1; P1 holds Facebreaker, P2 holds Gust. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, FACEBREAKER, "facebreaker")
    .hand(P2, GUST, "gust");
}

/** P1 aims Facebreaker at the pair; P2 Gusts its own Foe off bf1 in response. */
async function foeGustedAway(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("facebreaker", { targets: ["ally", "foe"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["facebreaker"]);
  await game.p1.passPriority();
  await game.p2.cast("gust", { targets: "foe" });
  await game.settle();
  expect(game.zoneOf("foe")).toBe("hand"); // returned to its owner's hand
  return game;
}

describe("Ruling 504b34bef371f512 — one half of a 'same battlefield' pair leaves before resolution", () => {
  test("premise: both units are at bf1 when Facebreaker is played, and the spell takes them as a pair", async () => {
    const game = await board().build();
    await game.p1.cast("facebreaker", { targets: ["ally", "foe"] });
    expect(game.chain()[0]).toMatchObject({ cardId: "facebreaker", targets: ["ally", "foe"] });
  });

  // RULING-CONFLICT: riftjudge 504b34bef371f512 says the spell affects neither unit once one of the pair has left;
  // CR 359.3.e.5 + 359.3.e.8 say the departed target is dropped and the single instruction still executes on the
  // target that is still legal (355.15 forbids re-choosing) — engine follows CR, matching the landed sibling test
  // interactions/facebreaker-facedown-gust-vs-flash-half.test.ts, which cites the same rules for this exact pair.
  test("ruling 504b34bef371f512 (CR-corrected): with the enemy half Gusted away, the Ally that is still at bf1 IS stunned; the unit that left carries nothing", async () => {
    const game = await foeGustedAway();
    expect(game.zoneOf("facebreaker")).toBe("trash");
    expect(game.state("ally").isStunned).toBe(true);
    expect(game.state("foe").isStunned).toBe(false); // a new object in hand
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control facet — undisturbed, the same cast stuns BOTH of them", async () => {
    const game = await board().build();
    await game.p1.cast("facebreaker", { targets: ["ally", "foe"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ally").isStunned).toBe(true);
    expect(game.state("foe").isStunned).toBe(true);
  });
});
