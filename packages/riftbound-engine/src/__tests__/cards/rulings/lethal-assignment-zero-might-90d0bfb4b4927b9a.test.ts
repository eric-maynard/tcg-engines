/**
 * Ruling 90d0bfb4b4927b9a — (no specific card) 4 Might of attackers against a 0-Might and a 4-Might defender.
 *   Stand-ins: plain inline units; the 0-Might body is the one a spell shrank.
 *
 * Q: My 4-Might unit attacks a battlefield where one defender was reduced to 0 Might and the other has 4.
 *    Can I kill both?
 * A: No. Combat damage is assigned unit by unit and a unit must be given lethal damage in full before any
 *    damage goes to the next. Lethal on the 0-Might body is the minimum non-zero amount, 1 — spend it and
 *    only 3 remain, which is short of the 4-Might defender. Kill either one, never both.
 * Rules: 465.2.c.3 (full lethal to one unit before another is assigned any), 465.2.c.4 (no overkill while
 *        another unit still lacks lethal), 142.4 (lethal damage = damage ≥ current Might), 355.10.d.2 /
 *        465.2.c.3 (the assigning player chooses the order whenever more than one assignment is legal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn: a 4-Might Raider attacks bf1, held by a 4-Might Wall and a 0-Might Husk. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
    .unit(P2, "bf1", { might: 0, name: "Husk" }, "husk")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider");
}

/** Attack and let both sides pass Focus so the damage step opens. */
async function atAssignment(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 90d0bfb4b4927b9a — 4 Might cannot cover lethal on a 0-Might body AND a 4-Might body", () => {
  test("the attacker is asked how to split 4, and the buckets state the price: 1 for the 0-Might Husk, 4 for the Wall", async () => {
    const game = await atAssignment();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal])) : {};
    expect(lethal).toEqual({ husk: 1, wall: 4 }); // any non-zero amount is lethal to a 0-Might unit
  });

  test("there is no legal split that kills both — 1+4 is more damage than exists, and 1+3 leaves the Wall short", async () => {
    const game = await atAssignment();
    expect((await game.p1.try((p) => p.distribute({ husk: 1, wall: 4 }))).ok).toBe(false); // 5 > 4
    expect((await game.p1.try((p) => p.distribute({ husk: 2, wall: 2 }))).ok).toBe(false); // overkills the Husk while the Wall lacks lethal
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
  });

  test("kill the Husk with 1 and the remaining 3 is not lethal to the Wall — the Wall survives the combat", async () => {
    const game = await atAssignment();
    await game.p1.distribute({ husk: 1, wall: 3 });
    await game.settle();
    expect(game.zoneOf("husk")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ zone: "battlefield-bf1", damage: 0 }); // took 3, healed in the Cleanup
    expect(game.zoneOf("raider")).toBe("trash"); // the Wall's own 4 was lethal to the 4-Might Raider
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the other legal line: all 4 on the Wall kills it, and the untouched 0-Might Husk walks away with the battlefield", async () => {
    const game = await atAssignment();
    await game.p1.distribute({ husk: 0, wall: 4 });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("husk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
