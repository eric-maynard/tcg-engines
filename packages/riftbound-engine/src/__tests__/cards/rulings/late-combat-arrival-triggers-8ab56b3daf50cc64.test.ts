/**
 * Ruling 8ab56b3daf50cc64 — (no specific card) units that join a combat after the opening chain.
 *   Exercised with Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *
 * Q: A unit arrives at the battlefield after the opening "when I attack/defend" chain has already
 *    resolved. Does it still get its own "when I attack" / "when I defend" effect?
 * A: Yes. A unit that becomes present later gains the Attacker or Defender designation in the Cleanup
 *    after the action that brought it, and gaining that designation for the first time this combat is
 *    exactly what the trigger asks for. (Opening order, for reference: attacker triggers go on the
 *    chain first, other players in turn order, defender last.)
 * Rules: 464.2.c.3.a (a later arrival gains the designation in the following Cleanup),
 *        464.2.e.1 (attacker places first, defender last), 340.1 (LIFO), 807.1.d (attacker = designated).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** "When I attack, draw 1." */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 3,
  name: "Test Herald",
  rulesText: "When I attack, draw 1.",
} as const;

/** "When I defend, draw 1." */
const SENTRY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 3,
  name: "Test Sentry",
  rulesText: "When I defend, draw 1.",
} as const;

/** P1's turn. P2 holds bf1 with a plain Wall; P1 has a plain Vanguard to open combat and a Herald waiting at base. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 1, name: "Vanguard" }, "vanguard")
    .unit(P1, "base", HERALD, "herald")
    .unit(P2, "base", SENTRY, "sentry")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, RIDE_THE_WIND, "ride2");
}

describe("Ruling 8ab56b3daf50cc64 — a unit that joins the combat later still gets its attack/defend trigger", () => {
  test("premise: the opening chain contains only the units present at the start (here: nothing triggers)", async () => {
    const game = await board().build();
    await game.p1.move("vanguard", "bf1");
    expect(game.state("vanguard").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]); // neither has a trigger
    expect(game.state("herald").combatRole).not.toBe("attacker");
    expect(game.violations()).toEqual([]);
  });

  test("the ATTACKER walks a Herald in mid-showdown: it becomes an attacker and 'when I attack' fires", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p1.move("vanguard", "bf1");
    await game.p1.cast("ride", { targets: "herald", answers: ["bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves; the Herald arrives mid-combat
    expect(game.locationOf("herald")).toBe("bf1");
    expect(game.state("herald").combatRole).toBe("attacker"); // 464.2.c.3.a
    // …and its late "when I attack" is a real chain item.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
    await game.settle({ maxSteps: 200 });
    expect(game.p1.hand().length).toBe(before); // -1 Ride the Wind, +1 the late trigger's draw
    expect(game.violations()).toEqual([]);
  });

  test("the DEFENDER walks a Sentry in mid-showdown: it becomes a defender and 'when I defend' fires", async () => {
    const game = await board().build();
    await game.p1.move("vanguard", "bf1");
    const before = game.p2.hand().length;
    await game.p1.passFocus();
    await game.p2.cast("ride2", { targets: "sentry", answers: ["bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ride the Wind resolves; the Sentry arrives mid-combat
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.state("sentry").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
    await game.settle({ maxSteps: 200 });
    expect(game.p2.hand().length).toBe(before); // -1 Ride the Wind, +1 late "when I defend"
    expect(game.violations()).toEqual([]);
  });

  test("reference for the opening order — attacker's trigger is appended first, defender's last, so the defender's resolves first (see sibling ruling 3fc626654cfb615c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SENTRY, "sentry")
      .unit(P1, "base", HERALD, "herald")
      .build();
    await game.p1.move("herald", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald", "sentry"]);
    expect(game.violations()).toEqual([]);
  });
});
