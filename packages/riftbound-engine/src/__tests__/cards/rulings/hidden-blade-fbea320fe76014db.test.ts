/**
 * Ruling fbea320fe76014db — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] spell · [2][order]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Does "its controller" mean the controller of the KILLED UNIT or the controller of the battlefield?
 * A: The killed unit's controller — "unit" is the subject of the sentence, "at a battlefield" only describes it.
 *    (If it meant the battlefield's controller the card would be pointless when revealed from Hidden, since the
 *    hider already controls that battlefield.)
 * Rules: 355.10 (targets), 359.3.e (a linked instruction reads back the object the first one chose).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P2 controls bf1 and defends it with a 3-Might unit; P1 has a 2-Might attacker in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "defender")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, HIDDEN_BLADE, "blade")
    .resources(P1, { energy: 2, power: { order: 1 } });
}

/** P1 attacks P2's battlefield, opening a showdown in which P1 holds focus. */
async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  return game;
}

describe("Ruling fbea320fe76014db — Hidden Blade's draw goes to the KILLED UNIT's controller, not the battlefield's", () => {
  test("premise: the battlefield is P2's while the unit that will be killed is P1's — the two readings differ", async () => {
    const game = await attack();
    expect(game.state("raider").controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand()).toEqual(["blade"]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("killing P1's OWN unit at P2's battlefield draws 2 for P1 (the unit's controller) — P2 draws nothing", async () => {
    const game = await attack();
    await game.p1.cast("blade", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2); // Hidden Blade left the hand; 2 drawn
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("killing P2's defender instead draws 2 for P2 — the effect follows the unit, whoever owns the battlefield", async () => {
    const game = await attack();
    await game.p1.cast("blade", { targets: "defender" });
    await game.settle();
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });
});
