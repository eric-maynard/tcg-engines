/**
 * Ruling c8f52e29316ab2c5 — Trinity Force (SFD-115 → sfd-115-221) · Equipment "[Equip] [body]. When I hold, score 1 point."
 *   × Skyfall of Areion (SFD-030 → sfd-030-221) · Equipment "[Equip] [1][fury]. My hold effects are also conquer effects,
 *     and vice versa."
 *
 * Q: My Lucian wears TWO Trinity Forces and one Skyfall of Areion — do the Trinity Forces stack or does only one go off?
 * A: They stack. Each attached gear appends its own text to the unit, so the unit has two independent "When I hold,
 *    score 1" triggers; with Skyfall those are also conquer effects. Conquering with that unit puts BOTH triggers on
 *    the chain → 2 extra points, 3 total (1 conquer + 2).
 * Rules: 719 / 136.2 (attached Equipment confers its effect text on the unit), 383.3.d (two triggers, one event —
 *        controller orders them), 441–446 (conquer / hold scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRINITY_FORCE = "sfd-115-221";
const SKYFALL = "sfd-030-221";

/** "Lucian": a 2-Might unit already wearing tf1, tf2 and sky (2 + 2 + 2 + 2 = 8), at `where`. Victory at 8 so 3 points don't end the game. */
function board(where: "base" | "bf1") {
  return scenario()
    .victoryScore(8)
    .battlefield("bf1", { controller: where === "bf1" ? P1 : null })
    .unit(P1, where, { might: 2, name: "Lucian" }, "lucian", { equippedWith: ["tf1", "tf2", "sky"] })
    .card("tf1", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" }, owner: P1, zone: where === "base" ? "base" : "battlefield:bf1" })
    .card("tf2", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" }, owner: P1, zone: where === "base" ? "base" : "battlefield:bf1" })
    .card("sky", { def: SKYFALL, meta: { attachedTo: "lucian" }, owner: P1, zone: where === "base" ? "base" : "battlefield:bf1" })
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling c8f52e29316ab2c5 — two Trinity Forces + Skyfall: both triggers fire on conquer, 3 points total", () => {
  test("premise: Lucian carries all three attachments and reads 8 Might", async () => {
    const game = await board("base").build();
    expect(game.state("lucian").attachments.toSorted()).toEqual(["sky", "tf1", "tf2"]);
    expect(game.state("lucian").might).toBe(8);
    expect(game.state("tf1").attachedTo).toBe("lucian");
    expect(game.state("tf2").attachedTo).toBe("lucian");
  });

  test("CONQUER: 1 point for the conquer, then TWO separate 'score 1' triggers (one per Trinity Force, made conquer effects by Skyfall) go on the chain — P1 orders them — and each scores: 0 → 3", async () => {
    const game = await board("base").build();
    await game.p1.move("lucian", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // the conquer itself
    // Two independent instances of the trigger, same event → P1 is offered their order.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect((d as Extract<typeof d, { kind: "order" }>).items).toHaveLength(2);
    await game.p1.order([]); // keep listed order — they are identical
    const triggers = game.chain().filter((c) => c.triggered && c.controller === P1);
    expect(triggers).toHaveLength(2);
    await passBoth(game);
    expect(game.p1.points()).toBe(2);
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(1);
    await passBoth(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — ONE Trinity Force + Skyfall conquers for 2 (1 + 1): the second Trinity Force is what adds the third point", async () => {
    const game = await scenario()
      .victoryScore(8)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Lucian" }, "lucian", { equippedWith: ["tf1", "sky"] })
      .card("tf1", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" }, owner: P1, zone: "base" })
      .card("sky", { def: SKYFALL, meta: { attachedTo: "lucian" }, owner: P1, zone: "base" })
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("HOLD stacks the same way: holding bf1 at the start of P1's next turn scores 1 (hold) + 1 + 1 = 3", async () => {
    const game = await board("bf1").build();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // → P2
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // → P1: Beginning Phase hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
