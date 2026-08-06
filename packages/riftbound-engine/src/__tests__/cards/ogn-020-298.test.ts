/**
 * Scrapyard Champion — ogn-020-298 · Unit · Fury · 5 energy + 1 fury power · 5 Might
 *
 *   [Legion] — When you play me, discard 2, then draw 2.
 *   (Get the effect if you've played another card this turn.)
 *
 * Legion (rule 812): the play trigger is only active if another card was
 * finalized by the same player earlier this turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-020-298";
const SKULKER = "ogn-175-298";
const CHEAP = { energyCost: 1, might: 1, name: "Cheap Recruit" };

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .hand(P1, CARD, "sc")
    .hand(P1, CHEAP, "cheap")
    .hand(P1, SKULKER, "a")
    .hand(P1, SKULKER, "b")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
}

describe("Scrapyard Champion (ogn-020-298)", () => {
  test("cost: 5 energy + 1 fury for a 5-Might unit in base; unaffordable short of either", async () => {
    const game = await board().build();
    await game.p1.play("sc");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    expect(game.zoneOf("sc")).toBe("base");
    expect(game.state("sc").might).toBe(5);
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sc").build();
    expect(noPower.p1.can("play", "sc")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "sc").build();
    expect(noEnergy.p1.can("play", "sc")).toBe(false);
  });

  test("without Legion (first card you play this turn) nothing is discarded or drawn", async () => {
    const game = await board().build();
    await game.p1.play("sc");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.hand().sort()).toEqual(["a", "b", "cheap"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("d1")).toBe("mainDeck");
  });

  test.failing("BUG: with Legion (another card played earlier this turn) you discard 2, then draw 2", async () => {
    // Expected: after Cheap Recruit was played, playing Scrapyard Champion discards a+b
    // (the only two cards left) and then draws d1+d2. Actual: the Legion-gated play
    // trigger never fires — hand and trash are untouched.
    const game = await board().build();
    await game.p1.play("cheap");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.p1.play("sc");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("a", "b");
      await game.settle();
    }
    expect(game.p1.trash().sort()).toEqual(["a", "b"]);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });

  test.failing("BUG: Legion discard is a choice — with 3 other cards in hand the player picks which 2 to discard, then draws 2", async () => {
    // Expected: a 2-card pick prompt among cheap2/a/b; the unpicked card stays. Actual: no prompt, no effect.
    const game = await board().resources(P1, { energy: 7 }).hand(P1, CHEAP, "cheap2").build();
    await game.p1.play("cheap");
    await game.p1.play("sc");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("a", "b");
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["a", "b"]);
    expect(game.p1.hand().sort()).toEqual(["cheap2", "d1", "d2"]);
  });
});
