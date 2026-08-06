/**
 * Twisted Fate, Gambler — ogn-200-298 · Champion Unit (Twisted Fate) · Chaos · 4 energy · 4 Might
 *
 *   When I attack, reveal the top rune of your rune deck, then recycle it. Do one of the
 *   following based on its domain:
 *     [fury] — Deal 2 to an enemy unit here and 1 to all other enemy units here.
 *     [mind] — Draw 1.
 *     [order] — Stun an enemy unit.
 *
 * The branch is NOT a player choice: it is dictated by the revealed rune's domain. The rune is
 * recycled (goes to the bottom of the rune deck). "When I attack" fires when he gains the
 * attacker designation (combat opens with him among the attackers).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-200-298";
const FURY_RUNE = "ogn-007-298";
const MIND_RUNE = "ogn-089-298";
const ORDER_RUNE = "ogn-214-298";

/** TF ready in base, two enemy units at bf1, one enemy unit at home; P1's rune deck top = `top`. */
function board(top: string) {
  const rest = [FURY_RUNE, MIND_RUNE, ORDER_RUNE].filter((r) => r !== top);
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "tf")
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 5, name: "Mid" }, "mid")
    .unit(P2, "base", { might: 3, name: "Home" }, "home")
    .runeDeck(P1, [top, ...rest]);
}

async function attackAndResolveTrigger(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  await game.p1.move("tf", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tf", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // trigger resolves now, before any combat damage
}

describe("Twisted Fate, Gambler (ogn-200-298)", () => {
  test("costs 4 energy and enters the base exhausted as a 4-Might unit; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "tf").build();
    await game.p1.play("tf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("tf")).toBe("base");
    expect(game.state("tf").might).toBe(4);
    expect(game.state("tf").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "tf").build();
    expect(poor.p1.can("play", "tf")).toBe(false);
  });

  test("When I attack: moving into an enemy-held battlefield puts his triggered ability on the chain", async () => {
    const game = await board(MIND_RUNE).build();
    await game.p1.move("tf", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tf", name: "Twisted Fate, Gambler", triggered: true })]);
  });

  test("does not trigger when he is the defender", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "tf")
      .unit(P2, "base", { might: 1 }, "poke")
      .runeDeck(P1, [MIND_RUNE])
      .build();
    await game.p2.move("poke", "bf1");
    expect(game.chain().some((i) => i.cardId === "tf")).toBe(false);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(0);
  });

  test.failing("BUG: [mind] on top — the rune is revealed and recycled to the bottom, and P1 draws 1 with no choice to make", async () => {
    // Expected: no prompt at all (the domain decides); hand 0 → 1; rune deck top becomes the next
    // rune and the Mind rune is now at the bottom. Actual: the engine asks for an arbitrary unit
    // "target", then lets the player CHOOSE the mode, and never recycles the rune.
    const game = await board(MIND_RUNE).build();
    await attackAndResolveTrigger(game);
    expect(game.decision()?.kind).toBe("action"); // back to the showdown, nothing to answer
    expect(game.p1.hand()).toHaveLength(1);
    const deck = game.p1.runeDeck();
    expect(game.state(deck[0] as string).name).toBe("Fury Rune");
    expect(game.state(deck[deck.length - 1] as string).name).toBe("Mind Rune");
  });

  test.failing("BUG: [fury] on top — 2 damage to the chosen enemy unit here, 1 to each other enemy unit here, none elsewhere", async () => {
    // Expected: the only prompt is WHICH enemy unit here takes 2 (big | mid); then big=2, mid=1,
    // home=0, TF undamaged, no card drawn. Actual: bogus target prompt (incl. TF and the base
    // unit) followed by a free mode choice.
    const game = await board(FURY_RUNE).build();
    await attackAndResolveTrigger(game);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["big", "mid"]);
    await game.p1.pick("big");
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("big").damage).toBe(2);
    expect(game.state("mid").damage).toBe(1);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("tf").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test.failing("BUG: [order] on top — stun an enemy unit (any location), nothing is damaged or drawn", async () => {
    // Expected: prompt for an ENEMY unit (big | mid | home); picking home stuns it. Actual: see above.
    const game = await board(ORDER_RUNE).build();
    await attackAndResolveTrigger(game);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["big", "home", "mid"]);
    await game.p1.pick("home");
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("home").isStunned).toBe(true);
    expect(game.state("big").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(0);
    const deck = game.p1.runeDeck();
    expect(game.state(deck[deck.length - 1] as string).name).toBe("Order Rune");
  });
});
