/**
 * Ruling 309eb6c8c1b8fcd4 — Riptide Rex (OGN-092 → ogn-092-298) · Mind · [6][mind][mind] · 6 Might
 *     "When you play me, deal 6 to an enemy unit at a battlefield."
 *   × En Garde (OGN-046 → ogn-046-298) · [Reaction] · "Give a friendly unit +1 [Might] this turn, then an
 *     additional +1 [Might] this turn if it is the only unit you control there."
 *
 * Q: Does a triggered ability like Riptide Rex's give the opponent a window to react on the chosen unit?
 * A: Yes. Every triggered ability goes on the chain, so all players get priority and may respond before
 *    it resolves — here the target can be pumped out of lethal range.
 * Rules: 383 (triggered abilities go on the chain), 336/337 (priority + LIFO), 340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPTIDE_REX = "ogn-092-298";
const EN_GARDE = "ogn-046-298";

/** P1's main phase, Rex affordable. P2 holds bf1 with a lone 5-Might Guard and has En Garde + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .hand(P1, RIPTIDE_REX, "rex")
    .hand(P2, EN_GARDE, "engarde");
}

/** Play Rex; its "deal 6" trigger sits on the chain aimed at the only legal victim. */
async function rexTriggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("rex");
  return game;
}

describe("Ruling 309eb6c8c1b8fcd4 — Riptide Rex's trigger uses the chain, so the target can be saved", () => {
  test("the trigger is a chain item (not an immediate effect) and nothing has been dealt yet", async () => {
    const game = await rexTriggerOnChain();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("rex")).toBe("base");
  });

  test("ruling: P2 gets priority and may respond — En Garde is castable while the trigger waits", async () => {
    const game = await rexTriggerOnChain();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "engarde")).toBe(true);
    await game.p2.cast("engarde", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "engarde"]);
  });

  test("…the reaction resolves first (LIFO), so the 5-Might Guard is at 7 and survives the 6", async () => {
    const game = await rexTriggerOnChain();
    await game.p1.passPriority();
    await game.p2.cast("engarde", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // En Garde resolves
    expect(game.state("guard")).toMatchObject({ might: 7, damage: 0 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex"]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("control: with no reaction the 6 damage kills the 5-Might Guard", async () => {
    const game = await rexTriggerOnChain();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
  });
});
