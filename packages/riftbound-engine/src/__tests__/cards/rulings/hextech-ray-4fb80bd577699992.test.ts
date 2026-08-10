/**
 * Ruling 4fb80bd577699992 — Hextech Ray (OGN-009 → ogn-009-298) · ACTION · [1][fury] · "Deal 3 to a unit at a battlefield."
 *   × Rebuke (OGN-172 → ogn-172-298) · ACTION · [2][chaos][chaos] · "Return a unit at a battlefield to its owner's hand."
 *
 * Q: Opponent's 6-Might unit at their battlefield already took a Hextech Ray (3). I move in; after I pass Focus the opponent
 *    Rebukes my unit. Once that resolves, do I get a window to cast another (Action-speed) Hextech Ray to finish the unit?
 * A: Yes. Rebuke opens a chain (Closed — no Actions in response); when it resolves the chain is empty, the state is Open
 *    again and the showdown continues until both pass Focus, so you may play your Action then (Focus comes back to you),
 *    even though your unit was bounced.
 * Rules: 341–347 (showdown: Focus alternates, ends only when all pass in an Open state), 145 / Action timing, FAQ #1046.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const REBUKE = "ogn-172-298";

/** P1's turn: two Rays with exactly 2×([1][fury]); Raider (3) in base. P2: Brute (6) at P2's bf1, Rebuke with [2][chaos][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, HEXTECH_RAY, "ray1")
    .hand(P1, HEXTECH_RAY, "ray2")
    .hand(P2, REBUKE, "rebuke");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** First Ray on the Brute (3 damage), Raider moves in, P1 passes Focus, P2 Rebukes the Raider. Returns with Rebuke on the chain. */
async function upToRebuke(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray1", { targets: "brute" });
  await game.settle();
  expect(game.state("brute").damage).toBe(3);
  await game.p1.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, focusPlayer: P1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Open, P1 has Focus
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("rebuke", { targets: "raider" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P2, targets: ["raider"] })]);
  return game;
}

describe("Ruling 4fb80bd577699992 — after the opponent's Rebuke resolves mid-showdown, the attacker can still cast an Action (Hextech Ray)", () => {
  test("while Rebuke is on the chain the state is Closed: P1 gets priority but the Action-speed Ray is NOT playable in response", async () => {
    const game = await upToRebuke();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ray2")).toBe(false);
    const r = await game.p1.try((p) => p.cast("ray2", { targets: "brute" }));
    expect(r.ok).toBe(false);
  });

  test("Rebuke resolves (Raider → P1's hand); the chain is empty, the showdown is STILL open and Focus is P1's — now Hextech Ray is legal, and it finishes the Brute (3 + 3 = 6)", async () => {
    const game = await upToRebuke();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Rebuke resolves
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.p1.hand()).toContain("raider");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 }); // not over: nobody has passed in the Open state yet
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ray2")).toBe(true);
    await game.p1.cast("ray2", { targets: "brute" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ray resolves
    expect(game.zoneOf("brute")).toBe("trash");
    await game.settle(); // both pass Focus → the (now empty) combat wraps up
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
