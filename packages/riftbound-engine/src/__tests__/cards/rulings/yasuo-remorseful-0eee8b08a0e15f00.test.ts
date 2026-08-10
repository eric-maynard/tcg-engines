/**
 * Ruling 0eee8b08a0e15f00 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · Calm · [6] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Confront (ogn-129-298) · Action · [2] "Units you play this turn enter ready. Draw 1." — the opponent's ACTION.
 *   × Cannon Barrage (ogn-127-298) · Reaction · [2][body] "Deal 2 to all enemy units in combat." — the opponent's REACTION.
 *
 * Q: When Yasuo attacks, can the opponent play Actions before taking his attack-trigger damage, or does the showdown only
 *    open up after the attack/defend triggers?
 * A: The showdown starts with an Initial Chain holding Yasuo's "When I attack" trigger. Only Reactions may be played onto
 *    it; Actions are illegal until that chain has fully resolved, the state is Open, and Focus has been awarded (attacker
 *    first). So the opponent cannot Action before the damage lands.
 * Rules: 464.2 (Initial Chain of attack/defend triggers), 336/343 (Closed State: Reactions only), 345–347 (Focus after the
 *        chain empties; Actions need Focus in an Open showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const CONFRONT = "ogn-129-298";
const CANNON_BARRAGE = "ogn-127-298";

/** P1's turn. P2 holds bf1 with an 8-Might Wall and has [4][body] with Confront (Action) + Cannon Barrage (Reaction) in hand. Yasuo ready in P1's base. */
function board() {
  return scenario()
    .resources(P2, { energy: 4, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P2, CONFRONT, "confront")
    .hand(P2, CANNON_BARRAGE, "barrage");
}

/** Yasuo attacks bf1 (the Wall is the only enemy there → target auto-bound); stop at P2's priority on the Initial Chain. */
async function atP2PriorityOnInitialChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) await game.p1.pick("wall");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 0eee8b08a0e15f00 — no Actions for the opponent until Yasuo's Initial Chain has resolved and Focus is out", () => {
  test("the showdown begins WITH the Initial Chain: Yasuo's attack trigger is already a chain item, the Wall is undamaged, and P2's priority there allows the Reaction (Cannon Barrage) but NOT the Action (Confront)", async () => {
    const game = await atP2PriorityOnInitialChain();
    expect(game.state("wall").damage).toBe(0);
    expect(game.p2.can("cast", "barrage")).toBe(true);
    expect(game.p2.can("cast", "confront")).toBe(false);
    const r = await game.p2.try((p) => p.cast("confront"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("confront")).toBe("hand");
    expect(game.p2.energy()).toBe(4);
  });

  test("a Reaction IS fine: Cannon Barrage goes on top of the trigger and resolves first (2 to Yasuo), then the trigger still deals 6 to the Wall", async () => {
    const game = await atP2PriorityOnInitialChain();
    await game.p2.cast("barrage");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "barrage"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Barrage
    expect(game.state("yasuo").damage).toBe(2);
    expect(game.state("wall").damage).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Yasuo's trigger
    expect(game.state("wall").damage).toBe(6);
    expect(game.chain()).toEqual([]);
  });

  test("P2 passes instead: the trigger resolves (Wall takes 6) → only NOW is the state Open with Focus on the ATTACKER (P1) first; P2 still cannot Confront until P1 passes Focus — then it is legal and resolves (P2 draws 1)", async () => {
    const game = await atP2PriorityOnInitialChain();
    await game.p2.passPriority(); // trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("wall")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker gains Focus
    expect(game.p2.can("cast", "confront")).toBe(false); // not P2's Focus yet
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "confront")).toBe(true);
    const hand0 = game.p2.hand().length;
    await game.p2.cast("confront");
    expect(game.p2.energy()).toBe(2);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("confront")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand0 - 1 + 1);
    // and the combat then plays out: Yasuo takes 8 ≥ 6 and dies; the Wall takes 6 (trigger) + 6 (combat) = 12 ≥ 8 and dies too → nobody holds bf1
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
