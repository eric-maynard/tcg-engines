/**
 * Ruling 2213c0e8f13f1184 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might
 *     "When I move, discard 1, then draw 1."
 *
 * Q: When does a "When I move" trigger resolve relative to a Showdown/Combat staged by that same move?
 * A: Before it. The move applies Contested and STAGES the showdown, but the trigger is finalized onto the
 *    chain in the same cleanup, so the state is Closed — a showdown may only BEGIN from a Neutral Open
 *    State. The chain resolves first; only when it is empty does the staged showdown open.
 * Rules: 323.11–323.13 (staged showdowns open in cleanup), 401.1 / 310.3 (Open vs Closed State),
 *        383.3 (triggers finalized when queued), 344.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";

/** P1's main phase; P2 holds bf1 with a lone 1-Might Guard. P1's Merchant + a spare card at home. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", might: 1, name: "Spare" }, "spare");
}

/** Merchant makes a standard move into the contested battlefield. */
async function merchantAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("merchant", "bf1");
  return game;
}

describe("Ruling 2213c0e8f13f1184 — a 'When I move' trigger resolves BEFORE the showdown it staged can begin", () => {
  test("right after the move: the trigger is on the chain, the battlefield is Contested, but no showdown is running", async () => {
    const game = await merchantAttacks();
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true, controller: P1 })]);
    expect(game.decision()).toMatchObject({ context: "chain" });
    expect(game.state("merchant").combatRole).toBeFalsy();
    expect(game.state("guard").combatRole).toBeFalsy();
  });

  test("resolving the chain performs the discard-then-draw first", async () => {
    const game = await merchantAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority(); // the trigger resolves → P1's discard prompt
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("spare");
    expect(game.zoneOf("spare")).toBe("trash");
  });

  test("only once the chain is empty does the staged showdown open and hand out roles", async () => {
    const game = await merchantAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("spare");
    expect(game.chain()).toEqual([]);
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown" });
  });

  test("epilogue: the combat then resolves normally — the 2-Might Merchant beats the 1-Might Guard and conquers", async () => {
    const game = await merchantAttacks();
    game.script(P1, ["spare"]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
