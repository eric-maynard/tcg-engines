/**
 * Ruling a06a580c2b2fadd1 — Warwick, Hunter (OGN-159 → ogn-159-298) · 5 Might "I enter ready. When I attack, kill all damaged
 *     enemy units here."
 *   × Relentless Pursuit (SFD-184 → sfd-184-221) [Action] 2+[rainbow] "Move a friendly unit. … This turn, that unit has 'When I
 *     conquer, you may move me to my base.'"
 *   × Flurry of Blades (OGN-133 → ogn-133-298) [Reaction] [1] "Deal 1 to all units at battlefields."
 *
 * Q: Flurry damages units at both battlefields; Warwick attacks battlefield A, then (via Relentless Pursuit) goes on to attack
 *    battlefield B the same turn. Is the earlier damage on B's units still there for his attack trigger?
 * A: No. Combat at A must fully end — including the Combat Cleanup, which heals ALL units everywhere — before a combat at B
 *    can begin. Warwick's ability is an ATTACK trigger (fires when combat starts), so at B it finds the units already healed.
 * Rules: 466.1.a.1 (combat cleanup: heal all units), 143.3.b.2, 383.4.e (attack triggers), 464 (one combat at a time).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const RELENTLESS_PURSUIT = "sfd-184-221";
const FLURRY_OF_BLADES = "ogn-133-298";

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/**
 * P1's turn: Warwick (5) ready in base; Flurry [1] + Relentless Pursuit [2][rainbow] in hand with exactly 3 energy + 1 rainbow.
 * P2 holds bfA with Guard A (3) and bfB with Guard B (6 — survives Warwick's 5 in a straight fight, dies only to his trigger).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfA", { might: 3, name: "Guard A" }, "ga")
    .unit(P2, "bfB", { might: 6, name: "Guard B" }, "gb")
    .unit(P1, "base", WARWICK, "ww")
    .hand(P1, FLURRY_OF_BLADES, "flurry")
    .hand(P1, RELENTLESS_PURSUIT, "pursuit");
}

/** Flurry resolves (both Guards damaged); Relentless Pursuit moves Warwick to bfA; drive combat A to its end, accepting "move me to my base". */
async function combatAtA(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("flurry");
  await game.settle();
  expect(game.state("ga").damage).toBe(1);
  expect(game.state("gb").damage).toBe(1);
  expect(game.state("ww").damage).toBe(0); // in base — not "at a battlefield"
  await game.p1.cast("pursuit", { targets: "ww" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // where to move Warwick
  await game.p1.pick("battlefield-bfA");
  // Pursuit resolves → Warwick arrives at bfA → combat A starts → his ATTACK trigger goes on the chain.
  while (game.chain().some((c) => c.cardId === "pursuit") && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.locationOf("ww")).toBe("bfA");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfA", isCombatShowdown: true });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling a06a580c2b2fadd1 — combat A's cleanup heals everyone before Warwick can attack at B", () => {
  test("combat A: Warwick's attack trigger kills the damaged Guard A; Guard B (at the other battlefield) is still damaged while combat A is running", async () => {
    const game = await combatAtA();
    await game.acting().passPriority();
    await game.acting().passPriority(); // the trigger resolves
    expect(game.zoneOf("ga")).toBe("trash");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfA" }); // combat A not over yet
    expect(game.state("gb").damage).toBe(1);
  });

  test("combat A ends (Warwick conquers A): the Combat Cleanup heals ALL units — Guard B's Flurry damage is gone before anything else happens", async () => {
    const game = await combatAtA();
    // Trigger resolves, then both pass focus → combat A resolves and cleans up.
    for (let i = 0; i < 8 && game.decision()?.kind === "action" && showdown(game)?.battlefieldId === "bfA"; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("gb").damage).toBe(0); // healed by combat A's cleanup
    // Relentless Pursuit's granted "When I conquer, you may move me to my base" is now asked.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ww" } });
  });

  test("Warwick pursues on to B (back to base via Relentless Pursuit, then into bfB): his attack trigger fires again but Guard B is no longer damaged → NOT killed; Warwick (5) falls to the 6-Might Guard", async () => {
    const game = await combatAtA();
    for (let i = 0; i < 8 && game.decision()?.kind === "action" && showdown(game)?.battlefieldId === "bfA"; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("ww")).toBe("base");
    expect(game.state("ww").isReady).toBe(true); // spell moves never exhausted him
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("gb").damage).toBe(0);
    // Second attack this turn.
    await game.p1.move("ww", "bfB");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", triggered: true })]); // it IS an attack trigger: fires again
    await game.acting().passPriority();
    await game.acting().passPriority(); // resolves: "kill all DAMAGED enemy units here" — none
    expect(game.zoneOf("gb")).toBe("battlefield-bfB");
    expect(game.state("gb").damage).toBe(0);
    await game.settle(); // combat: 5 into a 6 — Guard B lives, Warwick dies
    expect(game.zoneOf("gb")).toBe("battlefield-bfB");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
