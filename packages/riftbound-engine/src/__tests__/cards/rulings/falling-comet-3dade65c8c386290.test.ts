/**
 * Ruling 3dade65c8c386290 — Falling Comet (OGN-085 → ogn-085-298) · Spell · [Action] · [5]
 *   "Deal 6 to a unit at a battlefield."
 *
 * Q: Can Falling Comet be played in the showdown that opens when an opponent moves a unit to an
 *    UNCONTESTED (empty) battlefield?
 * A: Yes. Moving to an empty battlefield begins a Showdown (no combat). A showdown is an Open State, so
 *    both [Action] and [Reaction] cards may be played there. The mover holds Focus first; once they pass,
 *    you may play Falling Comet and start a chain.
 *    (And a unit killed by the spell is gone before any combat damage step — it deals none.)
 * Rules: 344 / 446.1 (a move to a battlefield begins a showdown), 310.3 (Showdown Open = an Open State,
 *        [Action] speed), 345 (the contesting player has Focus first), 338.1 (playing a card makes a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_COMET = "ogn-085-298";

/** P2's turn. bf1 is empty and uncontrolled; P2 has a 3-Might Runner in base. P1 holds Falling Comet with [5]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, FALLING_COMET, "comet");
}

/** P2 walks onto the empty battlefield. Stops in the open showdown, Focus with P2. */
async function walkedIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("runner", "bf1");
  return game;
}

describe("Ruling 3dade65c8c386290 — Falling Comet is playable in the showdown opened by a move onto an empty battlefield", () => {
  test("the move opens a SHOWDOWN, not a combat: bf1 is contested, nobody has an attacker/defender designation, and P2 holds Focus", async () => {
    const game = await walkedIn();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.state("runner").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.decision()).toBeNull(); // P1 has to wait for Focus
  });

  test("ruling: once P2 passes Focus, P1 may play the [Action] Falling Comet — it starts a chain", async () => {
    const game = await walkedIn();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "comet")).toBe(true);
    await game.p1.cast("comet", { targets: "runner" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P1, targets: ["runner"] })]);
    expect(game.p1.energy()).toBe(0);
  });

  test("it resolves for 6 and kills the 3-Might Runner; the showdown then closes with nobody at bf1, so it stays uncontrolled", async () => {
    const game = await walkedIn();
    await game.p2.passFocus();
    await game.p1.cast("comet", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — killed by the spell, the attacker never reaches the combat damage step: P1's defender takes nothing", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .hand(P1, FALLING_COMET, "comet")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    await game.p2.passFocus();
    await game.p1.cast("comet", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.state("warden").damage).toBe(0); // the dead Raider dealt no combat damage
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
