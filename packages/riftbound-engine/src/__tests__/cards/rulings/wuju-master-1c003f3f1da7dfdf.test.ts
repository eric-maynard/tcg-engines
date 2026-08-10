/**
 * Ruling 1c003f3f1da7dfdf — "Master Yi's Legend passive (+2 Might)" × Smoke Screen (OGN-093 → ogn-093-298)
 *   The ruling is filed under Wuju Master (UNL-191 → unl-191-219), but the +2 passive it describes is the Yi legend
 *   Wuju Bladesman "While a friendly unit defends alone, it gets +2 [Might]" — in our pool ogs-019-024.
 *   Smoke Screen: Reaction [2][mind] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: A base-4 unit carrying Smoke Screen's −4 gets Yi's +2 while defending. When combat ends and the +2 stops,
 *    is it 1 (minimum) or 0? And when a new combat starts?
 * A: 0 between combats (4 − 4; the "minimum of 1" only mattered when Smoke Screen resolved and snapshotted its
 *    amount), and 2 when the next combat begins (4 + 2 − 4).
 * Rules: arithmetic layer; floored reductions snapshot on resolution; 464.2.c.3 / static "while defending alone".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WUJU_BLADESMAN = "ogs-019-024";
const SMOKE_SCREEN = "ogn-093-298";

/**
 * P2's turn. P1 (Yi legend) holds bf1 with a lone base-4 Defender. P2 has two 1-Might attackers in base (two
 * separate combats the Defender survives), Smoke Screen in hand and [2] + mind.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Defender" }, "def")
    .unit(P2, "base", { might: 1, name: "Attacker A" }, "a")
    .unit(P2, "base", { might: 1, name: "Attacker B" }, "b")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .resources(P2, { energy: 2, power: { mind: 1 } });
}

/** Attacker A attacks; P2 (focus) Smoke Screens the Defender while Yi's +2 is live; Smoke resolves. */
async function smokeDuringFirstCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("def").might).toBe(4); // no combat: no Yi bonus
  await game.p2.move("a", "bf1");
  expect(game.state("def").combatRole).toBe("defender");
  expect(game.state("def").might).toBe(6); // 4 + 2 (defending alone)
  await game.p2.cast("smoke", { targets: "def" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Smoke Screen resolves
  expect(game.zoneOf("smoke")).toBe("trash");
  return game;
}

describe("Ruling 1c003f3f1da7dfdf — Yi's +2 comes and goes around a snapshotted Smoke Screen −4", () => {
  test("in combat, Smoke Screen resolves against 6 (4 + Yi's 2): the full −4 fits → Defender is 2, modifier −4", async () => {
    const game = await smokeDuringFirstCombat();
    expect(game.state("def").might).toBe(2);
    expect(game.state("def").mightModifier).toBe(-4);
  });

  test("combat ends (Defender survives, Attacker A dies), Yi's +2 stops applying → Defender sits at 0 Might (4 − 4), NOT lifted to 1", async () => {
    const game = await smokeDuringFirstCombat();
    await game.settle(); // both pass focus → combat damage: A (1) dies, Defender takes 1 < 2 and is healed in cleanup
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").combatRole).toBeNull();
    expect(game.state("def").damage).toBe(0);
    expect(game.state("def").mightModifier).toBe(-4); // snapshot unchanged
    expect(game.state("def").might).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("a new combat the same turn (Attacker B moves in): Yi's +2 applies again → Defender is 2 (4 + 2 − 4) and wins that combat too", async () => {
    const game = await smokeDuringFirstCombat();
    await game.settle();
    expect(game.state("def").might).toBe(0);
    await game.p2.move("b", "bf1");
    expect(game.state("def").combatRole).toBe("defender");
    expect(game.state("def").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").might).toBe(0); // between combats again
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
