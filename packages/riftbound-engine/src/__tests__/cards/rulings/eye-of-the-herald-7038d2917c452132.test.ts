/**
 * Ruling 7038d2917c452132 — Eye of the Herald (SFD-153 → sfd-153-221) · Equipment · +0 — wearer gains
 *     "When I move, play a 1 [Might] Recruit unit token here."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: My Herald-equipped unit moves into a battlefield; the opponent Gusts it in response to the move trigger. Do I still
 *    get the Recruit?
 * A: No. The trigger is on the chain; Gust resolves first (LIFO) and bounces the unit to hand. When the trigger resolves,
 *    "here" cannot be determined (the unit is no longer on the board) → the instruction does nothing; no token.
 * Rules: 150.2 / 718.3 (Effect Text is the wearer's ability), 359.3.f.2.a (null referent → ignored), 383 (LIFO chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EYE_OF_THE_HERALD = "sfd-153-221";
const GUST = "ogn-169-298";

/** P1's turn. P1's Knight (3) in base wears the Eye; bf1 empty/uncontrolled. P2 holds Gust with [1]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["eye"] } as Record<string, unknown>)
    .card("eye", { def: EYE_OF_THE_HERALD, meta: { attachedTo: "knight" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P2, GUST, "gust");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });

async function knightMoves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("knight").attachments).toEqual(["eye"]);
  await game.p1.move("knight", "bf1");
  // Step 2 of the ruling: the move trigger is on the chain (sourced from the wearer).
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "knight", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 7038d2917c452132 — Gust in response to the Herald move trigger: no Recruit", () => {
  test("control: nobody responds → the trigger resolves and one Recruit token is played at bf1", async () => {
    const game = await knightMoves();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(recruits(game)).toHaveLength(1);
    expect(game.locationOf(recruits(game)[0]!)).toBe("bf1");
  });

  test("P2 Gusts the Knight in response: Gust is legal (Knight is a ≤3 unit at a battlefield) and sits above the trigger on the chain", async () => {
    const game = await knightMoves();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "knight" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["knight", "gust"]);
  });

  test("LIFO: Gust resolves first → Knight returns to P1's hand (Eye falls off); then the trigger resolves with 'here' = null → NO Recruit anywhere", async () => {
    const game = await knightMoves();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "knight" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("knight")).toBe("hand");
    expect(game.p1.hand()).toContain("knight");
    expect(recruits(game)).toEqual([]); // trigger not yet resolved (or resolved to nothing)
    await game.settle(); // the move trigger resolves
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.state("eye").attachedTo).toBeUndefined();
    expect(game.zoneOf("eye")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
