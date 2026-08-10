/**
 * Ruling 3b310d21f54d4a25 — Voidreaver (UNL-201 → unl-201-219) · Legend · Kha'Zix · Body/Chaos
 *   "When you win a combat, gain 1 XP. / Spend 1 XP, [Exhaust]: [Buff] a unit. / Spend 2 XP, [Exhaust]: Move an
 *    exhausted friendly unit from a battlefield to its base."
 *
 * Q: Can I activate Voidreaver's legend abilities during a Showdown if I have Focus?
 * A: No. Activated abilities without [Action]/[Reaction] can only be used on your turn in an Open state (empty chain, no
 *    showdown). Focus does not help — neither while attacking nor while defending.
 * Rules: 343.1.b / 313.1.a (plain activated abilities: Neutral Open on your turn), 344 (showdown states), 347 (Focus
 *        only permits legally-timed actions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOIDREAVER = "unl-201-219";

/**
 * P1: Voidreaver legend (ready), 5 XP; bf1 (P1) holds an EXHAUSTED Tired (2) — a legal object for ability #2 — and
 * a ready Scout (1) in base; bf2 (P2) holds Wall (5); bf3 open.
 */
function board() {
  return scenario()
    .xp(P1, 5)
    .legend(P1, VOIDREAVER, "vr")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Tired" }, "tired", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

const activations = (game: Game) => game.p1.legal().filter((o) => o.verb === "activate" && o.card === "vr");

describe("Ruling 3b310d21f54d4a25 — Voidreaver's abilities are not usable in a showdown, Focus or not", () => {
  test("baseline — in P1's Neutral Open main phase both abilities ARE offered (5 XP, ready legend, exhausted Tired at bf1)", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:vr#1")).toBe(true);
    expect(game.p1.can("activateAbility:vr#2")).toBe(true);
  });

  test("attacking: Scout moves into P2's bf2 → combat showdown with P1 holding Focus — neither ability is offered and forcing one is rejected; XP and the legend untouched", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(activations(game)).toEqual([]);
    expect(game.p1.can("activateAbility:vr#1")).toBe(false);
    expect(game.p1.can("activateAbility:vr#2")).toBe(false);
    expect((await game.p1.try((p) => p.activate("vr", 1, { targets: "scout" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("vr", 2, { targets: "tired" }))).ok).toBe(false);
    expect(game.p1.xp()).toBe(5);
    expect(game.state("vr").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("non-combat showdown (Scout onto the open bf3) with Focus: still not offered", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf3");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:vr#1")).toBe(false);
    expect(game.p1.can("activateAbility:vr#2")).toBe(false);
  });

  test("defending on P2's turn: Raider attacks bf1, P2 passes Focus to P1 — P1 holds Focus but may not activate either ability", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(activations(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("vr", 1, { targets: "tired" }))).ok).toBe(false);
    expect(game.p1.xp()).toBe(5);
  });

  test("after the showdown closes and the state is Open again on P1's turn, the abilities come back", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf3");
    await game.settle(); // non-combat showdown ends, Scout conquers bf3
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:vr#1")).toBe(true);
    expect(game.p1.can("activateAbility:vr#2")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
