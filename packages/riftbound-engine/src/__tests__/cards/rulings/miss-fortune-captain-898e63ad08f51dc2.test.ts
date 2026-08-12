/**
 * Ruling 898e63ad08f51dc2 — Miss Fortune, Captain (OGN-162 → ogn-162-298) · 5-Might Body champion
 *   "[Accelerate] [Ganking] The first time I move each turn, you may ready something else that's exhausted."
 *
 * Q: When Miss Fortune's trigger readies another unit, can I move that unit along WITH her, or must her
 *    move (and any showdown it caused) finish first?
 * A: You cannot move it alongside her. Her trigger happens as she arrives; the pending showdown/combat
 *    from that same move follows immediately after the trigger resolves. There is no window in between
 *    in which a base-speed move could be taken. Once everything has resolved you may move the readied
 *    unit normally. She can ready a Legend too, even one that was already tapped when she moved.
 * Rules: 344.2 (the arrival stages the showdown), 383.3.a (a leading "you may" is decided at
 *        finalization), 155/323 (a standard move is a turn-player action in an Open State with nothing
 *        resolving), 174.5 (legends can be chosen by effects), 812-ish [Ganking].
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Answer her leading "you may ready something else that's exhausted" with YES if it is asked. */
async function acceptReady(game: Game): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      continue;
    }
    return;
  }
}

const MISS_FORTUNE_CAPTAIN = "ogn-162-298";
const BLIND_MONK = "ogn-257-298"; // a legend, to be readied while tapped

/** P1's turn. bf1 held by P2 with a 2-Might Holder, bf2 open. An exhausted Ally waits at base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", MISS_FORTUNE_CAPTAIN, "mf")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally", { exhausted: true });
}

describe("Ruling 898e63ad08f51dc2 — the readied unit cannot travel with Miss Fortune", () => {
  test("her trigger is offered as she arrives, and the readied Ally really does become ready", async () => {
    const game = await board().build();
    expect(game.state("ally").isExhausted).toBe(true);
    await game.p1.move("mf", "bf1");
    await acceptReady(game);
    await game.settle();
    expect(game.locationOf("mf")).toBe("bf1");
    expect(game.state("ally").isReady).toBe(true);
    expect(game.locationOf("ally")).toBe("base"); // it did NOT come along
    expect(game.violations()).toEqual([]);
  });

  test("while her move is still resolving, the Ally cannot be moved — the showdown/combat comes first", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    // Somewhere in this window the trigger is answered and the combat runs; at no point is a
    // base-speed move of the Ally legal.
    expect((await game.p1.try((p) => p.move("ally", "bf1"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("ally", "bf2"))).ok).toBe(false);
    expect(game.locationOf("ally")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("after everything has resolved the readied Ally may be moved normally, on the same turn", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    await acceptReady(game);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash"); // 5 ≥ 2, the combat happened
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    await game.p1.move("ally", "bf2");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: she may ready a LEGEND that was already tapped when she moved", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", MISS_FORTUNE_CAPTAIN, "mf")
      .legend(P1, BLIND_MONK, "monk")
      .build();
    // Tap the legend by using its own "[1], [Exhaust]: Buff a friendly unit" first.
    await game.p1.activate("monk");
    await game.settle();
    expect(game.state("monk").isExhausted).toBe(true);
    await game.p1.move("mf", "bf1");
    await acceptReady(game);
    await game.settle();
    expect(game.state("monk").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
