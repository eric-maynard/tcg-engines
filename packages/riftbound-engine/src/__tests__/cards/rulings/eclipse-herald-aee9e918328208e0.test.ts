/**
 * Ruling aee9e918328208e0 — Eclipse Herald (OGN-059 → ogn-059-298) · Unit · Calm · [7][calm] · 7
 *     "When you stun an enemy unit, ready me and give me +1 [Might] this turn."
 *   × (a stun source; the ruling lists Eclipse UNL-063, but any "you stun" works — here Back Off UNL-042 → unl-042-219,
 *      [3] Action "[Stun] a unit. If you played this from your hand, draw 1.")
 *
 * Q: Does Eclipse Herald ready / get +1 from stuns that happened earlier in the turn, before it was played?
 * A: No. Its trigger only exists while it is on the board; it does not look back at earlier stuns (unlike "when you've played
 *    your 2nd card this turn"-style conditions that track the whole turn). Only stuns after it is in play count. (The +1 is a
 *    Might modification, not a "buff".)
 * Rules: 376 / 383.4 (a triggered ability must exist when its event happens), 140.3 (units enter exhausted), 702 (buff ≠ +Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ECLIPSE_HERALD = "ogn-059-298";
const BACK_OFF = "unl-042-219";

/** P1's turn with exactly [13] + calm (3 + 7 + 3). Herald + two Back Offs in hand; P2 has two units to stun. */
function board() {
  return scenario()
    .resources(P1, { energy: 13, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe A" }, "foeA")
    .unit(P2, "base", { might: 3, name: "Foe B" }, "foeB")
    .hand(P1, ECLIPSE_HERALD, "herald")
    .hand(P1, BACK_OFF, "bo1")
    .hand(P1, BACK_OFF, "bo2");
}

/** Stun Foe A first, THEN play the Herald. */
async function stunThenHerald(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bo1", { targets: "foeA" });
  await game.settle();
  expect(game.state("foeA").isStunned).toBe(true);
  expect(game.p1.energy()).toBe(10);
  await game.p1.play("herald");
  expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 0 } });
  await game.settle();
  expect(game.zoneOf("herald")).toBe("base");
  return game;
}

describe("Ruling aee9e918328208e0 — Eclipse Herald ignores stuns from before it hit the board", () => {
  test("a stun earlier this turn (Back Off on Foe A), then Herald is played: it enters EXHAUSTED at a plain 7 — no retroactive ready, no +1, nothing on the chain", async () => {
    const game = await stunThenHerald();
    expect(game.state("herald")).toMatchObject({ isExhausted: true, isReady: false, might: 7, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("a stun AFTER it is in play (Back Off on Foe B) does trigger it: Herald readies and is 8 this turn — and that +1 is a Might modifier, not a buff", async () => {
    const game = await stunThenHerald();
    await game.p1.cast("bo2", { targets: "foeB" });
    await game.settle();
    expect(game.state("foeB").isStunned).toBe(true);
    expect(game.state("herald")).toMatchObject({ isBuffed: false, isReady: true, might: 8, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
    // Only ONE +1 — the pre-play stun still did not count retroactively.
    await game.advanceTurn();
    expect(game.state("herald")).toMatchObject({ might: 7, mightModifier: 0 }); // "this turn"
  });

  test("control — Herald already on the board when the first stun happens: it readies and gets +1 right away", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", ECLIPSE_HERALD, "herald", { exhausted: true })
      .unit(P2, "bf1", { might: 3, name: "Foe A" }, "foeA")
      .hand(P1, BACK_OFF, "bo1")
      .build();
    expect(game.state("herald")).toMatchObject({ isExhausted: true, might: 7 });
    await game.p1.cast("bo1", { targets: "foeA" });
    await game.settle();
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 8, mightModifier: 1 });
  });
});
