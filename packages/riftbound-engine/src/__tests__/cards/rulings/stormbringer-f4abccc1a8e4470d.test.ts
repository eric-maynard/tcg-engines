/**
 * Ruling f4abccc1a8e4470d — Stormbringer (OGN-250 → ogn-250-298) · Fury/Body spell · [6][rainbow][rainbow]
 *   "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield, then
 *    move your unit there."
 *   × Master Yi legend "While a friendly unit defends alone, it gets +2 [Might]." (the ruling lists UNL-191, but the
 *     quoted passive is Wuju Bladesman — in our pool ogs-019-024 "Wuju Bladesman - Starter", same text).
 *
 * Q: A 6-Might unit is Stormbringer'd onto a battlefield where a lone 6-Might unit of the Yi player stands. Does it die?
 * A: Yes. Stormbringer marks 6 damage; the Cleanup kills the unit BEFORE any combat is staged/initiated, so it never
 *    gains the defender designation and Yi's +2 never applies. If instead the mover had 5 Might, the unit survives
 *    the Cleanup (5 < 6), a combat is staged, it becomes a lone defender at 8 Might with 5 damage marked.
 * Rules: 322.4 (cleanup kills lethal-damaged units), 322.10/322.14 (showdown/combat staged later in the cleanup),
 *        464.2.c.3 (designations when combat opens), 364.3 (while-defending passives).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STORMBRINGER = "ogn-250-298";
const WUJU_BLADESMAN = "ogs-019-024";

/** P1's turn with [6]+2 rainbow and Stormbringer. P2 (Wuju Bladesman legend) holds bf1 with a lone 6-Might Disciple. */
function board(moverMight: number) {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .legend(P2, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: moverMight, name: "Storm Rider" }, "rider")
    .unit(P2, "bf1", { might: 6, name: "Disciple" }, "disciple")
    .hand(P1, STORMBRINGER, "storm");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Stormbringer choosing Rider and bf1, both pass → it resolves. */
async function castAndResolve(moverMight: number): Promise<Game> {
  const game = await board(moverMight).build();
  const fields = game.p1.option("cast", "storm")?.fields.find((f) => f.name === "targets");
  expect(fields?.options).toContainEqual(["rider", "bf1"]);
  await game.p1.cast("storm", { targets: ["rider", "bf1"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "storm", targets: ["rider", "bf1"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("storm")).toBe("trash");
  return game;
}

describe("Ruling f4abccc1a8e4470d — Stormbringer's damage kills in the Cleanup before any combat (and Yi's defend-alone +2) can exist", () => {
  test("premise: the lone Disciple is 6 Might outside combat — Wuju Bladesman's +2 is a WHILE-defending passive, not always-on", async () => {
    const game = await board(6).build();
    expect(game.state("disciple")).toMatchObject({ combatRole: null, might: 6 });
  });

  test("6-Might mover: Disciple takes 6, dies in the Cleanup with NO defender designation ever; Rider arrives at a battlefield with no enemy — no combat showdown is staged", async () => {
    const game = await castAndResolve(6);
    expect(game.zoneOf("disciple")).toBe("trash");
    expect(game.state("disciple").combatRole).toBeNull();
    expect(game.zoneOf("rider")).toBe("battlefield-bf1");
    expect(game.state("rider").combatRole).toBeNull();
    const sd = showdown(game);
    expect(sd?.isCombatShowdown ?? false).toBe(false);
    expect(game.p2.units("bf1")).toEqual([]);
  });

  // The ruling calls the follow-up state a "rules hangup" (contested battlefield, controller has no units, no combat
  // possible). The engine's battlefield-control model (CR 190.4 / 323.6, rulings f69a1bb8709cf037 / 88f862ece2edcd29)
  // resolves it: P2's control lapses in that Open Cleanup, Rider's arrival opens a NON-combat showdown at the now
  // uncontrolled bf1, and when both pass P1 conquers.
  test("follow-through (engine control model): P2's unit-less control lapses, a non-combat showdown runs, and P1 conquers bf1 for a point", async () => {
    const game = await castAndResolve(6);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("rider")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — 5-Might mover: Disciple survives the Cleanup with 5 damage, a COMBAT is staged and begun, it is the lone defender and Yi's passive makes it 8 Might (5 damage still marked)", async () => {
    const game = await castAndResolve(5);
    expect(game.zoneOf("disciple")).toBe("battlefield-bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("rider").combatRole).toBe("attacker");
    expect(game.state("disciple")).toMatchObject({ combatRole: "defender", damage: 5, might: 8 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("5-Might follow-through: combat at 5 vs 8 with 5 pre-marked — Rider's 5 more (10 ≥ 8) kills the Disciple, the Disciple's 8 kills Rider; nobody remains, bf1 ends uncontrolled, no points", async () => {
    const game = await castAndResolve(5);
    await game.settle();
    expect(game.zoneOf("disciple")).toBe("trash");
    expect(game.zoneOf("rider")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
