/**
 * Ruling f6329c9e20a5bc0c — Sett, Brawler (OGN-164 → ogn-164-298) · Champion Unit · Body · [5][body] · 4 Might
 *     "When I'm played and when I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)
 *      Spend my buff: Give me +4 [Might] this turn."
 *
 * Q: Sett gets a +1 buff when played; two turns later he conquers — does he end up with +2, or do buffs not stack?
 * A: Buffs do not stack. A unit may carry only ONE buff, and a second is simply not placed, so the conquer
 *    leaves him exactly where he was. To get value you spend the buff first — then the conquer gives a fresh one.
 * Rules: 702.3 (at most one Buff on a unit), 702.3.a (a buff added to an already-buffed unit is not placed),
 *        702.2.b (spending a buff removes it).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT_BRAWLER = "ogn-164-298";

/** P1's turn. bf1 is open. `buffed` seeds Sett as the already-buffed unit he is two turns after being played. */
function boardWithSettOnBoard(buffed: boolean) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P1, "base", SETT_BRAWLER, "sett", buffed ? { buffed: true } : undefined);
}

describe("Ruling f6329c9e20a5bc0c — Sett's buffs do not stack", () => {
  test("playing him buffs him once: 4 printed → 5 Might, carrying one buff", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .hand(P1, SETT_BRAWLER, "sett")
      .build();
    await game.p1.play("sett");
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: an already-buffed Sett conquering gains nothing — still 5 Might with one buff", async () => {
    const game = await boardWithSettOnBoard(true).build();
    expect(game.state("sett").might).toBe(5);
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // he did conquer …
    expect(game.p1.points()).toBe(1);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5); // … and the second buff was NOT placed (not 6)
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an UNbuffed Sett conquering does get the +1", async () => {
    const game = await boardWithSettOnBoard(false).build();
    expect(game.state("sett").might).toBe(4);
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);
  });

  test("the line the ruling recommends: spend the buff first (+4 this turn), then the conquer hands him a fresh one", async () => {
    const game = await boardWithSettOnBoard(true).build();
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(false); // the buff was spent …
    expect(game.state("sett").might).toBe(8); // … for +4 this turn (4 + 4)
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("sett").isBuffed).toBe(true); // a NEW buff, because he had none
    expect(game.state("sett").might).toBe(9); // 4 + 4 this turn + 1 buff
    expect(game.violations()).toEqual([]);
  });
});
