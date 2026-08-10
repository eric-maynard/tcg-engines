/**
 * Ruling 56c5a8f6d6a70ad5 — Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · Body · [2] · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *   × Vi, Peacekeeper (UNL-176 → unl-176-219) · 5 Might · [Ambush] · "When I attack, [Stun] an enemy unit here."
 *
 * Q: On my turn I move Faefolk from base to a battlefield I control and use it to drag the enemy Vi, Peacekeeper
 *    there — does Vi get to stun, and why?
 * A: Yes. Vi arriving at a battlefield I control starts a combat in which HER controller is the Attacker; joining
 *    it she gains the Attacker designation, which satisfies "When I attack". Her trigger goes on the chain and, as
 *    long as she is still there on resolution, her controller stuns an enemy (i.e. one of my) units there.
 * Rules: combat designations (units of the non-controlling player at a controlled battlefield attack),
 *        383 ("When I attack" fires on gaining the designation), 423 (Stun).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRRESISTIBLE_FAEFOLK = "unl-112-219";
const VI_PEACEKEEPER = "unl-176-219";

/** P1's turn. P1 controls bf1 with a 3-Might Guard; Faefolk in P1's base; P2's Vi, Peacekeeper in P2's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", IRRESISTIBLE_FAEFOLK, "faefolk")
    .unit(P2, "base", VI_PEACEKEEPER, "vi");
}

/** Faefolk → bf1; P1 opts in and chooses Vi; the trigger resolves and Vi lands at bf1. */
async function dragViIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("faefolk", "bf1");
  // 1. Faefolk's "you MAY move an enemy unit" — P1's opt-in, then P1's choice.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("vi");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.locationOf("vi")).toBe("bf1");
  return game;
}

describe("Ruling 56c5a8f6d6a70ad5 — an enemy Vi dragged in by Faefolk attacks, so her stun trigger fires", () => {
  test("2–4. Vi's arrival at P1's bf1 opens a COMBAT there with P2 as the attacking player: Vi is an Attacker, Guard and Faefolk are Defenders", async () => {
    const game = await dragViIn();
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("faefolk").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("5–6. gaining Attacker fires 'When I attack': Vi's trigger (controlled by P2) is on the chain and P2 chooses which enemy-to-Vi unit here — Guard or Faefolk — to stun; it resolves and that unit is Stunned", async () => {
    const game = await dragViIn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P2, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["faefolk", "guard"]); // "enemy unit here" from P2's side = P1's units at bf1
    await game.p2.pick("guard");
    expect(game.state("guard").isStunned).toBe(false); // pending
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.state("faefolk").isStunned).toBe(false);
    expect(game.locationOf("vi")).toBe("bf1"); // still "here" when it resolved
  });

  test("timing: the trigger fired exactly once — after it resolves the chain is empty and the showdown simply continues (P2, the attacker, holds Focus); the stunned Guard then deals no combat damage, so Vi (5) survives 1 from Faefolk and conquers", async () => {
    const game = await dragViIn();
    await game.p2.pick("guard");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("vi")).toBe("battlefield-bf1");
    expect(game.state("vi").damage).toBe(0); // took only Faefolk's 1 (Guard stunned), healed at cleanup
    expect(game.zoneOf("guard")).toBe("trash"); // 5 damage split kills the defenders
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
