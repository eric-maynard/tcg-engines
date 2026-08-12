/**
 * Ruling 8af4f60374d2186c — Smite (UNL-007 → unl-007-219) · Spell · Fury · [2][fury] · [Action]
 *   "Deal 3 to a unit at a battlefield. If it would die this turn, banish it instead."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] · "Deal 3 to a unit at a battlefield." (the control)
 *
 * Q: Does Deathknell trigger when Smite's damage finishes a unit off — i.e. when it is banished instead?
 * A: No. Deathknell needs the permanent to be KILLED and put in the Trash. Smite's replacement banishes it
 *    instead, so it is never killed and never reaches the trash, and the condition is simply not met.
 * Rules: 808.1.d.1 (Deathknell = killed and sent to the Trash), 370.1/370.2 (a replacement means the original
 *        event never happens), 422 (kill sends to trash).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SMITE = "unl-007-219";
const HEXTECH_RAY = "ogn-009-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's turn with enough for either burn spell. P2 defends bf1 with a 1-Might Watchful Sentry. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 3, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
    .hand(P1, SMITE, "smite")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling 8af4f60374d2186c — Smite banishes instead of killing, so Deathknell never triggers", () => {
  test("Smite's 3 damage would be lethal to the 1-Might Sentry, and it goes to BANISHMENT, not the trash", async () => {
    const game = await board().build();
    await game.p1.cast("smite", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("banishment");
    expect(game.p2.trash()).not.toContain("sentry");
  });

  test("no Deathknell: nothing went on the chain and P2 drew no card", async () => {
    const game = await board().build();
    const p2HandBefore = game.p2.hand().length;
    await game.p1.cast("smite", { targets: "sentry" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand().length).toBe(p2HandBefore);
    expect(game.violations()).toEqual([]);
  });

  test("control — the same 3 damage from Hextech Ray DOES kill it: trash, and the Deathknell draw happens", async () => {
    const game = await board().build();
    const p2HandBefore = game.p2.hand().length;
    await game.p1.cast("ray", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.hand().length).toBe(p2HandBefore + 1);
  });
});
