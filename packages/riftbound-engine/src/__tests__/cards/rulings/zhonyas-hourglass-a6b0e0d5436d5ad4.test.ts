/**
 * Ruling a6b0e0d5436d5ad4 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can Zhonya's trigger if a unit dies at another battlefield (than where Zhonya's is / was placed)?
 * A: Yes. "If a friendly unit would die" has no location restriction — it is a replacement effect, not a
 *    targeted play ability — so it saves a friendly unit dying anywhere: base, any battlefield, in combat.
 * Rules: 366–373 (replacement effects apply to the event wherever it happens), 145 (gear lives in base).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/**
 * P2's turn. P1: Zhonya's in base; A (2) at bf1, B (3) at bf2, C (1) in base. P2: Bolt + [1], Brute (7) in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "A" }, "a")
    .unit(P1, "bf2", { might: 3, name: "B" }, "b")
    .unit(P1, "base", { might: 1, name: "C" }, "c")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
    .gear(P1, ZHONYAS, "zhonya")
    .hand(P2, BOLT, "bolt");
}

describe("Ruling a6b0e0d5436d5ad4 — Zhonya's Hourglass saves a friendly unit wherever it would die", () => {
  for (const [victim, where] of [
    ["a", "bf1"],
    ["b", "bf2"],
    ["c", "base"],
  ] as const) {
    test(`spell kill at ${where}: ${victim.toUpperCase()} would die → Zhonya's (in base) is killed instead; ${victim.toUpperCase()} healed, exhausted, in base`, async () => {
      const game = await board().build();
      expect(game.locationOf(victim)).toBe(where);
      await game.p2.cast("bolt", { targets: victim });
      await game.settle();
      expect(game.zoneOf("zhonya")).toBe("trash");
      expect(game.zoneOf(victim)).toBe("base");
      expect(game.state(victim)).toMatchObject({ damage: 0, isExhausted: true });
    });
  }

  test("combat death at a different battlefield (Brute attacks B at bf2): Zhonya's still replaces it — B recalled to base alive, Zhonya's in trash, Brute conquers the emptied bf2", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf2");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.locationOf("brute")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
