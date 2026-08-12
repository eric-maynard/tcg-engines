/**
 * Ruling 9f3531b0b31eacb2 — (no specific card) when a Legend ability may be activated.
 *   Exercised with Blind Monk (OGN-257 → ogn-257-298), Lee Sin's legend: "[1], [Exhaust]: Buff a
 *   friendly unit." — no [Action], no [Reaction].
 *
 * Q: At what points in the game can you activate a legend ability such as Lee Sin's buff?
 * A: Legend abilities follow the same timing rules as spells. Without an [Action] or [Reaction] tag the
 *    ability has the slowest speed there is: your own turn only, in an Open State, and never inside a
 *    showdown or while a chain is up.
 * Rules: 155 (base speed = your turn, Open State, outside Showdowns), 806.1.a/806.1.c.2 ([Action] on an
 *        activated ability = showdowns on any turn), 813.1.c.2 ([Reaction] on an activated ability =
 *        Closed States on any turn), 376 (activated abilities).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLIND_MONK = "ogn-257-298";

/** [Reaction] "Deal 1 to a unit." — used only to force a Closed State. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** P1's turn. Blind Monk in the legend zone, a friendly unit to buff, an enemy-held bf1 to attack. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .legend(P1, BLIND_MONK, "monk")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, STING, "sting");
}

describe("Ruling 9f3531b0b31eacb2 — a Legend ability with no [Action]/[Reaction] is base speed", () => {
  test("it works on your own turn, in an Open State with an empty chain", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "monk")).toBe(true);
    await game.p1.activate("monk", 0, { answers: ["ally"] });
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("it is NOT available during a showdown", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.p1.can("activate", "monk")).toBe(false);
    expect((await game.p1.try((p) => p.activate("monk"))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("it is NOT available while a chain is up (a Closed State)", async () => {
    const game = await board().build();
    await game.p1.cast("sting", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sting"]);
    expect(game.p1.can("activate", "monk")).toBe(false);
    expect((await game.p1.try((p) => p.activate("monk"))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("it is NOT available on the opponent's turn", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "monk")).toBe(false);
    expect((await game.p1.try((p) => p.activate("monk"))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
