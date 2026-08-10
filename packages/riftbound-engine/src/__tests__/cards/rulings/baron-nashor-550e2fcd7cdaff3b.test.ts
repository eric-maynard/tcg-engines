/**
 * Ruling 550e2fcd7cdaff3b — Baron Nashor (UNL-147 → unl-147-219) · 12 Might · 10+[chaos]×3 · "As you play me, add the Baron Pit
 *   battlefield token to the board if it's not there already. If you do, I enter there. …"
 *   × Baron Pit (UNL-T01 → unl-t01, token battlefield): "Units can move here from anywhere."
 *
 * Q: Does Baron conquer when played?
 * A: Yes — he creates the (empty) Baron Pit and enters it, gaining control of a battlefield not yet scored this turn:
 *    a Conquer worth a point. Nuances: only once per battlefield per turn; and the Final Point rule applies — at match
 *    point you only score it if every other battlefield was scored this turn, otherwise you draw 1 instead.
 * Rules: 464.1 (Conquer = gaining control of an unscored battlefield), 447 (once per battlefield per turn), 466.1.b.2 (Final Point).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn with exactly [10] + 3 chaos and Baron in hand; two ordinary battlefields (P2's bf1 with a Guard, open bf2). */
function board(p1Points = 0) {
  return scenario()
    .victoryScore(8)
    .points(P1, p1Points)
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Minion" }, "minion")
    .hand(P1, BARON_NASHOR, "baron");
}

function pitId(game: Game): string | undefined {
  return game.battlefields().find((b) => b !== "bf1" && b !== "bf2");
}

describe("Ruling 550e2fcd7cdaff3b — playing Baron Nashor conquers the freshly created Baron Pit", () => {
  test("before: no Pit. Playing Baron adds the Baron Pit token battlefield and Baron enters THERE, not base", async () => {
    const game = await board().build();
    expect(pitId(game)).toBeUndefined();
    await game.p1.play("baron");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const pit = pitId(game);
    expect(pit).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit);
    expect(game.p1.base()).not.toContain("baron");
  });

  test("entering the empty Pit gains control of an unscored battlefield = a Conquer: P1 scores 1 (0 → 1) and it is recorded as conquered/scored this turn", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    await game.settle();
    const pit = pitId(game) as string;
    expect(game.gameState.battlefields[pit]).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual([pit]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual([pit]);
    expect(game.p2.points()).toBe(0);
    // Baron's aura is live: other friendly units +2.
    expect(game.state("minion").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("once per battlefield per turn: after that conquer, moving another unit into the Pit the same turn scores nothing more", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    await game.settle();
    const pit = pitId(game) as string;
    expect(game.p1.points()).toBe(1);
    await game.p1.move("minion", pit); // "Units can move here from anywhere"
    await game.settle();
    expect(game.locationOf("minion")).toBe(pit);
    expect(game.p1.points()).toBe(1);
  });

  test("Final Point restriction: at 7/8 with bf1 and bf2 unscored this turn, conquering the Pit does NOT win — P1 draws 1 instead", async () => {
    const game = await board(7).build();
    const handAfterPlay = game.p1.hand().length - 1;
    await game.p1.play("baron");
    await game.settle();
    expect(game.gameState.battlefields[pitId(game) as string]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(handAfterPlay + 1);
  });
});
