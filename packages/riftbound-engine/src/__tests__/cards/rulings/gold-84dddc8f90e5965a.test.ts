/**
 * Ruling 84dddc8f90e5965a — Gold token (SFD-T03 → sfd-t03) × Wages of Pain (SFD-070 → sfd-070-221)
 *   Wages of Pain · [Hidden] [Action] · 3 · "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *   (Reaction used to kill the target: the defender's own facedown Hidden Blade, ogn-213-298.)
 *
 * Q: Do I still get the Gold from Wages of Pain if the targeted unit dies to a reaction first?
 * A: Yes. The reaction resolves first (LIFO) and kills the target; when Wages resolves "Deal 3" has an
 *    illegal target and is ignored, but "Play a Gold gear token exhausted" is a separate instruction that
 *    references no target, so it still executes.
 * Rules: 359.3.e.5 / 359.3.e.6 (only instructions referencing the illegal target are skipped), 336–337 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES = "sfd-070-221";
const HIDDEN_BLADE = "ogn-213-298";

const golds = (game: Game, seat: "p1" | "p2") =>
  game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** Turn 3, P1 active with exactly [3]. P2 holds bf1 with Victim (4) and hid a Hidden Blade there earlier. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 1, name: "Holder" }, "holder") // keeps bf1 for P2 after Victim dies
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, WAGES, "wop");
}

/** P1 casts Wages on Victim and passes; P2 flips the facedown Hidden Blade on its own Victim. */
async function wagesThenBlade(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("wop", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wop", controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "blade")).toBe(true);
  await game.p2.reveal("blade");
  // rule 355.5 / 811.1.b: the target is chosen as the card is played, before anyone gets priority.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("victim");
  expect(game.chain().map((c) => c.cardId)).toEqual(["wop", "blade"]);
  return game;
}

describe("Ruling 84dddc8f90e5965a — Wages of Pain still plays its Gold when a reaction kills the target", () => {
  test("control: unopposed, Victim takes 3 and P1 gets exactly one exhausted Gold token", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "victim" });
    await game.settle();
    expect(game.state("victim").damage).toBe(3);
    expect(golds(game, "p1")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0] as string)).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    expect(game.zoneOf("wop")).toBe("trash");
  });

  test("the reaction (P2's facedown Hidden Blade, played for 0) sits above Wages and resolves first: Victim dies, P2 draws 2, Wages still pending", async () => {
    const game = await wagesThenBlade();
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hidden Blade resolves
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["wop"]);
    expect(golds(game, "p1")).toHaveLength(0); // not yet
  });

  test("ruling 84dddc8f90e5965a — Wages then resolves: the damage is ignored (target gone) but P1 STILL gets one exhausted Gold token", async () => {
    const game = await wagesThenBlade();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("holder").damage).toBe(0); // damage did not jump to another unit
    expect(golds(game, "p1")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0] as string)).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.zoneOf("wop")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
