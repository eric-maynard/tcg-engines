/**
 * Ruling 71005e21e805e384 — Hextech Ray (OGN-009 → ogn-009-298) · Action · 1+[fury] "Deal 3 to a unit at a battlefield."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Action · 2+[order] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: The attacker's only unit is killed mid-showdown by Hextech Ray (no reaction). Does the showdown end at once, or can
 *    the attacker still play Action cards like Hidden Blade?
 * A: Killing the attacking unit does not end the showdown. It continues; players can still play Actions; it only ends
 *    when both players pass Focus in a row — not because one side has no units left.
 * Rules: 445–447 (showdown; Focus passing ends it), 341 (Action timing inside a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P2 holds bf1 with Guard (4) and has Ray + 1+[fury]. P1: lone Scout (3) in base, Hidden Blade in hand + 2+[order]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, HEXTECH_RAY, "ray");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Scout attacks bf1; P1 passes Focus; P2 Rays the Scout; both pass priority → the Scout (P1's only unit) dies. */
async function scoutAttacksAndIsRayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("ray", { targets: "scout" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // no reaction — Ray resolves
  expect(game.zoneOf("ray")).toBe("trash");
  expect(game.zoneOf("scout")).toBe("trash");
  expect(game.p1.units()).toEqual([]);
  return game;
}

describe("Ruling 71005e21e805e384 — the attacker's only unit dying to Hextech Ray does not end the showdown", () => {
  test("after the Scout dies the showdown at bf1 is STILL open (no side having units doesn't end it) and Focus comes back around to the attacker", async () => {
    const game = await scoutAttacksAndIsRayed();
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" });
    expect(game.chain()).toEqual([]);
    // Whoever holds Focus now, it is a showdown decision, not P1's open main phase.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    for (let i = 0; i < 2 && game.decision()?.seat !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown(game)).toBeDefined();
  });

  test("the unit-less attacker can still play an Action: P1 casts Hidden Blade from hand at the Guard — it resolves, the Guard dies and P2 draws 2, all inside the same showdown", async () => {
    const game = await scoutAttacksAndIsRayed();
    for (let i = 0; i < 2 && game.decision()?.seat !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.p1.can("cast", "blade")).toBe(true);
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "guard" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["guard"] })]);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    // Still not over: nobody has passed Focus in a row yet.
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("the showdown ends only through the normal mechanism — both players passing Focus in a row — after which P1 is back in the open main phase", async () => {
    const game = await scoutAttacksAndIsRayed();
    await game.acting().passFocus();
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" }); // one pass is not enough
    await game.acting().passFocus();
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
