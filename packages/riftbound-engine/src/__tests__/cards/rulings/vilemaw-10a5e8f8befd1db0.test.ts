/**
 * Ruling 10a5e8f8befd1db0 — Vilemaw (UNL-060 → unl-060-219) · 8 Might · "[Ambush] Enemy units here with less
 *   Might than me don't deal combat damage. When I hold, draw 1."
 *   × Ride the Wind (ogn-173-298) · Action · "Move a friendly unit and ready it."  (+ Rune Prison ogn-050-298
 *   "Stun a unit." as the attacker's stun.)
 *
 * Q: Opponent moves (Vilemaw) to an UNCONTROLLED battlefield, opening a showdown; I Ride the Wind a bigger unit
 *    there. Who is attacker/defender? If the opponent stuns my larger unit, who recalls and who conquers?
 * A: The opponent, who applied Contested by moving in first, is the attacker; you are the defender. If they stun
 *    your larger unit it deals no combat damage but survives; the attacker failed to clear the defenders, so the
 *    ATTACKER's unit is recalled; your unit remains, you establish control and conquer — even though you were
 *    not the one who contested the battlefield.
 * Rules: 316.8.b (showdown at an empty battlefield), 464.2 (attacker = player who applied Contested),
 *        466.3–466.5 (attackers recalled unless all defenders gone; remaining side takes control → conquer),
 *        741 (Stunned: deals no combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VILEMAW = "unl-060-219";
const RIDE_THE_WIND = "ogn-173-298";
const RUNE_PRISON = "ogn-050-298";

/** P2's turn. bf1 is uncontrolled and empty. P2: Vilemaw (8) + Rune Prison. P1: Titan (10) in base + Ride the Wind. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "base", VILEMAW, "vilemaw")
    .unit(P1, "base", { might: 10, name: "Titan" }, "titan")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, RUNE_PRISON, "prison");
}

async function passWhileOnChain(game: Game, card: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !game.chain().some((c) => c.cardId === card)) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** P2 walks Vilemaw onto empty bf1; in the showdown P1 Rides the Wind Titan to bf1. Stops with P2 holding Focus. */
async function vilemawInTitanFollows(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("vilemaw", "bf1");
  // A non-combat showdown opened at the empty battlefield; P2 (who contested it) has Focus first.
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "titan" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // P1 chooses the destination
  await game.p1.pick("battlefield-bf1");
  await passWhileOnChain(game, "rtw");
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling 10a5e8f8befd1db0 — Ride the Wind into the opponent's empty-battlefield showdown: they attack, you defend; a stunned-but-alive defender still conquers", () => {
  test("roles: after Titan rides in, Vilemaw (moved first / applied Contested) is the ATTACKER and Titan (readied) is the DEFENDER; bf1 still uncontrolled", async () => {
    const game = await vilemawInTitanFollows();
    expect(game.locationOf("titan")).toBe("bf1");
    expect(game.state("titan").isReady).toBe(true);
    expect(game.state("vilemaw").combatRole).toBe("attacker");
    expect(game.state("titan").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contestedBy: P2, controller: null });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("ruling 10a5e8f8befd1db0 — P2 stuns Titan; combat: Titan deals nothing but survives Vilemaw's 8 → attacker Vilemaw is RECALLED to base, Titan stays, P1 takes control of bf1 and CONQUERS (+1) on P2's turn", async () => {
    const game = await vilemawInTitanFollows();
    // Focus is with P2 (attacker) again; they stun the larger defender.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("prison", { targets: "titan" });
    await passWhileOnChain(game, "prison");
    expect(game.state("titan").isStunned).toBe(true);
    // Both pass Focus → combat resolves.
    await game.settle();
    expect(game.state("vilemaw")).toMatchObject({ damage: 0, location: "base", zone: "base" }); // recalled, unharmed (Titan was stunned)
    expect(game.state("titan")).toMatchObject({ location: "bf1", zone: "battlefield-bf1" }); // 8 < 10: survived
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // the defender conquered
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no stun: Titan (10) kills Vilemaw (8) outright; same end result for control (P1 conquers bf1), Vilemaw in the trash instead of recalled", async () => {
    const game = await vilemawInTitanFollows();
    await game.settle();
    expect(game.zoneOf("vilemaw")).toBe("trash");
    expect(game.locationOf("titan")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
