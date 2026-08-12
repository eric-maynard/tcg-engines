/**
 * Ruling bf284aa0f1df2c88 — Discipline (OGN-058 → ogn-058-298) · Spell · [2] · [Reaction]
 *   "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: If a unit gets Discipline's temporary +2 and survives a showdown with damage on it, does it keep the increase
 *    after the damage is removed?
 * A: Yes. The +2 lasts the whole turn; it is not spent by taking damage. Damage is wiped when the showdown ends and
 *    the unit is still at printed + 2 until the Ending Phase's Expiration Step.
 * Rules: 317.2.c ("this turn" effects expire in the Ending Phase), 466.6 (damage is removed at the end of combat),
 *        no "health" — [Might] is the only value.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";

/** P2's turn: a 3-[Might] attacker walks into P1's bf1, where a lone 2-[Might] defender waits with Discipline up. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 3, name: "Attacker" }, "atk")
    .hand(P1, DISCIPLINE, "disc")
    .resources(P1, { energy: 2 });
}

describe("Ruling bf284aa0f1df2c88 — Discipline's +2 outlives the damage it soaked", () => {
  test("cast in the showdown it makes the 2-[Might] defender a 4, and draws its card", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "def" });
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("def")).toMatchObject({ might: 4, mightModifier: 2 });
    expect(game.p1.hand().length).toBe(handBefore); // -1 Discipline, +1 drawn
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("it survives the 3 combat damage, the attacker dies to the 4, and after cleanup damage is 0 but the +2 remains", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "def" });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def")).toMatchObject({ damage: 0, might: 4, mightModifier: 2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the defence held
    expect(game.violations()).toEqual([]);
  });

  test("without Discipline the same defender dies to the same attacker — the +2 is what saved it", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("the duration is the turn, not the showdown: it is still +2 after combat and gone once the turn ends", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "def" });
    await game.settle();
    expect(game.state("def").might).toBe(4);
    await game.advanceTurn(); // P2's turn ends
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("def")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
