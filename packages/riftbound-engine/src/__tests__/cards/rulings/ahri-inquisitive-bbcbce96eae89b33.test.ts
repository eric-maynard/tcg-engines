/**
 * Ruling bbcbce96eae89b33 — Ahri, Inquisitive (OGN-119 → ogn-119-298) 3 Might "When I attack or defend, give an enemy unit here
 *   -2 [Might] this turn, to a minimum of 1 [Might]." × Wielder of Water (OGN-055 → ogn-055-298) 2 Might "While I'm attacking or
 *   defending alone, I have +2 [Might]."
 *
 * Q: Ahri attacks a lone defending Wielder of Water — does the Wielder get +2 before or after Ahri's -2?
 * A: Before. The Wielder's passive applies as soon as combat begins (2 → 4); Ahri's trigger resolves afterwards (4 → 2). In the
 *    arithmetic layer additions come before subtractions, so the result is 2 — not "2 − 2 → min 1, then +2 = 3".
 * Rules: 522 (statics are continuous), 464 (attack triggers on the initial combat chain), layer arithmetic (add before subtract).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const WIELDER = "ogn-055-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P2 holds bf1 with a lone Wielder of Water (2). P1's Ahri (3) attacks from base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WIELDER, "wielder")
    .unit(P1, "base", AHRI, "ahri");
}

async function ahriAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.state("wielder").might).toBe(2); // not in combat yet
  await game.p1.move("ahri", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  return game;
}

describe("Ruling bbcbce96eae89b33 — Wielder of Water is +2 the moment combat begins; Ahri's -2 lands afterwards → 2 Might", () => {
  test("combat begins: the Wielder (defending alone) is ALREADY 4 while Ahri's trigger (choosing it) is still waiting on the chain", async () => {
    const game = await ahriAttacks();
    expect(game.state("wielder").combatRole).toBe("defender");
    expect(game.state("wielder").might).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, targets: ["wielder"], triggered: true })]);
  });

  test("Ahri's trigger resolves AFTER: 4 − 2 = 2 (the 'minimum 1' floor is not reached, and it is not 1 + 2 = 3)", async () => {
    const game = await ahriAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("wielder")).toMatchObject({ might: 2, mightModifier: -2, zone: "battlefield-bf1" });
    expect(game.state("ahri").might).toBe(3);
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
  });

  test("combat at those numbers: Ahri 3 into Wielder 2 — the Wielder dies, Ahri survives (2 damage taken, healed after combat) and conquers bf1", async () => {
    const game = await ahriAttacks();
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("wielder")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
