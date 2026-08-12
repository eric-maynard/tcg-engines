/**
 * Ruling 2b41ef8ccda12eaf — Vi, Peacekeeper (UNL-176 → unl-176-219) · Order · [5][order] · 5 Might
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *      When I attack, [Stun] an enemy unit here."
 *
 * Q: Does Vi stun when she is played from [Ambush] during an already-running showdown?
 * A: Yes. A unit that joins an ongoing combat late is designated on entry — arriving on the attacking side
 *    makes her an attacker, which satisfies "When I attack", so the stun triggers.
 * Rules: 822 ([Ambush]), 464.2.c.3.a (late arrivals get combat designations), 383 (triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI_PEACEKEEPER = "unl-176-219";

/** P1's turn. P2 holds bf1 with a 6-Might Guard; P1's Scout is at home, Vi + [5][order] in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, VI_PEACEKEEPER, "vi");
}

/** The Scout attacks alone; the combat showdown is running when Vi arrives. */
async function showdownRunning(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(game.state("scout").combatRole).toBe("attacker");
  expect(game.state("guard").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ context: "showdown" });
  return game;
}

describe("Ruling 2b41ef8ccda12eaf — Vi played from [Ambush] into a live showdown still triggers her stun", () => {
  test("premise: [Ambush] makes her playable as a Reaction to the battlefield where P1 already has a unit", async () => {
    const game = await showdownRunning();
    expect(game.p1.can("play", "vi")).toBe(true);
  });

  test("ruling: she joins as an ATTACKER and her 'When I attack' goes on the chain", async () => {
    const game = await showdownRunning();
    await game.p1.play("vi", { to: "bf1" });
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", triggered: true, controller: P1 })]);
  });

  test("…and it resolves: the enemy Guard here is stunned", async () => {
    const game = await showdownRunning();
    await game.p1.play("vi", { to: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("control: played into an empty base outside any combat, Vi attacks nobody and stuns nobody", async () => {
    const game = await board().build();
    await game.p1.play("vi");
    await game.settle();
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.state("guard").isStunned).toBe(false);
    expect(game.chain()).toEqual([]);
  });
});
