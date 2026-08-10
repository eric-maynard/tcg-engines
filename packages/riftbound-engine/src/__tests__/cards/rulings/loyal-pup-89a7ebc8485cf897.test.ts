/**
 * Ruling 89a7ebc8485cf897 — Loyal Pup (SFD-126 → sfd-126-221) · 3 Might · Chaos
 *   "When you defend at a battlefield, you may move me there."
 *
 * Q: Does Loyal Pup trigger when the opponent moves to an EMPTY (open) battlefield?
 * A: No. Moving to an unoccupied battlefield opens a NON-COMBAT showdown; nobody is a defender there, so
 *    "when you defend" abilities do not trigger. Only a move into a battlefield where you have units
 *    starts a Combat in which you defend.
 * Rules: 446.1 / 344 (non-combat showdown at an empty battlefield), 447.1 (combat needs opposing units),
 *        464.2 (attacker/defender designations only in combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LOYAL_PUP = "sfd-126-221";

/**
 * P2's turn. P1: Loyal Pup in base, a Guard (2) holding bf1. bf2 is empty/uncontrolled.
 * P2: Raider (4) in base ready to move.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", LOYAL_PUP, "pup")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 89a7ebc8485cf897 — Loyal Pup does not trigger off a move to an empty battlefield", () => {
  test("Raider moves to EMPTY bf2: a non-combat showdown opens, P1 defends nowhere — no Loyal Pup prompt, no trigger on the chain, Pup stays in base", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf2");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2", isCombatShowdown: false });
    // Nothing was triggered for P1: no opt-in, no chain item.
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").combatRole).toBeFalsy();
    await game.settle();
    expect(game.locationOf("pup")).toBe("base");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // P2 simply conquers the open battlefield
    expect(game.locationOf("raider")).toBe("bf2");
  });

  test("contrast — Raider moves into bf1 where P1's Guard is: that is a COMBAT, P1 defends, and Loyal Pup's 'you may move me there' is offered to P1; accepting moves the Pup to bf1", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "pup" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pup", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.locationOf("pup")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
