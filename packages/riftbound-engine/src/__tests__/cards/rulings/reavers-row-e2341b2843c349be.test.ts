/**
 * Ruling e2341b2843c349be — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *
 * Q: In a Combat Showdown at Reaver's Row, if the (only) defending unit leaves the battlefield during the showdown,
 *    does it become a non-combat showdown? Do attacker/defender designations persist?
 * A: A showdown never changes type mid-way. Attacker/defender designations are assigned when combat opens and
 *    persist until combat cleanup, even if units leave; the Combat Showdown continues through all its steps until
 *    Focus has been passed around, and designations are only removed in the combat cleanup.
 * Rules: 445/446 (designations set as combat opens), 464 (showdown proceeds until all pass), 466 (combat cleanup
 *        clears designations; 466.5 — attacker alone remaining wins/conquers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";

/** P2's turn. P1 holds the live Row with a lone 2-Might Lookout; P2's 4-Might Raider attacks from base. */
function board() {
  return scenario()
    .turn(4)
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false, owner: P1 })
    .unit(P1, "row", { might: 2, name: "Lookout" }, "lookout")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P1 takes the Row trigger on the Lookout; the trigger resolves and the Lookout goes to base. */
async function defenderPulledOut(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1, isCombatShowdown: true });
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("lookout").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("lookout"); // the only "friendly unit here" (may be auto-bound)
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, triggered: true })]);
  // Both pass priority → the trigger resolves: Lookout to base.
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.locationOf("lookout")).toBe("base");
  return game;
}

describe("Ruling e2341b2843c349be — the defender leaving Reaver's Row mid-showdown does not turn the combat into a non-combat showdown", () => {
  test("after the Lookout is moved to base the showdown at the Row is STILL the same active Combat Showdown (attacking P2 / defending P1), not re-typed, and Focus play continues", async () => {
    const game = await defenderPulledOut();
    expect(game.p1.units("row")).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    // The Row is still contested and still P1's while the combat is ongoing.
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, controller: P1 });
  });

  test("designations persist: the Raider is still the ATTACKER after the defenders are gone (they are only cleared by the combat cleanup)", async () => {
    const game = await defenderPulledOut();
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("the showdown runs to its normal end — Focus passed around with nobody acting — and only the combat cleanup clears roles; the Raider, alone at the Row, conquers it for P2", async () => {
    const game = await defenderPulledOut();
    const seatsWithFocus = new Set<string>();
    for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown"; i++) {
      seatsWithFocus.add(game.actingSeat() as string);
      await game.acting().passFocus();
    }
    expect(seatsWithFocus.size).toBeGreaterThanOrEqual(1);
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.state("raider")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-row" });
    expect(game.state("lookout")).toMatchObject({ combatRole: null, damage: 0, zone: "base" });
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
