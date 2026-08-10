/**
 * Ruling 8ed50fbca9c6e1a4 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · 2+[chaos] "Move a friendly unit and ready it."
 *   × Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · [Shield] (+1 [Might] while I'm a defender) — one on EACH side.
 *
 * Q: The opponent's Stalwart Poro just moved into an open battlefield (contesting it). I Ride the Wind MY Stalwart Poro there.
 *    Is my Poro a 3-Might defender?
 * A: Yes. After Ride the Wind resolves the (non-combat) showdown continues until both pass; with units of both players there
 *    a COMBAT showdown then begins which remembers who applied Contested: the opponent attacks, I defend by default — my Poro
 *    has Shield live (3), theirs does not (2).
 * Rules: 459–464 (showdowns), 323.14 (combat staged at an ongoing non-combat showdown → it becomes the combat showdown),
 *        464.2.c (attacker = the player who made the battlefield Contested), Shield (only while a defender).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const STALWART_PORO = "ogn-052-298";

/** P2's turn. bf1 open and empty. P2's Stalwart Poro in base; P1's Stalwart Poro in base with Ride the Wind and exactly 2+[chaos]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", STALWART_PORO, "theirs")
    .unit(P1, "base", STALWART_PORO, "mine")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 2, power: { chaos: 1 } });
}

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** Their Poro walks into open bf1 (non-combat showdown, P2 Focus); P2 passes; P1 rides its Poro in; Ride the Wind resolves. */
async function theirsInThenMineRidesIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("theirs", "bf1");
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "mine" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("mine")).toBe("bf1");
  expect(game.state("mine").isReady).toBe(true);
  return game;
}

describe("Ruling 8ed50fbca9c6e1a4 — Poro vs Poro: the Ride-the-Wind arrival defends (3), the one who contested attacks (2)", () => {
  test("right after Ride the Wind resolves there is still exactly ONE showdown open at bf1 (never two at once), bf1 is uncontrolled and P2 has NOT scored for walking in", async () => {
    const game = await theirsInThenMineRidesIn();
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
    // (Current CR 323.14: with combat now staged there, the ongoing showdown simply becomes the combat showdown.)
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contestedBy: P2, controller: null });
  });

  test("the combat showdown remembers P2 applied Contested: P2 is the attacker (their Poro 2, no Shield), P1 defends and MY Poro is 3 with Shield — before anything is scored", async () => {
    const game = await theirsInThenMineRidesIn();
    for (let i = 0; i < 6 && !(stack(game)[0]?.isCombatShowdown ?? false); i++) {
      await game.acting().pass();
    }
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("theirs")).toMatchObject({ combatRole: "attacker", might: 2 });
    expect(game.state("mine")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.p2.points()).toBe(0);
  });

  test("it decides the fight: 3 vs 2 — their Poro dies, mine survives and P1 ends up conquering bf1; P2 never scores it", async () => {
    const game = await theirsInThenMineRidesIn();
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.state("mine")).toMatchObject({ combatRole: null, damage: 0, might: 2 }); // Shield off again after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
