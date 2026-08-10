/**
 * Ruling 0fb5c0312fa670ca — Cleave (OGN-004 → ogn-004-298) · Spell · Fury · 1 · [Action] "Give a unit [Assault 3] this turn."
 *   × Block (ogn-057-298) · Spell · Calm · 2 · [Action] "Give a unit [Shield 3] and [Tank] this turn." — the defender's action.
 *
 * Q: If the attacker already passed Focus and the defender then plays an Action card, does the attacker get another action?
 * A: Yes. Focus goes back and forth: attacker passes → defender plays an Action (attacker may React) → when that chain
 *    resolves the attacker automatically receives Focus and may now play an Action such as Cleave. Receiving Focus after a
 *    chain resolves is not a voluntary pass: the showdown only ends once both players pass consecutively without playing.
 * Rules: 347.1.b (when the chain closes, Focus passes to the next player in turn order), 347.2.a/b (all players pass in
 *        sequence → showdown ends; otherwise Focus passes on), 345 (attacker holds Focus first).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const BLOCK = "ogn-057-298";

/** P1's turn. P2 holds bf1 with Guard (3) and has Block + [2]; P1's Raider (3) in base with Cleave + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, BLOCK, "block");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P1 (attacker, Focus first) passes without playing; P2 plays Block on Guard; both pass priority → it resolves. */
async function attackerPassedDefenderBlocked(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("block", { targets: "guard" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "block", controller: P2 })]);
  return game;
}

describe("Ruling 0fb5c0312fa670ca — after the defender's Action resolves, Focus returns to the attacker who may then Cleave", () => {
  test("while the defender's Block is on the chain the attacker gets PRIORITY (may React) — but Cleave is an [Action], not playable onto a chain", async () => {
    const game = await attackerPassedDefenderBlocked();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(false);
  });

  test("Block resolves (Guard: Shield 3 + Tank) and Focus passes AUTOMATICALLY to the attacker: the showdown is still open and P1 may now play Cleave on the Raider", async () => {
    const game = await attackerPassedDefenderBlocked();
    await game.p2.passPriority();
    await game.p1.passPriority(); // chain closes
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("block")).toBe("trash");
    expect(game.state("guard").grantedKeywords.map((k) => k.keyword).toSorted()).toEqual(["Shield", "Tank"]);
    expect(showdown(game)?.active).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "raider" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cleave", controller: P1, targets: ["raider"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    // Cleave's chain closed → Focus moves on to P2 again; still not over
    expect(showdown(game)?.active).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("receiving Focus after a chain is NOT a voluntary pass: P1's earlier pass doesn't count any more — after Block resolves P1 passing alone does not end the showdown; only P2's consecutive pass does", async () => {
    const game = await attackerPassedDefenderBlocked();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Block resolves, Focus → P1
    await game.p1.passFocus();
    expect(showdown(game)?.active).toBe(true); // P2 has not passed since playing Block
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus(); // now both passed in sequence → combat damage
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    // Raider 3 into Guard 3 + Shield 3 = 6: Raider dies, Guard lives, P2 keeps bf1
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("full back-and-forth to the end: pass → Block → (auto-Focus) Cleave → P2 passes → P1 passes → combat: Raider 3 + Assault 3 = 6 vs Guard 3 + Shield 3 = 6 — both die, bf1 left with no units", async () => {
    const game = await attackerPassedDefenderBlocked();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.cast("cleave", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passFocus();
    expect(showdown(game)?.active).toBe(true); // P1 played last; P1 must pass too
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
