/**
 * Morbid Return — ogn-170-298 · Spell · Chaos · 2 energy (no power)
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Return a unit from your trash to your hand.
 *
 * Rule 806 — Action: playable in an open state on your turn and during showdowns.
 * The chosen card is a unit card in the caster's OWN trash (not a permanent on the board).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-170-298";
const SKULKER = "ogn-175-298"; // vanilla 3-might unit
const HEXTECH_RAY = "ogn-009-298"; // a spell — must not be returnable

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .trash(P1, SKULKER, "deadUnit")
    .trash(P1, HEXTECH_RAY, "deadSpell")
    .trash(P2, SKULKER, "theirDead")
    .hand(P1, CARD, "mr");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Cast Morbid Return choosing `target`, whether the choice is asked at play time or on resolution. */
async function castReturning(game: Built, target: string) {
  const needsTarget = game.p1.option("cast", "mr")?.fields.some((f) => f.arg === "targets" && f.required);
  await game.p1.cast("mr", needsTarget ? { targets: target } : {});
  expect(game.p1.energy()).toBe(0);
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(target);
    await game.settle();
  }
}

describe("Morbid Return (ogn-170-298)", () => {
  test.failing("BUG: costs 2 energy; returns the chosen unit from your trash to your hand; spell goes to trash", async () => {
    // Expected: castable with only a dead unit in your trash; deadUnit ends in hand, Morbid Return in trash.
    // Actual: the engine looks for target units ON THE BOARD, so with an empty board the spell is not legal at all.
    const game = await board().build();
    expect(game.p1.can("cast", "mr")).toBe(true);
    await castReturning(game, "deadUnit");
    expect(game.zoneOf("deadUnit")).toBe("hand");
    expect(game.zoneOf("mr")).toBe("trash");
    expect(game.zoneOf("deadSpell")).toBe("trash");
    expect(game.zoneOf("theirDead")).toBe("trash");
  });

  test("unaffordable with 1 energy", async () => {
    const game = await board(1).unit(P1, "base", { might: 2 }, "alive").build();
    expect(game.p1.can("cast", "mr")).toBe(false);
  });

  test.failing("BUG: only UNIT cards in YOUR TRASH are eligible — not spells, not the opponent's trash, not units on the board", async () => {
    // Expected: the only legal choice is deadUnit. Actual: the legal "targets" are units on the board
    // (here: alive), and resolving it bounces that unit to hand instead.
    const game = await board().unit(P1, "base", { might: 2 }, "alive").build();
    const field = game.p1.option("cast", "mr")?.fields.find((f) => f.arg === "targets");
    if (field) {
      expect(field.options).toEqual([["deadUnit"]]);
    } else {
      await game.p1.cast("mr");
      await game.settle();
      const d = game.decision();
      expect(d?.kind).toBe("pick");
      expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["deadUnit"]);
    }
  });

  test.failing("BUG: a unit on the board can never be 'returned' by Morbid Return", async () => {
    // Expected: choosing a living unit is illegal (or, if the engine accepts the cast, the unit stays put).
    // Actual: the living unit is moved from the base to its owner's hand.
    const game = await board().unit(P1, "base", { might: 2 }, "alive").build();
    const r = await game.p1.try((p) => p.cast("mr", { targets: "alive" }));
    if (r.ok) {
      await game.settle();
    }
    expect(game.zoneOf("alive")).toBe("base");
  });

  test("[Action]: castable during a showdown while you have focus", async () => {
    const game = await board()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "foe")
      .unit(P1, "base", { might: 3 }, "attacker")
      .build();
    await game.p1.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "mr")).toBe(true);
  });

  test("[Action]: not castable on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).unit(P1, "base", { might: 2 }, "alive").build();
    expect(game.p1.can("cast", "mr")).toBe(false);
  });
});
