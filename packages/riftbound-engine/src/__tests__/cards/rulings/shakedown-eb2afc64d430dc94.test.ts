/**
 * Ruling eb2afc64d430dc94 — Shakedown (OGN-033 → ogn-033-298) · [Reaction] [2][fury]
 *   "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *
 * Q: The [Reaction] reminder says "play any time" — when can a Reaction actually be played?
 * A: Only when you have PRIORITY, which the rules hand out in limited windows. One of those windows is
 *    "after a card goes on the chain, before it resolves" — every player gets priority then, including the
 *    controller of the chosen unit (they need not be a "relevant player"). The reminder text is a simplification.
 * Rules: 340 (priority passes on the chain), 158.2 (Reaction timing), 310 (Open/Closed state).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHAKEDOWN = "ogn-033-298";

/** P1's turn. Each player holds a Shakedown and the [2][fury] for it; each has a unit the other can choose. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .unit(P1, "base", { might: 8, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 8, name: "Theirs" }, "theirs")
    .hand(P1, SHAKEDOWN, "shake1")
    .hand(P2, SHAKEDOWN, "shake2");
}

describe("Ruling eb2afc64d430dc94 — a Reaction is playable only in a priority window, but every chain item opens one", () => {
  test("'any time' is not literal: on P1's open main phase P2 holds no priority and cannot cast their Reaction", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "shake2")).toBe(false);
    const r = await game.p2.try((p) => p.cast("shake2", { targets: "mine" }));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } });
  });

  test("putting Shakedown on the chain opens a priority window: P1 holds priority first …", async () => {
    const game = await board().build();
    await game.p1.cast("shake1", { targets: "theirs" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shake1"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("… and once P1 passes, the targeted unit's controller gets priority and CAN answer with their own Reaction", async () => {
    const game = await board().build();
    await game.p1.cast("shake1", { targets: "theirs" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "shake2")).toBe(true);
    await game.p2.cast("shake2", { targets: "mine" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shake1", "shake2"]);
    expect(game.violations()).toEqual([]);
  });

  test("the whole thing then resolves LIFO — P2's Shakedown first; each unit's controller answers its own Shakedown", async () => {
    const game = await board().build();
    await game.p1.cast("shake1", { targets: "theirs" });
    await game.p1.passPriority();
    await game.p2.cast("shake2", { targets: "mine" });
    await game.settle();
    // Each Shakedown asks the CHOSEN unit's controller which half happens.
    while (game.decision()?.kind === "pick" && game.decision()?.context !== "main") {
      const d = game.decision();
      if (!d || d.kind !== "pick") break;
      await game.seat(d.seat).pick(d.options[0]!.key);
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("shake1")).toBe("trash");
    expect(game.zoneOf("shake2")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
