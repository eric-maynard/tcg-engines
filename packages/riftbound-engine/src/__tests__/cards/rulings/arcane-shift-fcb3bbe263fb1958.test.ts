/**
 * Ruling fcb3bbe263fb1958 — Arcane Shift (SFD-200 → sfd-200-221) · [Action] · Mind/Chaos · [3][rainbow]
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a
 *      battlefield. Banish this."
 *   × Flash (OGS-011 → ogs-011-024) · [Reaction] "Move up to 2 friendly units to base."
 *
 * Q: Can I Arcane Shift my own unit when there is no enemy unit at a battlefield, since the 3 damage only
 *    happens on resolution?
 * A: No. Both objects are chosen as the spell is PLAYED, so a friendly unit AND an enemy unit at a battlefield
 *    must exist for the play to be legal. (Once it is on the chain and a target is then removed, you just do as
 *    much as you can — the blink happens, the damage does not.)
 * Rules: 355.8 (a play with no legal choice for a required target is illegal), 355.5 (targets are chosen at
 *        play), 359.3.e.5 (an object that stops matching is skipped at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const FLASH = "ogs-011-024";

/** P1's turn with [3][rainbow]. P1 has Mine (3) at bf1; `enemyAt` says where P2's Grunt stands. */
function board(enemyAt: "bf1" | "base") {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P2, enemyAt, { might: 4, name: "Grunt" }, "grunt")
    .hand(P1, ARCANE_SHIFT, "shift")
    .hand(P2, FLASH, "flash");
}

/** Settle, answering the replayed unit's destination prompt (rule 355.4) with `where`. */
async function settleReplay(game: Game, where: string): Promise<void> {
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && /destination/i.test(d.prompt)) {
    await game.p1.pick(where);
  }
  await game.settle();
}

describe("Ruling fcb3bbe263fb1958 — Arcane Shift needs an enemy unit at a battlefield when it is PLAYED", () => {
  test("ruling: with P2's only unit sitting in their base, Arcane Shift cannot be played at all", async () => {
    const game = await board("base").build();
    expect(game.p1.can("cast", "shift")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("shift", { targets: ["mine", "grunt"] }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("shift")).toBe("hand");
    expect(game.p1.energy()).toBe(3); // nothing spent
  });

  test("with the Grunt at a battlefield the same play is legal, and both objects are named on the play", async () => {
    const game = await board("bf1").build();
    expect(game.p1.can("cast", "shift")).toBe(true);
    await game.p1.cast("shift", { targets: ["mine", "grunt"] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "shift", controller: P1, targets: ["mine", "grunt"] }),
    ]);
  });

  test("it resolves fully: Mine is banished and replayed by its owner for free, and the Grunt takes 3; Arcane Shift banishes itself", async () => {
    const game = await board("bf1").build();
    await game.p1.cast("shift", { targets: ["mine", "grunt"] });
    await settleReplay(game, "bf1");
    expect(game.state("grunt").damage).toBe(3);
    expect(game.p1.units()).toContain("mine"); // banished and immediately replayed
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a target removed AFTER the play is just skipped — Flashing the Grunt home leaves the blink intact and the 3 undealt", async () => {
    const game = await board("bf1").build();
    await game.p1.cast("shift", { targets: ["mine", "grunt"] });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["grunt"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves first
    expect(game.locationOf("grunt")).toBe("base");
    await settleReplay(game, "bf1");
    expect(game.state("grunt").damage).toBe(0); // no longer an enemy unit AT A BATTLEFIELD
    expect(game.p1.units()).toContain("mine"); // the rest of the spell still happened
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
