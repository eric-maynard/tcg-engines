/**
 * Ruling 2f43c7f616cbdc2f — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · [12]+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at
 *      each location. Deal 1 to them."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction spell · Chaos · [3]+[chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Opponent plays Elder Dragon to base; I respond with Star-Crossed bouncing it. Does the 1-damage play
 *    trigger still resolve?
 * A: Yes. The "When you play me" trigger is already on the chain (targets chosen when it was put there).
 *    Star-Crossed resolves first (LIFO) and returns both units; the trigger then still resolves and deals its
 *    1 damage even though Elder Dragon is no longer on the board — it does not fizzle.
 * Rules: 383 (triggered ability is its own chain item), 336–337 (LIFO), 359.3.e.12 (source gone → ability
 *        still resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const STAR_CROSSED = "unl-128-219";

/**
 * P2's turn with exactly [12] + 4 body and Elder Dragon in hand. P1: 3-Might Victim at P1's bf1, 3-Might Buddy in
 * base, Star-Crossed in hand with exactly [3] + chaos.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 4 } })
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "base", { might: 3, name: "Buddy" }, "buddy")
    .hand(P2, ELDER_DRAGON, "elder")
    .hand(P1, STAR_CROSSED, "sc");
}

/** P2 plays Elder Dragon to base and, as the trigger is finalized, chooses Victim (bf1) and nobody in base. */
async function elderPlayedTargetingVictim(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("elder");
  expect(game.zoneOf("elder")).toBe("base");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  // Targets are chosen NOW, as the trigger is put on the chain (FIN timing), by P2.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "target", source: { cardId: "elder" }, timing: "FIN" });
  await game.p2.pick("victim");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.decline(); // "up to one" in base — none
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", controller: P2, targets: ["victim"], triggered: true })]);
  return game;
}

describe("Ruling 2f43c7f616cbdc2f — Elder Dragon's play trigger still deals its damage after Star-Crossed bounces the Dragon", () => {
  test("playing Elder Dragon puts its 'When you play me' trigger on the chain (a Closed State) and P1 may respond with the Reaction Star-Crossed naming Buddy + the Dragon", async () => {
    const game = await elderPlayedTargetingVictim();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "sc")).toBe(true);
    await game.p1.cast("sc", { targets: ["buddy", "elder"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["elder", "sc"]); // Star-Crossed on top
  });

  test("LIFO: Star-Crossed resolves first — Buddy and Elder Dragon go back to their owners' hands while the Dragon's trigger is still on the chain", async () => {
    const game = await elderPlayedTargetingVictim();
    await game.p2.passPriority();
    await game.p1.cast("sc", { targets: ["buddy", "elder"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("elder")).toBe("hand");
    expect(game.state("elder").owner).toBe(P2);
    expect(game.zoneOf("buddy")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", targets: ["victim"], triggered: true })]);
    expect(game.state("victim").damage).toBe(0); // not yet
  });

  test("then the trigger resolves anyway: Victim is dealt 1 even though Elder Dragon is in hand — the ability did not fizzle", async () => {
    const game = await elderPlayedTargetingVictim();
    await game.p2.passPriority();
    await game.p1.cast("sc", { targets: ["buddy", "elder"] });
    await game.settle();
    expect(game.zoneOf("elder")).toBe("hand");
    expect(game.zoneOf("buddy")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.state("victim").damage).toBe(1);
    // With the Dragon off the board its "any damage is lethal" passive no longer applies: a 3-Might unit with 1 damage lives.
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control — no response: the trigger deals 1 to Victim with the Dragon still in play, and that 1 is lethal (Elder Dragon's passive)", async () => {
    const game = await elderPlayedTargetingVictim();
    await game.settle();
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("base");
  });
});
