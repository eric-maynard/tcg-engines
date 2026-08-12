/**
 * Ruling 3a2ad519b3ff644d — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: If the defending unit is moved away with Ride the Wind during a showdown, does the showdown end?
 * A: No — it continues as normal with the original defender, even with no units of theirs at the battlefield.
 *    Focus keeps passing, and the defender may play more Actions, including a second Ride the Wind that brings
 *    the unit back before the showdown resolves. Attack triggers do NOT fire again on the way back in
 *    (no attacker went anywhere).
 * Rules: 460/463 (a showdown ends only when both players pass Focus in a row on an empty chain),
 *        190.4.b (control is frozen at a battlefield with an ongoing showdown/combat),
 *        464.2.c.3.a (attack/defend designations are made for newcomers only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const AHRI_INQUISITIVE = "ogn-119-298"; // "When I attack or defend, give an enemy unit here -2 [Might] this turn, min 1"
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn: the 5-Might Attacker walks into P2's bf1, opening a combat showdown; P2 gets Focus after P1 passes. */
async function attackIntoDefender(attacker: string | { readonly might: number; readonly name: string }): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 4, power: { mind: 2 } })
    .resources(P2, { energy: 8, power: { chaos: 4 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", unit(5, "Defender"), "def")
    .unit(P1, "base", attacker, "atk")
    .hand(P2, RIDE_THE_WIND, "rtw1")
    .hand(P2, RIDE_THE_WIND, "rtw2")
    .build();
  await game.p1.move("atk", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2, isCombatShowdown: true });
  // let any "when I attack" trigger resolve before Focus starts moving
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  return game;
}

/** P2 rides the Defender out to `to` and both seats let the spell resolve. */
async function rideOut(game: Game, card: string, to: "base" | "battlefield-bf2" | "battlefield-bf1"): Promise<void> {
  await game.p2.cast(card, { targets: "def" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick(to);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf(card)).toBe("trash");
}

describe("Ruling 3a2ad519b3ff644d — moving the lone defender out does not end the showdown", () => {
  test("the showdown stays active with zero defending units, and P2 keeps control of bf1 while it runs", async () => {
    const game = await attackIntoDefender(unit(5, "Attacker"));

    await rideOut(game, "rtw1", "base");

    expect(game.locationOf("def")).toBe("base");
    expect(game.state("def").isReady).toBe(true); // "and ready it"
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    // Focus simply passes on — back to the attacker.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("P2 can bring the unit back with a second Ride the Wind before the showdown resolves, and the combat happens", async () => {
    const game = await attackIntoDefender(unit(5, "Attacker"));
    await rideOut(game, "rtw1", "base");

    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    await rideOut(game, "rtw2", "battlefield-bf1");
    expect(game.locationOf("def")).toBe("bf1");

    await game.settle(); // both pass Focus → combat: 5 vs 5, mutual lethal
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // 466.5.b — nobody left
  });

  test("if the unit stays away, the showdown ends normally and the attacker conquers", async () => {
    const game = await attackIntoDefender(unit(5, "Attacker"));
    await rideOut(game, "rtw1", "base");

    await game.settle();

    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.locationOf("def")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("attack triggers do NOT fire again when the unit comes back — no attacker went anywhere", async () => {
    const game = await attackIntoDefender(AHRI_INQUISITIVE);
    // Ahri's "when I attack" already resolved once: the 5-Might Defender is at 3.
    expect(game.state("def").might).toBe(3);

    await rideOut(game, "rtw1", "base");
    await game.p1.passFocus();
    await rideOut(game, "rtw2", "battlefield-bf1");

    expect(game.locationOf("def")).toBe("bf1");
    expect(game.state("def").might).toBe(3); // still 3 — a second -2 would have made it 1
  });
});
