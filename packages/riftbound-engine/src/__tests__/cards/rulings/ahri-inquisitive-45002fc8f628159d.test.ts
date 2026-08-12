/**
 * Ruling 45002fc8f628159d — Ahri, Inquisitive (OGN-119 → ogn-119-298) · Unit · 3 Might
 *   "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Can I use Ahri, Inquisitive's ability more than once in the same turn if there are several showdowns?
 * A: Yes — once per showdown. "When I attack" / "When I defend" triggers are limited to once per combat, but
 *    several showdowns can happen at the same battlefield in one turn and each is a separate combat, so she
 *    triggers the first time she gains the attacker or defender designation in each of them.
 * Rules: 383.4.e.2.a / 383.4.f.2.a (attack/defend triggers fire once per combat), 459 (each showdown is its own
 *        combat), 461 (designations are assigned when a showdown begins).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI_INQUISITIVE = "ogn-119-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds bf1 with Ahri (3) behind a 9-Might [Tank] Bulwark; P2 has three 2-Might Raiders in base. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AHRI_INQUISITIVE, "ahri")
    .unit(P1, "bf1", { keywords: ["Tank"], might: 9, name: "Bulwark" }, "wall")
    .unit(P2, "base", { might: 2, name: "Raider One" }, "r1")
    .unit(P2, "base", { might: 2, name: "Raider Two" }, "r2")
    .unit(P2, "base", { might: 2, name: "Raider Three" }, "r3");
}

/** Resolve the top chain item by passing priority for whoever holds it, twice. */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 45002fc8f628159d — Ahri's defend trigger fires once per showdown, so twice across two showdowns in one turn", () => {
  test("showdown 1: the trigger fires ONCE — P1 is asked to name a single enemy unit here", async () => {
    const game = await board().build();
    await game.p2.move(["r1", "r2"], "bf1");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ahri"]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as Pick).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["r1", "r2"]);
    await game.p1.pick("r1");
    await resolveTop(game);
    expect(game.state("r1").might).toBe(1); // 2 − 2, floored at 1
    expect(game.state("r2").might).toBe(2); // only ONE unit is hit per combat
    expect(game.chain()).toEqual([]);
  });

  test("ruling: a SECOND showdown at the same battlefield in the same turn triggers her again", async () => {
    const game = await board().build();
    await game.p2.move(["r1", "r2"], "bf1");
    await game.p1.pick("r1");
    await game.settle();
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");

    await game.p2.move("r3", "bf1"); // second showdown, same turn, same battlefield
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ahri"]);
    expect(game.state("r3").might).toBe(2);
    await resolveTop(game);
    expect(game.state("r3").might).toBe(1); // the second instance of the ability
    expect(game.violations()).toEqual([]);
  });

  test("epilogue: both showdowns end with P1 keeping bf1 and every Raider dead", async () => {
    const game = await board().build();
    await game.p2.move(["r1", "r2"], "bf1");
    await game.p1.pick("r1");
    await game.settle();
    await game.p2.move("r3", "bf1");
    await game.settle();
    expect(game.zoneOf("r3")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("the debuffs are 'this turn' — every survivor is back to its printed Might next turn", async () => {
    const game = await board().build();
    await game.p2.move(["r1", "r2"], "bf1");
    await game.p1.pick("r1");
    await resolveTop(game);
    expect(game.state("r1").might).toBe(1);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ahri").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
