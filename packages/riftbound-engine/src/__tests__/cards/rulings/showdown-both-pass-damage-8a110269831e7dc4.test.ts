/**
 * Ruling 8a110269831e7dc4 — (no specific card) the moment both players pass Focus in a combat.
 *   Stand-ins: inline "Test Reflex" ([Reaction] +2 [Might] this turn) in both hands — the card neither
 *   player is allowed to squeeze in.
 *
 * Q: If both players pass in sequence during combat, does either of them get one last window for a
 *    Reaction before combat damage?
 * A: No. Two passes in a row on an empty chain close the showdown and combat goes straight to the damage
 *    step; there is no extra priority round in between.
 * Rules: 348 / 347.2.a (all players passing Focus in sequence closes the showdown), 348.1 (a combat
 *        showdown then proceeds with the remaining steps of combat), 463 / 465 (the damage step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REACTION_SPELL = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Reflex",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** P1's turn. A 4-Might Raider attacks P2's 5-Might Guard: the Reaction nobody gets to play would flip it. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, REACTION_SPELL, "react1")
    .hand(P2, REACTION_SPELL, "react2");
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).at(-1);
}

describe("Ruling 8a110269831e7dc4 — two passes in a row and combat damage happens with no further window", () => {
  test("after the attacker passes, the defender still has a real window — this is the last one", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.p2.can("cast", "react2")).toBe(true);
  });

  test("the defender passes too: the showdown closes and the only thing outstanding is the combat procedure — the DEFENDER is offered nothing at all", async () => {
    // autoProcedures(false) freezes the game between "showdown closed" and "damage dealt" so the gap the
    // ruling asks about can be inspected. (The turn is back in P1's own open Main Phase here, which is why
    // the TURN PLAYER's ordinary main-phase menu is listed; the defender's window is the one at issue.)
    const game = await board().autoProcedures(false).build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdown(game)?.active).toBeFalsy();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "action", seat: P1 });
    expect(d?.kind === "action" ? d.options.map((o) => o.verb) : []).toContain("resolveCombat");
    // the defender's whole menu is the pending procedure — not one card of theirs is offered
    expect(game.p2.legal().map((o) => o.verb).filter((v) => v === "cast" || v === "play")).toEqual([]);
    expect(game.p2.can("cast", "react2")).toBe(false);
    expect((await game.p2.try((p) => p.cast("react2", { targets: "guard" }))).ok).toBe(false);
    // both units are still standing and undamaged — damage has not been dealt yet, and cannot be answered
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("no priority round is inserted between the two passes and the damage: the defender is never asked anything after their own pass", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    await game.p2.passFocus();
    // one call later the combat is already history — nobody was handed priority in between
    expect(game.decision()).toMatchObject({ context: "main", seat: P1 });
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("with the harness running procedures normally, the two passes take the game straight through damage into the Main Phase", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("raider")).toBe("trash"); // 5 ≥ 4: the Reflex that was never castable would have saved it
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toContain("react1"); // still in hand, unplayable
    expect(game.violations()).toEqual([]);
  });
});
