/**
 * Ruling 02c7fc7281f5b1b4 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · Action
 *   "Move a friendly unit and ready it."
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298) · 3 Might · "When I attack or defend, give an enemy unit
 *     here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   (+ Nine-Tailed Fox ogn-255-298, the "Ahri Legend" the answer mentions: "When an enemy unit attacks a
 *    battlefield YOU CONTROL, give it -1 [Might] this turn…")
 *
 * Q: I move onto an EMPTY battlefield (Non-Combat Showdown). During that showdown my opponent Ride-the-Winds
 *    a unit onto the same battlefield. What happens?
 * A: The Non-Combat Showdown finishes normally (both pass focus). No control is established (both have
 *    units there). A Combat Showdown then begins: the original contester attacks, the player who moved in
 *    second defends. Nobody controls the battlefield during that combat, so control-dependent abilities
 *    (Ahri Legend) don't trigger, but ordinary attack/defend triggers (Ahri, Inquisitive) do.
 * Rules: 344 / 344.1 / 345 (showdowns, focus to the contester), 340.2.a (focus passes after a showdown
 *        chain empties), 459–461 (combat showdown, attacker = contester), 466.5 (control only after combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const AHRI_INQUISITIVE = "ogn-119-298";
const NINE_TAILED_FOX = "ogn-255-298";

/**
 * P1's turn. bf1 is empty and uncontrolled. P1 has a 6-Might Scout in base; P2 has Ahri, Inquisitive in
 * base, Nine-Tailed Fox as legend, Ride the Wind in hand and exactly 2 + chaos.
 * (6 Might: Ahri's -2 → 4 beats Ahri's 3; if the Fox ALSO fired → 3 vs 3 and both would die.)
 */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .legend(P2, NINE_TAILED_FOX, "fox")
    .unit(P1, "base", { might: 6, name: "Scout" }, "scout")
    .unit(P2, "base", AHRI_INQUISITIVE, "ahri")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Scout walks onto empty bf1 (Non-Combat Showdown, P1 has Focus); P1 passes; P2 Ride-the-Winds Ahri to bf1; both pass priority so it resolves. */
async function contestThenRideIn(game: Game): Promise<void> {
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
  await game.p1.passFocus();
  expect(showdown(game)?.focusPlayer).toBe(P2);
  expect(game.p2.can("cast", "rtw")).toBe(true); // [Action] with Focus in a showdown
  await game.p2.cast("rtw", { targets: "ahri" }); // only legal destination (bf1) is locked without asking
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2 })]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Ride the Wind resolves: Ahri arrives at bf1, ready
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("ahri")).toBe("bf1");
  expect(game.state("ahri").isReady).toBe(true);
}

/** Pass priority / focus for whoever is asked until the showdown at bf1 is a Combat Showdown (bounded). */
async function untilCombatShowdown(game: Game): Promise<void> {
  for (let i = 0; i < 8 && showdown(game)?.isCombatShowdown !== true; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action");
    await game.seat(d!.seat).pass();
  }
}

describe("Ruling 02c7fc7281f5b1b4 — a unit Ride-the-Winds into my Non-Combat Showdown: it finishes, then a Combat Showdown starts", () => {
  // RULING-CONFLICT: riftjudge 02c7fc7281f5b1b4 says the Non-Combat Showdown must first finish (both players
  // pass focus) before a separate Combat Showdown starts; CR 344.1 says the showdown at a battlefield where both
  // players have units IS a combat showdown, so the ongoing showdown becomes one the moment the second player's
  // unit arrives — engine follows CR (also asserted by vilemaw-10a5e8f8befd1db0,
  // rengar-ambush-into-noncombat-showdown and flash-0763, which all require the SAME showdown to upgrade).
  // rule 344.1: a showdown's type follows from the units present, it is not fixed when the showdown began.
  test("the SAME showdown upgrades to a Combat Showdown as soon as Ride the Wind puts Ahri at bf1 — no extra focus round first", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P1,
      battlefieldId: "bf1",
      defendingPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // no control established in between
  });

  test("a Combat Showdown does begin at bf1 with the ORIGINAL contester (P1) attacking and the player who moved in second (P2) defending; nobody controls bf1 meanwhile", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    await untilCombatShowdown(game);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // no control was established in between
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("attack/defend triggers work with nobody in control: Ahri, Inquisitive's 'When I defend' gives the Scout -2 (6 → 4); the control-dependent Nine-Tailed Fox does NOT fire (not 3)", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    await untilCombatShowdown(game);
    // Ahri's defend trigger is (or was) a chain item controlled by P2 aimed at the Scout; the Fox never appears.
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      expect(game.chain().map((c) => c.cardId)).not.toContain("fox");
      const d = game.decision();
      await game.seat(d!.seat).pass();
    }
    expect(game.state("scout").might).toBe(4); // 6 - 2 (Ahri) and NOT a further -1 (Fox needs a battlefield P2 controls)
    expect(game.state("scout").mightModifier).toBe(-2);
  });

  test("the combat then resolves normally: Scout (4) kills Ahri (3) and survives, P1 conquers bf1 for 1 point", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });
});
