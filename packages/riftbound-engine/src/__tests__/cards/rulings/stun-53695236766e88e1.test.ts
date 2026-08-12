/**
 * Ruling 53695236766e88e1 — (general combat with a stunned defender; no specific card)
 *   Vanilla stand-ins only: my Rusher (4) attacks a battlefield the opponent holds with a STUNNED Sentinel (5).
 *
 * Q: What happens when a 4-Might unit is sent to a battlefield holding a stunned 5-Might unit?
 * A: The attacker assigns its 4 to the stunned defender — not lethal against 5 — and the stunned defender
 *    assigns nothing back. Units of both players are still there at the end, so the attackers are Recalled to
 *    base. Recall is not a move and cannot be reacted to.
 * Rules: 423.1.b (a stunned unit deals no combat damage), 465.2.c.2 (lethal = damage ≥ Might),
 *        466.1.a.1-2 (Combat Cleanup heals, then recalls attackers when defenders remain), 466.3.d (No Result).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn. P2 holds bf1 with a stunned Sentinel of `might`. P1's Rusher (4) waits in base. */
function board(might: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might, name: "Sentinel" }, "sentinel", { stunned: true })
    .unit(P1, "base", { might: 4, name: "Rusher" }, "rusher");
}

async function attack(might: number): Promise<Game> {
  const game = await board(might).build();
  expect(game.state("sentinel").isStunned).toBe(true);
  await game.p1.move("rusher", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("open"); // the whole combat, including the Recall, ran without a reaction window
  return game;
}

describe("Ruling 53695236766e88e1 — 4 Might into a stunned 5: 4 damage assigned, nobody dies, the attacker is Recalled", () => {
  test("the stunned 5-Might Sentinel survives the 4 damage (healed in the Combat Cleanup) and deals none back — the Rusher is unharmed", async () => {
    const game = await attack(5);
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1");
    expect(game.state("sentinel").damage).toBe(0); // 4 < 5, then healed at 466.1.a.1
    expect(game.state("rusher").damage).toBe(0); // 423.1.b: the stunned defender assigned nothing
  });

  test("units of both players remain ⇒ No Result: the attacker is Recalled to base, the defender keeps the battlefield and nobody scores", async () => {
    const game = await attack(5);
    expect(game.locationOf("rusher")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the Recall is not a move and offers no reaction window: after it, play is back in P1's open main phase with an empty chain", async () => {
    const game = await attack(5);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("control facet — the 4 damage really is assigned: against a stunned 4-Might Sentinel the same attack is lethal, and the Rusher conquers the battlefield for a point", async () => {
    const game = await attack(4);
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.locationOf("rusher")).toBe("bf1"); // no defenders left: no recall
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
