/**
 * Ruling 144a43c3a845800b — Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos]
 *   "[Action] (Play on your turn or in showdowns.) Move a friendly unit and ready it."
 *
 * Q: I control a battlefield with a unit and my opponent attacks it. Can I Ride the Wind that unit
 *    home to base (leaving the battlefield empty) and then Ride the Wind it straight back, so that
 *    re-arriving counts as a fresh conquer and scores?
 * A: No. Control cannot change while a combat/showdown is ongoing there, so leaving does NOT drop
 *    control — the unit comes back to a battlefield P1 still controls and is still the defender.
 *    Establishing control (and therefore conquering/scoring) never happens; defending is not a
 *    conquer. (Pre-October-25 rules did drop control on leaving, which is where "yes" came from.)
 * Rules: 190.4.b, 190.4.c, 323.6 (step 4), 466.5 / 466.5.d, 469.1, 348.2.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn. P1 controls bf1 with a 5-Might Guard standing on it; P2's 3-Might Raider is in base and
 * will attack. P1 holds two Ride the Wind with exactly [4][chaos][chaos] — enough for both.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw1")
    .hand(P1, RIDE_THE_WIND, "rtw2");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

/** P2 attacks bf1 with the Raider and passes Focus so P1 may act inside the showdown. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(bf(game, "bf1")).toMatchObject({ contested: true, controller: P1 });
  expect(game.state("guard").combatRole).toBe("defender");
  expect(game.actingSeat()).toBe(P2); // attacker holds Focus first
  await game.p2.pass();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

/** Cast one Ride the Wind on the Guard and answer its destination pick; leaves the chain empty. */
async function rideTo(game: Game, spell: string, destination: string): Promise<void> {
  await game.p1.cast(spell, { targets: "guard" });
  for (let i = 0; i < 8 && game.zoneOf(spell) !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain(destination);
      await game.p1.pick(destination);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf(spell)).toBe("trash");
}

describe("Ruling 144a43c3a845800b — bouncing your own defender out and back mid-combat does not re-conquer the battlefield", () => {
  test("premise: P1 controls bf1 and is the defender; nobody has scored yet", async () => {
    const game = await attacked();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.locationOf("guard")).toBe("bf1");
  });

  test("step 1 — Ride the Wind sends the Guard home: bf1 is left with no P1 unit, yet P1 STILL controls it (190.4.b: control cannot change while a combat is ongoing there), and the showdown is still open", async () => {
    const game = await attacked();
    await rideTo(game, "rtw1", "base");
    expect(game.locationOf("guard")).toBe("base");
    expect(game.state("guard").isReady).toBe(true); // "…and ready it"
    expect(game.p1.units("bf1")).toEqual([]);
    // The frozen-control fact the whole ruling rests on.
    expect(bf(game, "bf1")).toMatchObject({ contested: true, controller: P1 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("step 2 — Riding the Guard straight back onto bf1 scores nothing: P1 already controlled it, so no control is established and no conquer happens", async () => {
    const game = await attacked();
    await rideTo(game, "rtw1", "base");
    // Focus alternates; get it back to P1 without ending the showdown (both would have to pass in a row).
    for (let i = 0; i < 4 && !(game.actingSeat() === P1 && game.p1.can("cast", "rtw2")); i++) {
      await game.acting().passFocus();
    }
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    await rideTo(game, "rtw2", "battlefield-bf1");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(bf(game, "bf1")).toMatchObject({ contested: true, controller: P1 });
    expect(game.p1.points()).toBe(0); // ← the ruling: NO score
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
  });

  test("step 3 — the combat then resolves normally: the returned 5-Might Guard is still the DEFENDER, kills the 3-Might Raider, keeps bf1 and still scores nothing (defending is not conquering, 466.5.d)", async () => {
    const game = await attacked();
    await rideTo(game, "rtw1", "base");
    for (let i = 0; i < 4 && !(game.actingSeat() === P1 && game.p1.can("cast", "rtw2")); i++) {
      await game.acting().passFocus();
    }
    await rideTo(game, "rtw2", "battlefield-bf1");
    expect(game.state("guard").combatRole).toBe("defender");
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(bf(game, "bf1")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — the machinery is not simply refusing to score: when the ATTACKER wins the same combat, control changes hands and P2 conquers for a point", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(bf(game, "bf1")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("nuance — the showdown only ends when both players pass Focus in a row: P1's Ride the Wind resets that, so P2 passing once after it does not end the combat", async () => {
    const game = await attacked();
    await rideTo(game, "rtw1", "base");
    expect(showdown(game)?.active).toBe(true);
    // One single pass by whoever holds Focus is never enough to close it.
    await game.acting().passFocus();
    expect(showdown(game)?.active).toBe(true);
    expect(bf(game, "bf1")?.controller).toBe(P1);
  });
});
