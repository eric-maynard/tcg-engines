/**
 * Ruling 000f1dd68cfb26c7 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [2][calm] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can Zhonya's be flipped "at any time" during damage assignment to control which unit survives?
 * A: No. Damage assignment/dealing passes no priority, so nothing can be played there; flip Zhonya's during the showdown
 *    while you still have Focus/priority, before combat damage. Damage is then assigned in full and dealt simultaneously;
 *    if several of your units die at once, YOU (their controller) choose which one Zhonya's saves.
 * Rules: 465.2 (assignment and dealing are steps of combat resolution, no priority), 345–347 (Focus/priority in a
 *        showdown), 811 (hidden ⇒ Reaction for [0]), 373 (a single-use replacement vs. simultaneous events: its
 *        controller picks which event it applies to).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P2 holds bf1 with A (2) and B (2) and has Zhonya's face down there. P1's 8-Might Brute attacks from base. */
function board(auto = true) {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "A" }, "a")
    .unit(P2, "bf1", { might: 2, name: "B" }, "b")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .unit(P1, "base", { might: 8, name: "Brute" }, "brute")
    .autoProcedures(auto);
}

/** Brute attacks; P1 passes Focus; P2 (with Focus) flips Zhonya's for [0]. */
async function flipDuringShowdown(game: Game): Promise<void> {
  await game.p1.move("brute", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zh")).toBe(true);
  await game.p2.reveal("zh");
  expect(game.zoneOf("zh")).toBe("base"); // a gear: in play on P2's board now
  expect(game.p2.energy()).toBe(0);
}

describe("Ruling 000f1dd68cfb26c7 — flip Zhonya's during the showdown; with simultaneous deaths its controller picks the survivor", () => {
  test("Zhonya's CAN be flipped from face-down while P2 holds Focus in the showdown (before any combat damage)", async () => {
    const game = await board().build();
    await flipDuringShowdown(game);
    expect(game.state("a").damage).toBe(0);
    expect(game.state("b").damage).toBe(0);
  });

  test("it can NOT be flipped once both players have passed: the showdown has ended and the only thing left is combat resolution — no priority, no reveal option for P2 (nor for P1)", async () => {
    const game = await board(false).build(); // surface the combat-resolution step instead of auto-running it
    await game.p1.move("brute", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("reveal", "zh")).toBe(true); // last chance was here
    await game.p2.passFocus();
    // Showdown closed → damage assignment/dealing is a procedure, not a priority window.
    expect(game.decision()).toMatchObject({ kind: "action" });
    expect((game.decision() as { context?: string }).context).not.toBe("showdown");
    expect((game.decision() as { context?: string }).context).not.toBe("chain");
    expect(game.p2.can("reveal", "zh")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("reveal");
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("cast");
    expect(game.p1.legal().map((o) => o.verb)).toContain("resolveCombat");
    // Run the combat: 8 into 2+2 — both defenders die, Zhonya's never entered play, Brute conquers.
    await game.p1.choose(game.p1.legal().find((o) => o.verb === "resolveCombat")!.key);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash"); // orphaned face-down card at a lost battlefield
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("flipped in time: combat damage (8) is assigned in full and dealt to A and B simultaneously — both would die at once, so P2 (their controller) is asked WHICH death Zhonya's replaces (a replacement-assign pick for P2 offering a and b)", async () => {
    const game = await board().build();
    await flipDuringShowdown(game);
    const r = await game.settle(); // both pass; combat damage assigned & dealt
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-assign", timing: "RPL" });
    expect((d as PickD).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["a", "b"]);
    expect((d as PickD).min).toBe(1);
    expect((d as PickD).max).toBe(1);
  });

  test("P2 picks B: Zhonya's is killed instead, B is healed, exhausted and recalled to base; A dies; the Brute conquers bf1", async () => {
    const game = await board().build();
    await flipDuringShowdown(game);
    await game.settle();
    await game.p2.pick("b");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["zh", "a"]));
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("…or P2 picks A instead — the choice is genuinely P2's: A survives in base, B dies", async () => {
    const game = await board().build();
    await flipDuringShowdown(game);
    await game.settle();
    await game.p2.pick("a");
    await game.settle();
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
  });
});
