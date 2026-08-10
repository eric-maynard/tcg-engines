/**
 * Ruling 27062cb69d10068c — Baron Nashor (UNL-147 → unl-147-219) · Unit · Chaos · 10 + [chaos]×3 · 12 Might
 *     "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you do, I enter there.
 *      I can't be chosen by enemy spells and abilities. Other friendly units have +2 [Might]."
 *   × Baron Pit (UNL-T01 → unl-t01) · Battlefield token "Units can move here from anywhere."
 *
 * Q: Does Baron Nashor score when he is played and enters the (newly created) Baron Pit?
 * A: Yes — entering the empty Pit establishes control = a Conquer, which scores a point provided that battlefield wasn't
 *    already scored this turn. Nuance: the Final Point rule still applies — if it would be your winning point and you have not
 *    scored every other battlefield this turn, you draw a card instead.
 * Rules: 446.1 (Conquer = gaining control of a battlefield not yet scored this turn), 447 (once per battlefield per turn),
 *        448 / 448.1.b.2 (scoring; final-point restriction → draw instead).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";

/** P1's turn with exactly 10 + [chaos]×3 and Baron in hand. Two ordinary battlefields: bf1 (P2's, guarded) and bf2 (nobody's). */
function board(p1Points: number) {
  return scenario()
    .points(P1, p1Points)
    .victoryScore(8)
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P1, BARON_NASHOR, "baron");
}

describe("Ruling 27062cb69d10068c — Baron Nashor entering the fresh Baron Pit is a Conquer and scores", () => {
  test("playing Baron adds the Baron Pit token battlefield and Baron enters THERE (not base); P1 gains control of it — a Conquer worth 1 point", async () => {
    const game = await board(0).build();
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2"]);
    await game.p1.play("baron");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const pit = game.battlefields().find((b) => b !== "bf1" && b !== "bf2");
    expect(pit).toBeDefined();
    expect(game.gameState.battlefields[pit as string]).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit);
    expect(game.p1.base()).not.toContain("baron");
    await game.settle(); // the (uncontested) showdown at the Pit closes → control established
    expect(game.gameState.battlefields[pit as string]).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    // The other battlefields are untouched.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("Final Point restriction: at 7 of 8 with bf1/bf2 unscored this turn, conquering the Pit does NOT give the winning point — P1 draws a card instead and the game goes on", async () => {
    const game = await board(7).build();
    const handAfterPlay = game.p1.hand().length - 1; // Baron leaves the hand
    await game.p1.play("baron");
    await game.settle();
    const pit = game.battlefields().find((b) => b !== "bf1" && b !== "bf2") as string;
    expect(game.gameState.battlefields[pit]).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(handAfterPlay + 1); // drew 1 instead of scoring
    expect(game.violations()).toEqual([]);
  });

  test("not the final point (6 of 8): the same conquer simply scores to 7", async () => {
    const game = await board(6).build();
    await game.p1.play("baron");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });
});
