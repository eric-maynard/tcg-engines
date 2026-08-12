/**
 * Ruling ad81dd291e5f5ee9 — Retreat (OGN-104 → ogn-104-298) · Reaction [1]
 *   "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: After combat damage is dealt, can I retreat my unit to save it while keeping the kills it just made?
 * A: No. Retreating has to happen BEFORE the Combat Damage Step — and a unit pulled out that way deals
 *    no combat damage at all. Once damage has been dealt the window is gone: the unit is already dead
 *    (or already marked), and the kills it made stand, but it cannot be saved after the fact.
 * Rules: 460.2 (Combat Damage Step: only units present when it starts assign damage), 465.2,
 *        310/331 (Reactions need an open priority window — the damage step is not one).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";

/** P1's turn: a 3-Might attacker walks into P2's 3-Might defender at bf1. Retreat + [1] in P1's hand. */
function board() {
  return scenario()
    .autoProcedures(false)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RETREAT, "retreat");
}

/** Open the showdown at bf1 and stop with the combat still unresolved. */
async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("sentry").combatRole).toBe("defender");
  return game;
}

describe("Ruling ad81dd291e5f5ee9 — Retreat is a BEFORE-damage escape; a retreated unit deals no damage", () => {
  test("ruling: retreating during the showdown pulls the unit out — it deals no combat damage and the defender is untouched", async () => {
    const game = await attack();
    await game.p1.cast("retreat", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.state("sentry").damage).toBe(0); // no damage from the unit that left
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("ruling: 'Its owner channels 1 rune exhausted' — the consolation rune arrives exhausted", async () => {
    const game = await attack();
    const before = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "raider" });
    await game.settle();
    expect(game.p1.runes()).toHaveLength(before + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("ruling: once the Combat Damage Step has run, both 3-Might units are dead — the kill stands and cannot be undone", async () => {
    const game = await attack();
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("ruling: after damage there is nothing left to retreat — the dead attacker is no longer a legal choice for Retreat", async () => {
    const game = await attack();
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    const bad = await game.p1.try((p) => p.cast("retreat", { targets: "raider" }));
    expect(bad.ok).toBe(false);
    expect(game.zoneOf("retreat")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("ruling (the trade the question asks for is impossible): you cannot both deal the damage and keep the unit", async () => {
    // Path A — retreat: attacker saved, defender alive and undamaged.
    const a = await attack();
    await a.p1.cast("retreat", { targets: "raider" });
    await a.settle();
    expect(a.zoneOf("raider")).toBe("hand");
    expect(a.zoneOf("sentry")).toBe("battlefield-bf1");
    // Path B — damage: defender dies, but so does the attacker.
    const b = await attack();
    await b.settle();
    await b.p1.choose("resolveFullCombat:bf1");
    await b.settle();
    expect(b.zoneOf("sentry")).toBe("trash");
    expect(b.zoneOf("raider")).toBe("trash");
  });
});
