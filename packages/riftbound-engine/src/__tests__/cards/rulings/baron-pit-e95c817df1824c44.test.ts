/**
 * Ruling e95c817df1824c44 — Baron Pit (UNL-T01 → unl-t01) · Battlefield token · "Units can move here from anywhere."
 *   × Baron Nashor (UNL-147 → unl-147-219) · Unit · Chaos · 10 + [chaos]×3 · 12 Might
 *     "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you do, I enter there. …"
 *
 * Q: When Baron is played, does a showdown start or is the Baron Pit conquered immediately?
 * A: A NON-COMBAT showdown starts: Baron entering the fresh, uncontrolled Pit makes it Contested; no attacker/defender is
 *    designated, but both players get the alternating Focus window. It is NOT conquered immediately — control (the Conquer
 *    and its point, if not already scored there this turn) is established only when the showdown ends.
 * Rules: 445/190.3.a (contested), 344.2 (non-combat showdown), 348.2.a / 348.2.a.1 (control at its end), 464.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
/** A 1-cost [Action] spell for P2, to show the showdown is a real window for the non-turn player. */
const JAB = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Jab",
  timing: "action",
} as const;

/** P1's turn with exactly 10 + [chaos]×3 and Baron in hand; bf1 is P2's (Guard 2), bf2 nobody's. P2 holds Jab + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P1, BARON_NASHOR, "baron")
    .hand(P2, JAB, "jab");
}

const pitOf = (game: Game): string => game.battlefields().find((b) => b !== "bf1" && b !== "bf2") as string;

describe("Ruling e95c817df1824c44 — playing Baron Nashor opens a non-combat showdown at the Baron Pit; the conquer comes at its end", () => {
  test("Baron enters the new Baron Pit, which becomes Contested by P1; a NON-COMBAT showdown is open (P1 has Focus, no combat roles) and nothing is conquered or scored yet", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    const pit = pitOf(game);
    expect(pit).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit);
    expect(game.gameState.battlefields[pit]).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: pit, isCombatShowdown: false });
    expect(game.state("baron").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
  });

  test("it is a real window: after P1 passes Focus, P2 holds Focus in that showdown and may play an [Action] spell there", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "jab")).toBe(true);
    expect(game.gameState.battlefields[pitOf(game)]).toMatchObject({ contested: true, controller: null }); // still not conquered
    expect(game.p1.points()).toBe(0);
  });

  test("both pass Focus → the showdown ends, P1 establishes control of the Pit = Conquer, and scores 1", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    await game.p1.passFocus();
    await game.p2.passFocus();
    const pit = pitOf(game);
    expect(game.gameState.battlefields[pit]).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toContain(pit);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
