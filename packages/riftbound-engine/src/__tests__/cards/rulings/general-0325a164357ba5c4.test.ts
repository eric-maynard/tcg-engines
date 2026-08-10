/**
 * Ruling 0325a164357ba5c4 — (general rules question; illustrated with Hidden Blade OGN-213 → ogn-213-298:
 *   [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2.")
 *
 * Q: I hold a battlefield; my opponent attacks and starts a showdown; I reveal a hidden card and win the showdown. Do I get
 *    a conquer point?
 * A: No. Conquering scores only when you GAIN control of a battlefield. Successfully defending one you already control just
 *    keeps control — it is not (re)conquered, so no point. (You still Hold-score it normally on your own turn.)
 * Rules: 190.4 / 348.2.a (control is only established if you don't already control it), 442.1 (Conquer = gaining control),
 *        442.2 (Hold), 811 (hidden card played as a Reaction for [0]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";

/** P2's turn. P1 holds bf1 with a Keeper (2) and a face-down Hidden Blade; P2's Raider (5) attacks from base. Nobody has points. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Keeper" }, "keeper")
    .facedown(P1, "bf1", HIDDEN_BLADE, "hb")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 1, name: "Squatter" }, "squatter");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Raider attacks bf1; P2 passes Focus; P1 flips Hidden Blade on the Raider and it resolves. */
async function defendWithHiddenBlade(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toBeDefined();
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("keeper").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "hb")).toBe(true);
  await game.p1.reveal("hb", { answers: ["raider"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hb", controller: P1, targets: ["raider"] })]);
  expect(game.p1.energy()).toBe(0); // [0] from face-down
}

describe("Ruling 0325a164357ba5c4 — winning a showdown at a battlefield you already control is a defence, not a Conquer: no point", () => {
  test("P1's flipped Hidden Blade kills the attacking Raider (P2 draws 2); the showdown ends with only P1's Keeper there — P1 KEEPS bf1 but scores NOTHING (0 points, nothing marked scored this turn)", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await defendWithHiddenBlade(game);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2); // "its controller draws 2"
    expect(game.zoneOf("hb")).toBe("trash");
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("keeper")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.points()).toBe(0); // no conquer point for a successful defence
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).not.toContain("bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("…and control being continuous, P1 simply Hold-scores bf1 at the start of P1's next turn (1 point) — the normal way a held battlefield pays", async () => {
    const game = await board().build();
    await defendWithHiddenBlade(game);
    await game.settle();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // P2 ends → P1's turn: Hold scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("contrast: GAINING control does score — if the Raider instead attacks and wins (no Hidden Blade flipped), P2 conquers bf1 for 1 point", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("hb")).toBe("trash"); // the loser's face-down card is trashed
  });
});
