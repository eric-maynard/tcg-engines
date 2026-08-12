/**
 * Ruling 85a8766aa0a91cb8 — (general [Repeat]; exercised with Feral Strength, SFD-034 → sfd-034-221 ·
 *   "[Reaction] [Repeat] [2] — Give a unit +2 [Might] this turn.")
 *
 * Q: When is [Repeat] declared, and can the opponent react between the first effect and the repeat?
 * A: [Repeat] is an optional ADDITIONAL COST chosen while the spell is being played. It produces one spell and
 *    one chain item whose instructions simply execute twice, so there is no window in between — the opponent's
 *    only window is the ordinary one, once the spell is on the chain.
 * Rules: 820 ([Repeat] — an optional additional cost, executing the instructions once more), 349 (additional
 *        costs are part of the one play), 355 (playing: choices then costs), 340 (one chain item, one window).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FERAL = "sfd-034-221"; // [Reaction] · [2] · [Repeat] [2] · "Give a unit +2 [Might] this turn."

/** P1's turn with a dummy to buff and enough Energy for base + Repeat. */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", { might: 3, name: "Dummy" }, "dummy")
    .hand(P1, FERAL, "feral");
}

/** Play it with the Repeat cost paid, stopping with it on the chain. */
async function repeated(): Promise<Game> {
  const game = await board(4).build();
  await game.p1.cast("feral", { repeat: 1, targets: "dummy" });
  return game;
}

describe("Ruling 85a8766aa0a91cb8 — [Repeat] is an additional cost of one play, resolved as one chain item", () => {
  test("the choice is made as the spell is played: both costs are paid at once (4 energy gone) before anything is on offer to react to", async () => {
    const game = await repeated();
    expect(game.p1.energy()).toBe(0); // [2] base + [2] Repeat
    expect(game.zoneOf("feral")).toBe("chain");
  });

  test("it is ONE chain item — there is no second item for the repeat, so no window between the executions", async () => {
    const game = await repeated();
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral"]);
    expect(game.state("dummy").might).toBe(3); // nothing has executed yet
  });

  test("the opponent's window is the ordinary one, and it is a single one: after they pass, BOTH executions happen together", async () => {
    const game = await repeated();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("dummy").might).toBe(3); // still nothing
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("dummy").might).toBe(7); // 3 + 2 + 2, in one resolution
    expect(game.zoneOf("feral")).toBe("trash");
  });

  test("declining Repeat is the same play at the base cost: one execution, same single window", async () => {
    const game = await board(4).build();
    await game.p1.cast("feral", { targets: "dummy" });
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral"]);
    await game.settle();
    expect(game.state("dummy").might).toBe(5);
  });

  test("Repeat cannot be paid twice on one spell", async () => {
    const game = await board(8).build();
    const res = await game.p1.try((p) => p.cast("feral", { repeat: 2, targets: "dummy" }));
    expect(res.ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
