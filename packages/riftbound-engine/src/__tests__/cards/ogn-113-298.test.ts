/**
 * Malzahar, Fanatic — ogn-113-298 · Champion Unit (Malzahar) · Mind · 4 energy · 3 might
 *
 *   Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow].
 *   (Use on your turn or in showdowns. Abilities that add resources can't be reacted to.)
 *
 * Rule 377 (activated abilities: cost before ":"), rule 429.2.a (Add abilities don't pass
 * priority — they resolve immediately), rule 313.1.a / 347 ([Action] in showdowns needs Focus).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-113-298";

function board() {
  return scenario()
    .unit(P1, "base", CARD, "malz")
    .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
    .gear(P1, { cardType: "gear", name: "Trinket" }, "trinket")
    .unit(P2, "base", { might: 1, name: "NotYours" }, "theirs");
}

describe("Malzahar, Fanatic (ogn-113-298)", () => {
  test("cost: 4 energy to play (3 might); not playable with 3", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "malz").build();
    await game.p1.play("malz");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("malz")).toBe("base");
    expect(game.state("malz").might).toBe(3);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "malz").build();
    expect(poor.p1.can("play", "malz")).toBe(false);
  });

  test("activating kills the chosen friendly unit, exhausts Malzahar and adds 2 rainbow power immediately (rule 429.2.a)", async () => {
    // Expected: `activate` is legal with a friendly permanent to sacrifice; fodder → trash, Malzahar
    // exhausted, pool +2 rainbow with nothing left on the chain (Add can't be reacted to).
    // Actual: the kill-cost target resolver finds no legal sacrifice, so the ability is never offered.
    const game = await board().build();
    expect(game.p1.can("activate", "malz")).toBe(true);
    await game.p1.activate("malz", 0, { sacrifice: "fodder" });
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("malz").isExhausted).toBe(true);
    expect(game.zoneOf("theirs")).toBe("base");
  });

  test("a friendly GEAR is also a legal sacrifice for the cost", async () => {
    // Expected: sacrificing the Trinket gear pays the cost just like a unit. Actual: not activatable at all.
    const game = await board().build();
    await game.p1.activate("malz", 0, { sacrifice: "trinket" });
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.zoneOf("fodder")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(2);
  });

  test("cannot be activated while Malzahar is exhausted, nor with nothing else friendly to kill", async () => {
    const exhausted = await scenario()
      .unit(P1, "base", CARD, "malz", { exhausted: true })
      .unit(P1, "base", { might: 1 }, "fodder")
      .build();
    expect(exhausted.p1.can("activate", "malz")).toBe(false);
    const alone = await scenario().unit(P1, "base", CARD, "malz").unit(P2, "base", { might: 1 }, "theirs").build();
    expect(alone.p1.can("activate", "malz")).toBe(false); // Malzahar can't be both killed and exhausted
  });

  test("[Action] timing: not usable on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("activate", "malz")).toBe(false);
  });

  test("[Action] timing — usable during a showdown on the opponent's turn once P1 holds Focus", async () => {
    // Expected: after P2 attacks and passes Focus, P1 may use the [Action] ability mid-showdown.
    // Actual: the ability is never offered (see the kill-cost bug above).
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "malz")
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .build();
    await game.p2.move("poker", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "malz")).toBe(true);
    await game.p1.activate("malz", 0, { sacrifice: "fodder" });
    expect(game.p1.power("rainbow")).toBe(2);
  });
});
