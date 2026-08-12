/**
 * Ruling 879e617bdfce0808 — Recruit the Vanguard (OGS-015 → ogs-015-024) · Spell · [6] · Action
 *     "Play four 1 [Might] Recruit unit tokens. (They can be played to your base or to battlefields you control.)"
 *   × Flash (OGS-011 → ogs-011-024) · [2] · Reaction — "Move up to 2 friendly units to base." (empties the defence)
 *
 * Q: If all of a player's units are removed from a battlefield during a showdown, do they still get focus and
 *    priority, and do they still control the battlefield?
 * A: Yes to both. A showdown does not end because a side emptied — it ends only when everyone passes focus in a
 *    row — and control is held throughout the combat. So the player still acts and can even play new units, such
 *    as Recruit the Vanguard's tokens, straight onto that battlefield.
 * Rules: 190.4.b (control is frozen while a showdown/combat is ongoing there), 346.2 (a showdown ends on
 *        consecutive focus passes, not on an empty side), 355.2.a (tokens may be played to a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RECRUIT_THE_VANGUARD = "ogs-015-024";
const FLASH = "ogs-011-024";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2's turn. P1 holds bf1 with one 3-Might Defender and has [8] — enough for Flash ([2]) and Recruit the Vanguard ([6]). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, FLASH, "flash")
    .hand(P1, RECRUIT_THE_VANGUARD, "rtv");
}

/** P2 attacks bf1; P1 Flashes its lone defender back to base inside the showdown. */
async function emptyTheDefence(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
  await game.p2.passFocus();
  await game.p1.cast("flash", { targets: "def" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.locationOf("def")).toBe("base");
  expect(game.p1.units("bf1")).toEqual([]);
}

describe("Ruling 879e617bdfce0808 — emptying your side of a showdown costs you neither the battlefield nor your turn to act", () => {
  test("ruling: with every P1 unit gone from bf1 the showdown is STILL running and P1 STILL controls bf1", async () => {
    const game = await board().build();
    await emptyTheDefence(game);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", defendingPlayer: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1, showdownComplete: false });
  });

  test("ruling: P1 still receives focus — after P2 passes, the acting seat is P1 and Recruit the Vanguard (an Action) is playable", async () => {
    const game = await board().build();
    await emptyTheDefence(game);
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtv")).toBe(true);
  });

  test("ruling: and the new Recruits may be played onto that very battlefield — bf1 is offered as a destination for each token because P1 still controls it", async () => {
    const game = await board().build();
    await emptyTheDefence(game);
    await game.p2.passFocus();
    await game.p1.cast("rtv");
    await game.p1.passPriority();
    await game.p2.passPriority();
    for (let i = 0; i < 4; i++) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
      expect((game.decision()?.options ?? []).map((o) => o.key)).toContain("battlefield-bf1");
      await game.p1.pick("battlefield-bf1");
    }
    expect(game.p1.units("bf1")).toHaveLength(4);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1, showdownComplete: false });
    expect(showdown(game)?.active).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("and the combat then resolves against the fresh defence: 4 × 1 Might trade with the 4-Might Raider and nobody is left, so bf1 becomes uncontrolled", async () => {
    const game = await board().build();
    await emptyTheDefence(game);
    await game.p2.passFocus();
    await game.p1.cast("rtv");
    await game.p1.passPriority();
    await game.p2.passPriority();
    for (let i = 0; i < 4; i++) {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p2.points()).toBe(0); // the attacker did not conquer
  });
});
