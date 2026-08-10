/**
 * Ruling 6c60d3f2c358cf0f — Tryndamere, Barbarian (OGN-034 → ogn-034-298) · 8 Might
 *     "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Tryndamere attacks a battlefield held by one unit; Hidden Blade kills that unit before combat damage. Does Tryndamere's
 *    extra-point ability still trigger when he conquers?
 * A: No. With the defender gone before the damage step, no combat damage — hence no excess damage — was ever assigned, so
 *    the "5 or more excess" condition is not met: he conquers for the normal point only.
 * Rules: 465.2 (damage assignment happens only in the combat damage step), 466.5 (conquer with no defenders), Tryndamere text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P2 holds bf1 with a lone Pawn (2) and — optionally — P2's own facedown Hidden Blade there. P1's Tryndamere (8) attacks. */
function board(withBlade: boolean) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "base", TRYNDAMERE, "trynd")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return withBlade ? s.facedown(P2, "bf1", HIDDEN_BLADE, "blade") : s;
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 6c60d3f2c358cf0f — no defender at damage time ⇒ no excess damage ⇒ Tryndamere scores only the conquer point", () => {
  test("control: Tryndamere attacks the lone 2-Might Pawn, assigns 8 (6 excess), conquers and scores 1 + 1 = 2", async () => {
    const game = await board(false).build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("P2 flips its Hidden Blade on its own Pawn during the showdown: the Pawn dies to the Blade (P2 draws 2) BEFORE any combat damage exists", async () => {
    const game = await board(true).build();
    await game.p1.move("trynd", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1" });
    expect(game.state("trynd").combatRole).toBe("attacker");
    await game.p1.passFocus();
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade", { answers: ["pawn"] });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.state("trynd").damage).toBe(0);
    expect(game.p1.points()).toBe(0); // nothing conquered yet
  });

  test("Tryndamere then takes the empty battlefield: he conquers (1 point) but his ability does NOT trigger — no second point, nothing on the chain", async () => {
    const game = await board(true).build();
    await game.p1.move("trynd", "bf1");
    await game.p1.passFocus();
    await game.p2.reveal("blade", { answers: ["pawn"] });
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("trynd")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
