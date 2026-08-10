/**
 * Ruling 9f0c224f780e3e16 — Showstopper (OGN-270 → ogn-270-298) · spell · [1][rainbow] · "Buff a friendly unit in your base, then move it
 *     to a battlefield."
 *   × Zenith Blade (OGN-262 → ogn-262-298) · [Action] · [3][rainbow][rainbow] · "Stun an enemy unit at a battlefield. You may move a friendly unit to
 *     that enemy unit's battlefield."
 *
 * Q: Can I Standard-Move a unit into an occupied battlefield and then, before the showdown starts, Showstopper another unit in?
 * A: No. The showdown begins as soon as the move completes, and Showstopper is a slow spell (no [Action]/[Reaction]) — it cannot
 *    be played during a showdown. A fast spell like Zenith Blade CAN be played during the showdown to bring a second unit.
 * Rules: 344 (showdown begins at the Cleanup after the move), 341–342 (spell timing: default only in Open state on your turn),
 *        812 ([Action]: on your turn or in showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";
const ZENITH_BLADE = "ogn-262-298";

/** P1's turn with [4] + 3 rainbow (both spells' pips). P1: Runner (3) + Backup (2) in base, Showstopper + Zenith Blade in hand. P2's Guard (4) holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P1, "base", { might: 2, name: "Backup" }, "backup")
    .hand(P1, SHOWSTOPPER, "show")
    .hand(P1, ZENITH_BLADE, "zenith");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 9f0c224f780e3e16 — no Showstopper between a Standard Move and its showdown; an [Action] spell works instead", () => {
  test("premise: in the Open state (before moving) both Showstopper and Zenith Blade are castable", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "show")).toBe(true);
    expect(game.p1.can("cast", "zenith")).toBe(true);
  });

  test("Runner Standard-Moves into bf1: the combat showdown is open IMMEDIATELY (P1 has Focus) — there is no window in between, and Showstopper is NOT legal now", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "show")).toBe(false);
    const r = await game.p1.try((p) => p.cast("show", { targets: "backup" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("show")).toBe("hand");
    expect(game.locationOf("backup")).toBe("base");
  });

  test("…but the [Action] Zenith Blade IS legal in the showdown: stun the Guard and move Backup to its battlefield — Backup joins as an attacker before combat damage", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf1");
    expect(game.p1.can("cast", "zenith")).toBe(true);
    await game.p1.cast("zenith", { targets: ["guard", "backup"] }); // [stunned enemy, friendly mover]
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        // "to that enemy unit's battlefield" — the only destination offered is bf1
        expect(d.options.map((o) => o.key)).toEqual(["battlefield-bf1"]);
        await game.p1.pick("battlefield-bf1");
      } else {
        break;
      }
    }
    expect(game.zoneOf("zenith")).toBe("trash");
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.locationOf("backup")).toBe("bf1");
    expect(game.state("backup").combatRole).toBe("attacker");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    await game.settle();
    // Stunned Guard deals nothing; 3 + 2 = 5 ≥ 4 kills it; P1 conquers.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["backup", "runner"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
