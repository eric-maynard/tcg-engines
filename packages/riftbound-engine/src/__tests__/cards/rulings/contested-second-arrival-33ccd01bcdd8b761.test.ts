/**
 * Ruling 33ccd01bcdd8b761 — (no specific card) one player moves to an empty battlefield, the opponent
 * then moves in with a spell: who is the attacker, and what happens with showdowns?
 *
 * Q: P1 moves a unit to an empty battlefield; P2 answers with a spell that moves their unit to the same
 *    battlefield. Who attacks, and how many showdowns happen?
 * A (riftjudge): the player who FIRST made the battlefield Contested is the attacker and the second
 *    mover is the defender — but the answer then claims two showdowns in sequence, because "an open
 *    showdown cannot become a contested one".
 * Engine: the attacker/defender half is exactly right; the "two showdowns" half is not — CR 344.1 /
 *    464.1 say a showdown already ongoing at that battlefield BECOMES a Combat Showdown.
 * Rules: 190.3.a / 450 (arrival applies Contested), 344 / 344.1 (a showdown already ongoing becomes a
 *        Combat Showdown), 464.1, 464.2.c.1 (attacker = who applied Contested), 464.2.c.3.a (a unit
 *        arriving later gains its designation in the following Cleanup), 466.5.d (Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Reaction] "Move a friendly unit." */
const RUSH = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Rush",
  rulesText: "[Reaction] Move a friendly unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Intruder" }, "intruder")
    .hand(P2, RUSH, "rush");
}

/** P1 walks into the empty bf1 (open showdown), P2 answers by moving in with a Reaction spell. */
async function bothArrived(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({
    active: true,
    attackingPlayer: P1,
    battlefieldId: "bf1",
    focusPlayer: P1,
    isCombatShowdown: false,
  });
  await game.p1.passFocus();
  await game.p2.cast("rush", { answers: ["bf1"], targets: "intruder" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling 33ccd01bcdd8b761 — a second player moving in during an open showdown", () => {
  test("attacker/defender: P1, who first made bf1 Contested, is the ATTACKER; P2, who moved in second, is the DEFENDER", async () => {
    const game = await bothArrived();
    expect(game.locationOf("intruder")).toBe("bf1");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, defendingPlayer: P2 });
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    // 464.2.c.3.a — the newcomer picks up its designation in the Cleanup after it arrived
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("intruder").combatRole).toBe("defender");
  });

  // RULING-CONFLICT: riftjudge 33ccd01bcdd8b761 says the open showdown must finish as its own showdown
  // and a SECOND showdown then begins with the newcomer attacking ("it is not possible to change the
  // type of showdown you are in"); CR 344.1 ("If a Showdown is already ongoing at that Battlefield, it
  // will become a Combat Showdown and a Combat will initiate there") and 464.1 say otherwise — engine
  // follows CR: the SAME showdown flips to a combat showdown, and there is never a second one.
  test("the ongoing open showdown BECOMES a combat showdown — one showdown, not two (344.1)", async () => {
    const game = await bothArrived();
    const stack = game.gameState.interaction?.showdownStack ?? [];
    expect(stack.length).toBe(1);
    expect(stack[0]).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });

  test("that one showdown resolves as combat: the 4-Might attacker kills the 3-Might newcomer and CONQUERS bf1", async () => {
    const game = await bothArrived();
    await game.settle();
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toEqual([]);
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — nobody contests: a lone arrival's open showdown closes as a non-combat showdown and conquers", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)?.isCombatShowdown).toBe(false);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
