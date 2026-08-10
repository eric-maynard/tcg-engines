/**
 * Ruling b28c660f5f25f52a — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · Action
 *     "Move a friendly unit and ready it."
 *   × Moonfall (UNL-198 → unl-198-219) · Spell · Mind/Chaos · 3+1 · Action
 *     "Choose a battlefield where you have units. You may move up to one enemy unit to that battlefield. Then give enemy
 *      units there -2 Might this turn."
 *
 * Q: The opponent moves into a battlefield where I have a unit. In the showdown I Ride the Wind my unit away to another
 *    battlefield, then Moonfall their attacker over to that battlefield. Do they score the original battlefield?
 * A: No. Both are Actions, playable one at a time in the showdown when I have Focus and the chain is empty. When the
 *    showdown at the original battlefield concludes the opponent has no unit there, so they never establish control
 *    and do not conquer/score it.
 * Rules: 806.1.b (Actions in showdowns), 345–347 (Focus; showdown ends when all pass in a row), 181/464.1 (control is
 *        established by having units there when the showdown ends), 323.6 (empty battlefield control lapses).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const MOONFALL = "unl-198-219";

/**
 * P2's turn. P1 holds bf1 with "mine" (3) and bf2 with "holder" (2). P2's "theirs" (4) attacks bf1.
 * P1 has exactly Ride the Wind (2+[chaos]) + Moonfall (3+[mind]).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { chaos: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 4, name: "Theirs" }, "theirs")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P1, MOONFALL, "moonfall");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2 attacks bf1 and passes Focus; P1 Rides the Wind "mine" over to bf2 and lets it resolve. */
async function attackThenRideAway(game: Game): Promise<void> {
  await game.p2.move("theirs", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // attacker has Focus first
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]); // chain empty → an Action is legal
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "mine" });
  expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0, mind: 1 } });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bf2");
      await game.p1.pick("battlefield-bf2");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("mine")).toBe("bf2");
  expect(game.state("mine").isReady).toBe(true);
}

/** P2 passes Focus again; P1 Moonfalls (bf2 is the only battlefield with P1 units → forced) and drags "theirs" to bf2. */
async function moonfallTheirsToBf2(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]);
  expect(game.p1.can("cast", "moonfall")).toBe(true);
  await game.p1.cast("moonfall");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 0 } });
  for (let i = 0; i < 8 && game.zoneOf("moonfall") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // "up to one enemy unit" — P1 picks the attacker.
      expect(d.options.map((o) => o.card ?? o.key)).toContain("theirs");
      await game.p1.pick("theirs");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("moonfall")).toBe("trash");
}

describe("Ruling b28c660f5f25f52a — Ride the Wind away, Moonfall the attacker after you: they do not score the original battlefield", () => {
  test("Ride the Wind is playable in the showdown once P1 has Focus with an empty chain; it moves 'mine' to bf2 ready — and the bf1 showdown is STILL open (control unchanged mid-showdown)", async () => {
    const game = await board().build();
    await attackThenRideAway(game);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.locationOf("theirs")).toBe("bf1");
    expect(game.p2.points()).toBe(0);
  });

  test("Moonfall then drags the attacker to bf2 (with -2 Might: 4 → 2); nobody is left at bf1 while its showdown is still ongoing", async () => {
    const game = await board().build();
    await attackThenRideAway(game);
    await moonfallTheirsToBf2(game);
    expect(game.locationOf("theirs")).toBe("bf2");
    expect(game.state("theirs").might).toBe(2);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control cannot change during the showdown
    expect(game.p2.points()).toBe(0);
  });

  test("when both pass and the bf1 showdown concludes, P2 has no unit there: P2 does NOT conquer or score bf1 (0 points, bf1 not P2's); P1's emptied control simply lapses", async () => {
    const game = await board().build();
    await attackThenRideAway(game);
    await moonfallTheirsToBf2(game);
    await game.settle(); // both pass Focus → bf1 showdown ends; the staged bf2 combat (2 vs 3+2) then resolves too
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P2] ?? []).toEqual([]);
    expect(game.gameState.conqueredThisTurn?.[P2] ?? []).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    // bf2: the dragged 2-Might attacker lost to Mine 3 + Holder 2; P1 keeps bf2.
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
