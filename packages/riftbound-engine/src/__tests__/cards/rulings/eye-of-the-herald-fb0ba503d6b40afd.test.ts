/**
 * Ruling fb0ba503d6b40afd — Eye of the Herald (SFD-153 → sfd-153-221) · Equipment · Order · [1] · +0
 *     "[Equip] [order] … When I move, play a 1 [Might] Recruit unit token here."  (Effect Text = the wearer's ability)
 *   × Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Does the Recruit get made if the unit wearing the Eye is Gusted in response to the move trigger?
 * A: No. Move → trigger on the chain → Gust in response → LIFO: Gust returns the unit to hand first; when the trigger
 *    resolves "here" has no board location (the unit is in hand) → the instruction fails, no token is created.
 * Rules: 383 (triggered ability on the chain, LIFO), 359.3.f.2.a (null referent ⇒ instruction ignored), 718.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EYE_OF_THE_HERALD = "sfd-153-221";
const GUST = "ogn-169-298";

/** P1's turn. P1's Squire (2) in base wears the Eye. P2 holds bf1 with a 4-Might Guard and has Gust + [1]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["eye"] } as Record<string, unknown>)
    .card("eye", { def: EYE_OF_THE_HERALD, meta: { attachedTo: "squire" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P2, GUST, "gust");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });

/** 1. Move: the Squire moves into bf1. 2. Trigger: the Eye's move trigger (sourced on the wearer) is on the chain. */
async function squireMoves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("squire").attachments).toEqual(["eye"]);
  await game.p1.move("squire", "bf1");
  expect(game.locationOf("squire")).toBe("bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "squire", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(recruits(game)).toEqual([]);
  return game;
}

/** 3. Reaction: P1 passes, P2 Gusts the Squire in response. */
async function gustInResponse(): Promise<Game> {
  const game = await squireMoves();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "squire" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["squire", "gust"]);
  return game;
}

describe("Ruling fb0ba503d6b40afd — Gusting the Eye's wearer in response to its move trigger: no Recruit", () => {
  test("baseline (no response): the trigger resolves and a 1-Might Recruit token is played 'here' at bf1", async () => {
    const game = await squireMoves();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(recruits(game)).toHaveLength(1);
    expect(game.locationOf(recruits(game)[0]!)).toBe("bf1");
    expect(game.state(recruits(game)[0]!)).toMatchObject({ isToken: true, might: 1 });
  });

  test("4a. LIFO — Gust resolves first: the Squire is back in P1's hand (the Eye falls off into base); the move trigger is still waiting on the chain and no token exists", async () => {
    const game = await gustInResponse();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.p1.hand()).toContain("squire");
    expect(game.state("eye")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "squire", triggered: true })]);
    expect(recruits(game)).toEqual([]);
  });

  test("4b. the trigger then resolves with 'here' = nowhere (its unit is in hand): NO Recruit token is created anywhere; bf1 stays P2's, uncontested", async () => {
    const game = await gustInResponse();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
