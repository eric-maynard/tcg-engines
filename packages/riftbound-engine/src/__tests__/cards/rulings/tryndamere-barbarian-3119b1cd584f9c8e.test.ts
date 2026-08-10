/**
 * Ruling 3119b1cd584f9c8e — Tryndamere, Barbarian (OGN-034 → ogn-034-298) · Champion · Fury · 7 · 8 Might
 *     "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Tryndamere is brought in as a DEFENDER via Ride the Wind, wins combat, conquers the battlefield with 5+
 *    excess damage — does his ability score an additional point?
 * A: No. "When I conquer after an attack" only triggers when he conquers as the Attacker. Conquering on
 *    defense scores only the normal 1 point.
 * Rules: 459.2.b (whose units applied Contested is the Attacker; the other player is the Defender),
 *        348.2.a / 466.5.d (last player with units establishes control → Conquer), 383.4.c.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn. bf1 is uncontrolled and empty. P2's Raider (2) is in base; P1's exhausted Tryndamere (8) is in
 * P1's base with Ride the Wind in hand and exactly [2][chaos].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .unit(P1, "base", TRYNDAMERE, "trynd", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw")
    .autoProcedures(false);
}

/** P2 moves the Raider to bf1 (showdown opens, P2 has Focus and passes); P1 Rides the Wind Tryndamere into bf1. */
async function tryndamereDefends(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "trynd" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "pick" && game.actingSeat() === P1) {
    await game.p1.pick("bf1"); // "Move a friendly unit" — destination
  }
  expect(game.zoneOf("trynd")).toBe("battlefield-bf1");
  expect(game.state("trynd").isReady).toBe(true); // "... and ready it"
  return game;
}

describe("Ruling 3119b1cd584f9c8e — Tryndamere conquering on DEFENSE does not trigger 'when I conquer after an attack'", () => {
  test("control: as the ATTACKER into a 2-Might defender (6 excess) he conquers and scores 1 + 1 = 2 points", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Raider" }, "raider")
      .unit(P1, "base", TRYNDAMERE, "trynd")
      .build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("P2's Raider applied Contested, so P2 is the Attacker and Tryndamere (arriving via Ride the Wind) is a Defender", async () => {
    const game = await tryndamereDefends();
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("trynd").combatRole).toBe("defender");
  });

  test("Tryndamere wins on defense with 6 excess, P1 conquers bf1 — but scores only the 1 Conquer point; no Tryndamere trigger", async () => {
    const game = await tryndamereDefends();
    await game.settle(); // both pass focus → combat resolves
    if (game.decision()?.kind === "action" && game.acting().can("resolveCombat")) {
      await game.acting().choose(game.acting().option("resolveCombat")?.key as string);
      await game.settle();
    }
    expect(game.zoneOf("raider")).toBe("trash"); // 8 into a 2-Might unit: 6 excess
    expect(game.zoneOf("trynd")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control established → Conquer (348.2.a)
    expect(game.p1.points()).toBe(1); // just the Conquer — NOT 2
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]); // no Tryndamere trigger pending
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
