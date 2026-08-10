/**
 * Ruling 89cfc06977d48d5f — Glorious Executioner (SFD-185 → sfd-185-221) · Legend · Draven
 *     "When you win a combat, draw 1. (You win if only your units remain after combat.)"
 *   × Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · 3 · [Reaction]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Does the Draven legend trigger if the enemy unit is removed from the combat with Star-Crossed?
 * A: Yes, provided you win. Combat does not end when the enemy unit leaves — it ends when both pass on an empty chain;
 *    if only your units remain at the battlefield then, you won the combat, the legend triggers and you draw 1.
 * Rules: 466.7 (combat ends / winner = only your units remain), 383 (triggered ability on the chain), 454 (focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLORIOUS_EXECUTIONER = "sfd-185-221";
const STAR_CROSSED = "unl-128-219";

/** P1 (Draven legend, exactly 3+[chaos]) attacks P2's Wall (6) at bf1 with A (2) and B (2); Star-Crossed in hand. */
function board() {
  return scenario()
    .legend(P1, GLORIOUS_EXECUTIONER, "draven")
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "A" }, "a")
    .unit(P1, "base", { might: 2, name: "B" }, "b")
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .hand(P1, STAR_CROSSED, "sc");
}

/** Attack with both, then (holding Focus) Star-Crossed B + the Wall; both pass → it resolves. Stops at the next Focus decision. */
async function starCrossTheWall(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["a", "b"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("sc", { targets: ["b", "wall"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P1, targets: ["b", "wall"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 89cfc06977d48d5f — removing the only defender with Star-Crossed still counts as winning the combat for Glorious Executioner", () => {
  test("Star-Crossed resolves: B and the Wall go back to their owners' hands, A stays at bf1 — and the combat is NOT over yet (the showdown continues, Focus passes on; no legend trigger so far)", async () => {
    const game = await starCrossTheWall();
    expect(game.zoneOf("b")).toBe("hand");
    expect(game.p1.hand()).toContain("b");
    expect(game.zoneOf("wall")).toBe("hand");
    expect(game.p2.hand()).toContain("wall");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // nothing conquered yet
  });

  test("both pass Focus on the empty chain → combat ends with only P1's unit remaining: P1 wins, conquers bf1, and Glorious Executioner's 'draw 1' goes on the chain", async () => {
    const game = await starCrossTheWall();
    for (let i = 0; i < 2; i++) {
      const d = game.decision();
      expect(d).toMatchObject({ context: "showdown", kind: "action" });
      await game.seat(d!.seat).passFocus();
    }
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["a"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
  });

  test("the trigger resolves: P1 draws exactly 1 (hand = returned B + the drawn card); A holds the conquered bf1", async () => {
    const game = await starCrossTheWall();
    const deckBefore = game.p1.deck().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.hand()).toContain("b");
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Star-Crossed: A and B (4 total) die into the Wall (6); P1 does not win, no draw", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b"], "bf1");
    const deckBefore = game.p1.deck().length;
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.deck()).toHaveLength(deckBefore);
    expect(game.p1.hand()).toEqual(["sc"]);
  });
});
