/**
 * Ruling f7ff7eeeb058721d — Symbol of the Solari (OGN-227 → ogn-227-298) · Gear · Order · [1]
 *   "If a combat where you are the attacker ends in a tie, recall ALL units instead."
 *   × Galio, Indefatigable (UNL-171 → unl-171-219) · 6 Might · [Deflect] [Tank] "I don't deal combat damage."
 *
 * Q: Are ties still possible, and what does Symbol of the Solari do to one?
 * A: Yes — after the Combat Damage Step, if BOTH players still have units at the battlefield the combat is a
 *    tie. Normally only the attackers are recalled and the defender keeps the battlefield. Symbol overrides
 *    that: ALL units — attackers and defenders — go back to their controllers' bases, so nobody is left at
 *    the battlefield, the combat ends in No Result and nobody conquers or scores. Recall on a tie does not
 *    exhaust: units keep whatever ready/exhausted state they had.
 * Rules: 466.3 (combat result read after the damage step), 466.1.a.2 (attackers recalled), 461.3.d /
 *        466.3.d (No Result when nobody remains), 466.5.b (uncontrolled), 453 (recall is not a move).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SYMBOL = "ogn-227-298";
const GALIO = "unl-171-219";

/** P1 attacks P2's bf1 with Galio (who deals no combat damage) into a 3-Might Sentinel → a guaranteed tie. */
function board(withSymbol: boolean) {
  const s = scenario()
    .victoryScore(20)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", GALIO, "galio")
    .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel");
  return withSymbol ? s.gear(P1, SYMBOL, "symbol") : s;
}

describe("Ruling f7ff7eeeb058721d — a tie is real, and Symbol of the Solari recalls everyone and voids the result", () => {
  test("premise/baseline: without Symbol the tie recalls only the ATTACKER; the defender stays and keeps bf1", async () => {
    const game = await board(false).build();
    await game.p1.move("galio", "bf1");
    expect(game.state("galio").combatRole).toBe("attacker");
    expect(game.state("sentinel").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("galio")).toBe("base"); // recalled attacker
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1"); // defender remains
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("ruling: with Symbol out, the SAME tie sends ALL units home — the defender is recalled too", async () => {
    const game = await board(true).build();
    await game.p1.move("galio", "bf1");
    await game.settle();
    expect(game.zoneOf("galio")).toBe("base");
    expect(game.zoneOf("sentinel")).toBe("base"); // "recall ALL units"
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.cardsAt("battlefield-bf1")).toEqual([]);
  });

  test("…and because nobody is left there the combat is No Result: no conquer, no point for either side", async () => {
    const game = await board(true).build();
    await game.p1.move("galio", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("recall on a tie does NOT exhaust: an already-exhausted defender stays exhausted and a ready one stays ready", async () => {
    const readyDefender = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: P2 })
      .gear(P1, SYMBOL, "symbol")
      .unit(P1, "base", GALIO, "galio")
      .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    expect(readyDefender.state("sentinel").isReady).toBe(true);
    await readyDefender.p1.move("galio", "bf1");
    await readyDefender.settle();
    expect(readyDefender.zoneOf("sentinel")).toBe("base");
    expect(readyDefender.state("sentinel").isReady).toBe(true);

    const tiredDefender = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: P2 })
      .gear(P1, SYMBOL, "symbol")
      .unit(P1, "base", GALIO, "galio")
      .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel", { exhausted: true })
      .build();
    await tiredDefender.p1.move("galio", "bf1");
    await tiredDefender.settle();
    expect(tiredDefender.zoneOf("sentinel")).toBe("base");
    expect(tiredDefender.state("sentinel").isExhausted).toBe(true);
  });

  test("Symbol replaces only TIES: a combat P1 actually wins still conquers normally", async () => {
    const game = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: P2 })
      .gear(P1, SYMBOL, "symbol")
      .unit(P1, "base", GALIO, "galio")
      .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
      .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.move(["galio", "striker"], "bf1");
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
