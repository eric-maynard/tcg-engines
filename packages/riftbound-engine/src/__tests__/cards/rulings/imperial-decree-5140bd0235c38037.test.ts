/**
 * Ruling 5140bd0235c38037 — Imperial Decree (OGN-221 → ogn-221-298)
 *   "[Action] When any unit takes damage this turn, kill it."
 *   × Nidalee, Cat Form (unl-114-219) · 4 Might · "When I win a combat, draw 1." — standing in for the
 *     ruling's "Draven player draws from their legend" (same "when you win a combat" timing question).
 *
 * Q: Imperial Decree is out and a 1-Might token runs into a lone enemy unit. Does the Decree kill the
 *    defender before its controller gets the "you won the combat" draw?
 * A: No — the draw comes first. Combat damage is dealt, the Decree's kill becomes a PENDING item, and
 *    the winner is then determined with the units that survived the damage still on the board. The
 *    win-combat trigger stacks on top of the Decree trigger, so (LIFO) the draw resolves, then the kill.
 * Rules: 466.3.a (win-combat triggers fire from the combat result), 320 (a pending item waits for the
 *        current game effect to finish), 339 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const NIDALEE = "unl-114-219";

/** P1 casts Imperial Decree, then throws a 1-Might token at P2's lone 4-Might Nidalee. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", NIDALEE, "nid")
    .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .deckTop(P2, { cardType: "spell", energyCost: 8, name: "Fresh" }, "fresh");
}

describe("Ruling 5140bd0235c38037 — the combat result (and its draw) comes before Imperial Decree's kill", () => {
  test("control: without Imperial Decree the defending Nidalee survives, wins the combat and draws", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", NIDALEE, "nid")
      .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
      .deckTop(P2, { cardType: "spell", energyCost: 8, name: "Fresh" }, "fresh")
      .build();

    await game.p1.move("recruit", "bf1");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("nid")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual(["fresh"]); // the win-combat draw
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("intermediate fact: after combat damage the Decree's kill is only a pending Chain item — the defender is still on the board", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");

    await game.p1.move("recruit", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();

    // Damage has been dealt: the 1-Might attacker is dead, Nidalee took 1 and lived.
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("nid")).toBe("battlefield-bf1");
    // The Decree's delayed "kill it" triggers are waiting on the Chain, unresolved.
    expect(game.chain().every((c) => c.cardId === "decree" && c.triggered)).toBe(true);
    expect(game.chain().length).toBeGreaterThanOrEqual(1);
    expect(game.p2.hand()).toEqual([]); // nothing drawn yet either
  });

  // Engine: the Resolution Step is parked while the Decree triggers are on the Chain, so by the time the
  // winner is worked out Nidalee is already dead — no unit is left on either side, the combat is scored a
  // tie, and no "when I win a combat" trigger ever fires. The ruling says the win is determined first.
  test.failing(
    "BUG: ruling 5140bd0235c38037 — the defender's win-combat draw should resolve BEFORE the Decree kill; the engine determines the winner after the kill, so nobody wins and nothing is drawn",
    async () => {
      const game = await board().build();
      await game.p1.cast("decree");
      await game.settle();
      await game.p1.move("recruit", "bf1");
      await game.p1.passFocus();
      await game.p2.passFocus();

      // The win-combat trigger belongs on the Chain ON TOP of the Decree's kill …
      expect(game.chain().at(-1)).toMatchObject({ cardId: "nid", controller: P2, triggered: true });

      await game.settle();
      expect(game.p2.hand()).toEqual(["fresh"]); // … so the draw happens …
      expect(game.zoneOf("nid")).toBe("trash"); // … and only then does the Decree kill it.
    },
  );

  test("what the engine does today: the Decree kills the defender and the combat ends with nobody drawing", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.move("recruit", "bf1");
    await game.settle();

    expect(game.zoneOf("nid")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.p2.hand()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
