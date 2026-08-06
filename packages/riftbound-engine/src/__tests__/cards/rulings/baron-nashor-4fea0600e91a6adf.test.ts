/**
 * Ruling 4fea0600e91a6adf — Baron Nashor (unl-147-219) · Unit · Chaos · 10 + [chaos]×3 · 12 Might
 *   "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you
 *    do, I enter there. (It has "Units can move here from anywhere.") I can't be chosen by enemy spells
 *    and abilities. Other friendly units have +2 [Might]."
 *
 * Q: Does Baron Nashor MOVE to the Baron Pit when it's created as part of playing him?
 * A: No. His entry location is replaced — he enters the Pit directly. A move is a permanent changing
 *    position between board spaces (446.1); entering the board from hand is a zone change, which is not a
 *    move (446.2). So nothing that counts or triggers on moves sees Baron.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON = "unl-147-219";
const BARON_PIT = "unl-t01";

function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Minion" }, "minion")
    .hand(P1, BARON, "baron");
}

describe("Ruling 4fea0600e91a6adf — Baron Nashor enters the Baron Pit; that is not a move", () => {
  test.failing("BUG: ruling 4fea0600e91a6adf — playing Baron creates the Baron Pit token battlefield and Baron ENTERS there (entry replaced, 446.2) with zero moves recorded; engine never creates the Pit", async () => {
    // Expected: a new battlefield whose def is unl-t01 appears, Baron is located there (not in base), and
    // P1's units-moved count is still 0. Actual: "As you play me … I enter there" is unimplemented.
    const game = await board().build();
    const before = game.battlefields().length;
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.battlefields()).toHaveLength(before + 1);
    const pit = game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" })[0];
    expect(pit).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit as string);
    expect(game.p1.units("base")).not.toContain("baron");
    // Not a move: entered the board directly at the Pit (446.1 / 446.2).
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.state("baron").isExhausted).toBe(true); // played units enter exhausted; a "move" would not explain that either
  });

  test("playing Baron is a zone change (hand → board), never a move: P1's units-moved-this-turn count stays 0 and Baron is simply on the board (446.2)", async () => {
    const game = await board().build();
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.zoneOf("baron")).not.toBe("hand");
    expect(["base", ...game.battlefields()]).toContain(game.locationOf("baron") as string);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    // Sanity: an actual move IS counted, so the counter is live.
    await game.p1.move("minion", "bf1");
    await game.settle();
    expect(game.locationOf("minion")).toBe("bf1");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(1);
    // Baron's static: other friendly units +2 Might.
    expect(game.state("minion").might).toBe(4);
    expect(game.state("baron").might).toBe(12);
  });
});
