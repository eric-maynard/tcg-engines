/**
 * Ruling 024f3cc25a976126 — (general rules question, no specific card)
 *
 * Q: Does a non-combat Showdown heal units?
 * A: No. Units heal only during Combat cleanup (after a COMBAT showdown — units of different players present) and at the
 *    end of each turn. A non-combat showdown (a contested battlefield where only one player has units) is not a combat, so
 *    nothing is healed when it ends.
 * Rules: 344 (non-combat showdown), 466.1.a.1 (Combat Cleanup inserts "Heal all Units"), 317.2 (end-of-turn heal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn. bf1 is open; P2 holds bf2 with a 1-Might Weakling. P1's Veteran (5) carries 2 damage; a damaged Bystander (4, 1 dmg)
 * stays home throughout. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Weakling" }, "weakling")
    .unit(P1, "base", { might: 5, name: "Veteran" }, "vet", { damage: 2 })
    .unit(P1, "base", { might: 4, name: "Bystander" }, "bystander", { damage: 1 });
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

describe("Ruling 024f3cc25a976126 — a non-combat showdown heals nobody", () => {
  test("Veteran (2 damage) walks into OPEN bf1: a non-combat showdown opens and closes (both pass), P1 conquers — and the Veteran STILL has its 2 damage (the Bystander keeps its 1, too)", async () => {
    const game = await board().build();
    expect(game.state("vet").damage).toBe(2);
    await game.p1.move("vet", "bf1");
    expect(showdown(game)).toBeDefined();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: null });
    expect(game.p2.units("bf1")).toEqual([]); // only one player has units here ⇒ non-combat
    expect(game.state("vet").combatRole).not.toBe("attacker");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("vet")).toMatchObject({ damage: 2, zone: "battlefield-bf1" }); // NOT healed
    expect(game.state("bystander").damage).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a COMBAT showdown does heal: the same Veteran attacks P2's Weakling at bf2, wins, and the Combat Cleanup heals ALL units (466.1.a.1) — Veteran 0 damage, and even the Bystander at home is healed", async () => {
    const game = await board().build();
    await game.p1.move("vet", "bf2");
    expect(game.state("vet").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("weakling")).toBe("trash");
    expect(game.state("vet")).toMatchObject({ damage: 0, zone: "battlefield-bf2" }); // 2 old + 1 from the Weakling, all healed
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("bystander").damage).toBe(0);
  });

  test("contrast — the end of the turn heals everything: after the non-combat conquer, ending P1's turn clears the Veteran's and the Bystander's damage", async () => {
    const game = await board().build();
    await game.p1.move("vet", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.state("vet").damage).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("vet").damage).toBe(0);
    expect(game.state("bystander").damage).toBe(0);
    expect(game.trace().expiration[0]?.healed ?? []).toEqual(expect.arrayContaining(["vet", "bystander"]));
  });
});
