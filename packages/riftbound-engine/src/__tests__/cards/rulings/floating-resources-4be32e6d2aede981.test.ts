/**
 * Ruling 4be32e6d2aede981 — (no specific card) when may resources be floated, and what are the limits?
 *
 * Q: When can resources be floated in Riftbound, and what are the limitations?
 * A: You may float (leave in your pool) whenever you have priority — including while a chain is live, the
 *    same window in which you could play a Reaction — and you may float MORE than the cost you are
 *    paying. Floated resources empty at the end of the turn AND after the Draw Phase, so you cannot
 *    stock up before your Channel Phase and still have it during your turn.
 * Rules: 429 / 166 (Rune Pool), 315.4.d (pool empties after the Draw Phase), 317.2.d/3e (Expiration Step
 *        empties pools), 338.1 (things you may do with priority), 430.3 ([Add] by exhausting a rune).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." — something to open a chain with. */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

/** Costs [1]. */
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Cantrip",
  rulesText: "Draw 1.",
} as const;

describe("Ruling 4be32e6d2aede981 — floating resources", () => {
  test("you may tap runes in your open main phase and simply leave the Energy floating", async () => {
    const game = await scenario().runes(P1, "fury", 3).hand(P1, CANTRIP, "cantrip").build();
    await game.p1.tapRunes(3);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    // floating in EXCESS of the cost is fine: 3 floated, 1 spent, 2 left over
    await game.p1.cast("cantrip");
    await game.settle();
    expect(game.p1.energy()).toBe(2);
  });

  test("you may float while you hold PRIORITY on a live chain — the same window a Reaction would use", async () => {
    const game = await scenario()
      .runes(P1, "fury", 2)
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, RALLY, "rally")
      .build();
    await game.p1.cast("rally", { targets: "ally" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally"]); // tapping a rune is not a chain item
    await game.p1.passPriority();
    // and the non-turn player may float on their own priority window too
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.settle();
    expect(game.p1.energy()).toBe(1);
  });

  test("the pool empties at the END of the turn — nothing floated survives into the next turn", async () => {
    const game = await scenario().runes(P1, "fury", 2).build();
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    await game.advanceTurn(); // P1 ends; P2's turn begins
    expect(game.p1.energy()).toBe(0);
    const pass = game.trace().expiration[0];
    expect(pass?.steps).toContain("empty-pools");
    expect(pass?.poolsEmptied?.[P1]).toMatchObject({ energy: 2 });
  });

  test("and again after the DRAW PHASE — resources floated before your own Channel Phase are not available in your Main Phase", async () => {
    const game = await scenario()
      .active(P2)
      .runes(P1, "fury", 2)
      .resources(P1, { energy: 5, power: { fury: 2 } })
      .build();
    expect(game.p1.energy()).toBe(5); // floated during the opponent's turn
    await game.advanceTurn(); // P2 ends → P1's Awaken / Channel / Draw / Main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
