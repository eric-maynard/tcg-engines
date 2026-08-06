/**
 * Perched Grimwyrm — sfd-015-221 · Unit · Fury · 4 energy · 5 Might
 *
 *   Play me only to a battlefield you conquered this turn. (You can't play me anywhere else.)
 *
 * Rules: 355.2.a/b (units are normally played to base or a battlefield you control); this
 * card replaces that with "a battlefield you conquered this turn" only. 469.1 (Conquer = gain
 * control of a battlefield you did not control) vs 469.2 (Hold — not a conquer).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-015-221";

function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 }) // empty enemy battlefield → conquerable by walking in
    .battlefield("held", { controller: P1 }) // already ours: NOT conquered this turn
    .unit(P1, "held", { might: 2 }, "keeper")
    .unit(P1, "base", { might: 3 }, "runner")
    .hand(P1, CARD, "wyrm");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;
const playTargets = (game: Built) => game.p1.option("play", "wyrm")?.fields.find((f) => f.arg === "to")?.options ?? [];

describe("Perched Grimwyrm (sfd-015-221)", () => {
  test("before conquering anything this turn it cannot be played at all (not to base, not to a held battlefield)", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "wyrm")).toBe(false);
    const r = await game.p1.try((p) => p.play("wyrm", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("wyrm")).toBe("hand");
    expect(game.p1.energy()).toBe(4);
  });

  test("after conquering bf1 this turn, it may be played there — and only there", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.can("play", "wyrm")).toBe(true);
    expect(playTargets(game)).toEqual(["battlefield-bf1"]);
    await game.p1.play("wyrm", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("wyrm")).toBe("battlefield-bf1");
    expect(game.state("wyrm").might).toBe(5);
    expect(game.state("wyrm").isExhausted).toBe(true);
  });

  test("even after a conquer, base and the merely-held battlefield are not legal destinations", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    const toBase = await game.p1.try((p) => p.play("wyrm", { to: "base" }));
    expect(toBase.ok).toBe(false);
    const toHeld = await game.p1.try((p) => p.play("wyrm", { to: "held" }));
    expect(toHeld.ok).toBe(false);
    expect(game.zoneOf("wyrm")).toBe("hand");
  });

  test("'this turn': a battlefield conquered on an earlier turn no longer qualifies", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // back to P1 — bf1 is now held, not conquered this turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p1.do("addResources", { energy: 4 });
    expect(game.p1.can("play", "wyrm")).toBe(false);
  });

  test("cost: 4 energy; with only 3 energy the play is not legal even at a freshly conquered battlefield", async () => {
    const game = await board().resources(P1, { energy: 3 }).build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.can("play", "wyrm")).toBe(false);
  });
});
