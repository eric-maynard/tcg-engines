/**
 * Ruling ad7ff11b08dd086e — Wielder of Water (OGN-055 → ogn-055-298) · Unit · Calm · [3][calm] · 2 Might
 *     "While I'm attacking or defending alone, I have +2 [Might]."
 *
 * Q: Does Wielder of Water get its +2 when it "attacks" an EMPTY battlefield?
 * A: Moving onto an open battlefield opens a showdown but never a combat, so no attacker/defender designation is
 *    made there and the ruling's own arithmetic lands on the printed value: "Wielder of Water has 2". It is only
 *    once a combat exists (an enemy unit at the battlefield) that Wielder is an attacker and stands at 4.
 * Rules: 464.2 (attacker/defender designations belong to a COMBAT), 348.2.a (a non-combat showdown closes into
 *        scoring without a combat step), 740.2.a ("alone" = the only friendly unit there).
 *
 * NOTE: the ruling's headline sentence ("gets the +2 bonus when moving to an empty battlefield") contradicts its
 * own conclusion two clauses later ("the combat step does not open, so Wielder of Water has 2"). The concrete
 * number is what is encoded here, and it is what the engine does.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIELDER_OF_WATER = "ogn-055-298";

/** P1's turn 3. Wielder waits in P1's base; bf2 is open unless the caller seats a P2 unit there. */
function board(bf2: "open" | "enemy") {
  const b = scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: bf2 === "enemy" ? P2 : null })
    .unit(P1, "base", WIELDER_OF_WATER, "wielder")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder");
  return bf2 === "enemy" ? b.unit(P2, "bf2", { might: 1, name: "Squatter" }, "squatter") : b.unit(P2, "base", { might: 1, name: "Scout" }, "scout");
}

/** Pass focus/priority for whoever is asked until the position is open again. */
async function passUntilOpen(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling ad7ff11b08dd086e — moving onto an EMPTY battlefield opens a showdown but no combat, so Wielder of Water stays at 2", () => {
  test("intermediate fact: the move does open a showdown at the empty bf2 and makes it contested by P1", async () => {
    const game = await board("open").build();
    await game.p1.move("wielder", "bf2");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
  });

  test("…but no combat opens there, so Wielder is given no attacker designation and has its printed 2 Might", async () => {
    const game = await board("open").build();
    await game.p1.move("wielder", "bf2");
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
    await passUntilOpen(game);
    expect(game.state("wielder").might).toBe(2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // it still conquers the open battlefield
    expect(game.violations()).toEqual([]);
  });

  test("control: with an enemy unit sitting at bf2 the same move IS a combat — Wielder is the attacker and stands at 2 + 2 = 4", async () => {
    const game = await board("enemy").build();
    await game.p1.move("wielder", "bf2");
    expect(game.state("wielder").combatRole).toBe("attacker");
    expect(game.state("wielder").might).toBe(4);
  });

  test("…and the bonus is only 'alone': a second friendly unit arriving with it takes Wielder back to 2", async () => {
    const game = await board("enemy").unit(P1, "base", { might: 2, name: "Comrade" }, "comrade").build();
    await game.p1.move(["wielder", "comrade"], "bf2");
    expect(game.state("wielder").combatRole).toBe("attacker");
    expect(game.state("wielder").might).toBe(2);
  });
});
