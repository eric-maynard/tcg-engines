/**
 * Ruling f024f8422dd7ac54 — Charm (OGN-043 → ogn-043-298) · [1][calm] "Move an enemy unit."
 *
 * Q: I am the turn player and I Charm an enemy unit onto a battlefield I CONTROL. Who is attacker and who is
 *    defender — and if I lose the showdown, does my opponent score for conquering?
 * A: The unit that CONTESTS the battlefield is the attacker, however it got there; control decides who defends.
 *    So the Charmed enemy unit is the attacker and my units defend. If I lose and their unit remains, they
 *    conquer and score.
 * Rules: 462 (attacker = the contesting unit), 190.4 (control), 466.5 (combat resolution ⇒ Conquer + score).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. P1 controls bf1 with a 3-Might Guard standing on it; P2's 6-Might Invader waits in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 6, name: "Invader" }, "invader")
    .hand(P1, CHARM, "charm");
}

/**
 * P1 Charms the Invader onto its own bf1, opening a showdown there. Priority is passed by hand (never `settle()`)
 * so the test can look at the showdown BEFORE combat resolves.
 */
async function charmOntoMyBattlefield(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  await game.p1.cast("charm", { answers: ["bf1"], targets: "invader" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.locationOf("invader")).toBe("bf1");
  expect(game.decision()).toMatchObject({ context: "showdown" });
  return game;
}

describe("Ruling f024f8422dd7ac54 — the contester is the attacker even at a battlefield you control", () => {
  test("the Charmed ENEMY unit is the attacker; P1's own unit defends although P1 controls the battlefield", async () => {
    const game = await charmOntoMyBattlefield();
    expect(game.state("invader").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control is unchanged during the contest
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("P1 loses the showdown: the Invader survives, takes the battlefield, and P2 SCORES for conquering", async () => {
    const game = await charmOntoMyBattlefield();
    const p2Before = game.p2.points();
    expect(p2Before).toBe(0);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("invader")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(p2Before + 1); // conquered on P1's own turn
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a big enough defender keeps the battlefield and nobody conquers", async () => {
    const game = await board()
      .unit(P1, "bf1", { might: 9, name: "Bastion" }, "bastion")
      .build();
    const p2Before = game.p2.points();
    await game.p1.cast("charm", { answers: ["bf1"], targets: "invader" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("invader").combatRole).toBe("attacker"); // still the attacker
    await game.settle();
    expect(game.zoneOf("invader")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(p2Before);
    expect(game.violations()).toEqual([]);
  });
});
