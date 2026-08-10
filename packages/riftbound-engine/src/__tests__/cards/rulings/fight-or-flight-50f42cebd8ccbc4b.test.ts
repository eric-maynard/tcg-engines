/**
 * Ruling 50f42cebd8ccbc4b — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · 2 · [Hidden][Action] "Move a unit from
 *   a battlefield to its base." × Primal Strength (OGN-154 → ogn-154-298) · Spell · Body · 4+[body] · [Action] "Give a unit
 *   +7 [Might] this turn."
 *
 * Q: Attacker plays Primal Strength in the showdown; both pass and it resolves. Can the defender still Fight or Flight the
 *    pumped unit home before combat damage?
 * A: Yes. After Primal Strength resolves there is a fresh window: Focus passes and the opponent may play Fight or Flight
 *    (from hand as an Action, or from hidden). A non-hidden copy can NOT be played while Primal Strength is still on the
 *    chain (Action, not Reaction). If instead both players pass again after it resolves, combat proceeds with no further
 *    spell opportunity.
 * Rules: 347.1 (Focus passes after a chain completes), 347.2.a (all pass in a row → showdown ends), 806.1.b, 811.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const PRIMAL_STRENGTH = "ogn-154-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P2 holds bf1 with Wall (4) and a HIDDEN Fight or Flight there, plus a second copy in hand (2 energy). */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "hiddenFof")
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .hand(P1, PRIMAL_STRENGTH, "ps")
    .hand(P2, FIGHT_OR_FLIGHT, "handFof");
}

/** Striker attacks bf1; P1 (Focus) plays Primal Strength on it; P1 passes priority → P2 holds priority with PS on the chain. */
async function primalStrengthPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("striker", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: true });
  await game.p1.cast("ps", { targets: "striker" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ps", targets: ["striker"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 50f42cebd8ccbc4b — Fight or Flight after Primal Strength resolves, before combat damage", () => {
  test("while Primal Strength is on the chain, the copy in HAND (an Action) is not playable — only the hidden copy could be flipped as a Reaction", async () => {
    const game = await primalStrengthPending();
    expect(game.p2.can("cast", "handFof")).toBe(false);
    expect(game.p2.can("reveal", "hiddenFof")).toBe(true);
  });

  test("both pass → Primal Strength resolves (Striker 10); the showdown is NOT over: Focus passes to P2, who may now play Fight or Flight from hand and send the 10-Might Striker home — no combat is fought, Wall keeps bf1", async () => {
    const game = await primalStrengthPending();
    await game.p2.passPriority(); // both passed → resolves
    expect(game.zoneOf("ps")).toBe("trash");
    expect(game.state("striker").might).toBe(10);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "handFof")).toBe(true);
    expect(game.p2.can("reveal", "hiddenFof")).toBe(true); // "from hidden or hand"
    await game.p2.cast("handFof", { targets: "striker" });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("handFof")).toBe("trash");
    expect(game.locationOf("striker")).toBe("base");
    expect(game.state("striker").damage).toBe(0);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("if instead both players pass AGAIN after Primal Strength resolved, the showdown closes straight into combat: Striker (10) kills Wall (4) and conquers — P2 never gets another chance to Fight or Flight", async () => {
    const game = await primalStrengthPending();
    await game.p2.passPriority(); // PS resolves, Focus → P2
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.p1.passFocus();
    // No further P2 spell window before damage: combat has resolved.
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("striker")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("handFof")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
