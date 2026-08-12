/**
 * Ruling 3518d477df69b3c5 — Imperial Decree (OGN-221 → ogn-221-298) · Action · [5][order][order]
 *     "When any unit takes damage this turn, kill it."
 *
 * Q: Can I chain 1-Might attackers in one at a time under Imperial Decree, killing big units with a single
 *    point of damage each?
 * A: Yes. The Decree is a delayed trigger hanging on the turn, not tied to any unit: every unit that takes
 *    damage this turn is killed, however little damage it was and whenever it entered play. Sending small
 *    attackers in one at a time therefore kills one big defender per combat.
 *    It does not reach back: a unit already carrying damage from before the Decree resolved is untouched
 *    until it takes NEW damage.
 * Rules: 390.2/383 (a delayed triggered ability created for the turn, fired by the take-damage event),
 *        465.2.c.3 (on defence you must assign lethal in full before spreading, which is why this is an
 *        offensive line), 466 (each combat is resolved separately).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";

/**
 * P1's turn with exactly [5][order][order]. P2 holds bf1 and bf2 with 9-Might Behemoths and has a third,
 * pre-damaged unit sitting at bf3. P1 has two 1-Might Recruits in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Behemoth One" }, "big1")
    .unit(P2, "bf2", { might: 9, name: "Behemoth Two" }, "big2")
    .unit(P2, "bf3", { might: 9, name: "Scarred" }, "scarred", { damage: 3 })
    .unit(P1, "base", { might: 1, name: "Recruit One" }, "t1")
    .unit(P1, "base", { might: 1, name: "Recruit Two" }, "t2")
    .hand(P1, IMPERIAL_DECREE, "decree");
}

/** Cast Imperial Decree and let it resolve. */
async function castDecree(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  return game;
}

describe("Ruling 3518d477df69b3c5 — under Imperial Decree one point of combat damage kills a 9-Might unit, once per combat", () => {
  test("the first 1-Might Recruit attacks bf1: it deals 1, and the Decree kills the Behemoth outright", async () => {
    const game = await castDecree();
    await game.p1.move("t1", "bf1");
    await game.settle();
    expect(game.zoneOf("big1")).toBe("trash"); // 1 damage was never lethal — the Decree was
    expect(game.zoneOf("t1")).toBe("trash"); // and it died to the 9 it took (Decree too)
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("the second Recruit repeats it at the next battlefield — one combat at a time, one dead Behemoth each", async () => {
    const game = await castDecree();
    await game.p1.move("t1", "bf1");
    await game.settle();
    await game.p1.move("t2", "bf2");
    await game.settle();
    expect(game.zoneOf("big2")).toBe("trash");
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.zoneOf("big1")).toBe("trash"); // both Behemoths gone, one per combat
    expect(game.violations()).toEqual([]);
  });

  test("it is not retroactive: the unit that was already carrying 3 damage when the Decree resolved is still alive", async () => {
    const game = await castDecree();
    expect(game.state("scarred")).toMatchObject({ damage: 3, zone: "battlefield-bf3" });
    await game.p1.move("t1", "bf1");
    await game.settle();
    expect(game.zoneOf("scarred")).toBe("battlefield-bf3"); // it took no NEW damage, so the Decree never saw it
  });
});
