/**
 * Ruling 3c3595e87fa7d898 — Draven, Audacious (SFD-148 → sfd-148-221) · Unit · 6 Might · [Deflect]
 *   "The first time I win a combat each turn, you score 1 point. When I die in combat, choose an opponent.
 *    They score 1 point."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might (the second attacker).
 *
 * Q: My opponent (on 7 points) attacks with Draven and Irelia and kills all my units, but Draven dies. I am on 6.
 *    Do I score 2 points and win?
 * A: No — you score exactly 1, from Draven's death trigger (6 → 7). You did not Conquer: your opponent still has
 *    Irelia at the battlefield, so they keep control and you never gained it. (Their own Conquer does not win it
 *    either: at 7 points, a Conquer without having scored every battlefield this turn draws a card instead.)
 * Rules: 464.1 / 446.1 (Conquer = gaining control), 448.1.b.2 (final point via Conquer needs every battlefield
 *        scored this turn — otherwise draw a card), 466.5 (control settled at combat resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";
const IRELIA = "sfd-057-221";

/** P2's turn, victory score 8. P2 is on 7, P1 on 6 and holds bf1 with a Bulwark (6) and a Scout (1); bf2 is neutral. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 6)
    .points(P2, 7)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 6, name: "Bulwark" }, "bulwark")
    .unit(P1, "bf1", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "base", DRAVEN, "draven")
    .unit(P2, "base", IRELIA, "irelia");
}

async function bothAttack(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["draven", "irelia"], "bf1");
  expect(game.state("draven").combatRole).toBe("attacker");
  expect(game.state("irelia").combatRole).toBe("attacker");
  return game;
}

describe("Ruling 3c3595e87fa7d898 — Draven's death point is the ONLY point: no Conquer while the attacker still holds the field", () => {
  test("setup: 6 + 1 defending Might against Draven (6) and Irelia (4); P1 is on 6, P2 on 7, victory is 8", async () => {
    const game = await bothAttack();
    expect(game.p1.points()).toBe(6);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.units("bf1").toSorted()).toEqual(["bulwark", "scout"]);
  });

  test("ruling: after combat Draven is dead, Irelia survives at bf1 and both of P1's units are gone", async () => {
    const game = await bothAttack();
    await game.settle();
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("battlefield-bf1");
    expect(game.zoneOf("bulwark")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
  });

  test("ruling: P1 scores exactly ONE point — Draven's death trigger, 6 → 7 — and does not reach 8", async () => {
    const game = await bothAttack();
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("ruling: there is no second point — P2 keeps bf1 (Irelia is still there), so P1 never Conquered it", async () => {
    const game = await bothAttack();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: P2's own Conquer at 7 does not win either — bf2 was not scored this turn, so they draw a card instead of the 8th point", async () => {
    const game = await bothAttack();
    const p2HandBefore = game.p2.hand().length;
    await game.settle();
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand().length).toBe(p2HandBefore + 1);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
