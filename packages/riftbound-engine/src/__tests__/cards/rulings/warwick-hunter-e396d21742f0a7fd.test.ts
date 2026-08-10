/**
 * Ruling e396d21742f0a7fd — Warwick, Hunter (OGN-159 → ogn-159-298) · Unit · Body · 6 · 5 Might
 *     "I enter ready. When I attack, kill all damaged enemy units here."
 *   × Cannon Barrage (OGN-127 → ogn-127-298) · [Reaction] · 2 + [body] · "Deal 2 to all enemy units in combat."
 *
 * Q: Does Warwick's "When I attack" interact with Cannon Barrage during combat?
 * A: Yes. The attack trigger goes on the Initial Chain of the showdown; Cannon Barrage (a Reaction) can be played in
 *    response. LIFO: Barrage resolves first and damages the defenders, then Warwick's trigger resolves, sees the now-damaged
 *    enemy units there and kills them.
 * Rules: 464.2.c (attack/defend triggers form the Initial Chain), 336/347 (Reactions on a chain), 331 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const CANNON_BARRAGE = "ogn-127-298";

/** P1's turn: Warwick (5) in base, Cannon Barrage + 2 + [body]. P2 holds bf1 with two undamaged defenders (3 and 4). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", WARWICK, "ww")
    .unit(P2, "bf1", { might: 3, name: "Deckhand" }, "deckhand")
    .unit(P2, "bf1", { might: 4, name: "Bosun" }, "bosun")
    .hand(P1, CANNON_BARRAGE, "barrage");
}

async function warwickAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ww", "bf1");
  expect(game.state("ww").combatRole).toBe("attacker");
  expect(game.state("deckhand").combatRole).toBe("defender");
  expect(game.state("bosun").combatRole).toBe("defender");
  return game;
}

describe("Ruling e396d21742f0a7fd — Cannon Barrage in response to Warwick's attack trigger feeds it damaged units to kill", () => {
  test("Warwick's 'When I attack' sits on the Initial Chain and P1 holds priority; Cannon Barrage (Reaction) is playable in response and lands on top", async () => {
    const game = await warwickAttacks();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "barrage")).toBe(true);
    await game.p1.cast("barrage");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "barrage"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("LIFO: Barrage resolves first — 2 to each enemy unit in combat (both defenders damaged, still alive); Warwick's trigger still waits", async () => {
    const game = await warwickAttacks();
    await game.p1.cast("barrage");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.state("deckhand")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("bosun")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("ww").damage).toBe(0); // "enemy units" only
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", triggered: true })]);
  });

  test("then Warwick's trigger resolves and kills ALL damaged enemy units there — both defenders die before combat damage; Warwick conquers bf1", async () => {
    const game = await warwickAttacks();
    await game.p1.cast("barrage");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("deckhand")).toBe("trash");
    expect(game.zoneOf("bosun")).toBe("trash");
    await game.settle();
    expect(game.state("ww")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Barrage: the trigger resolves with no damaged enemies (kills nothing) and Warwick (5) loses the fight to 3 + 4", async () => {
    const game = await warwickAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("deckhand")).toBe("battlefield-bf1");
    expect(game.zoneOf("bosun")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
