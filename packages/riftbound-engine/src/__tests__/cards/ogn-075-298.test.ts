/**
 * Tasty Faefolk — ogn-075-298 · Unit · Calm · 7 energy · 6 might
 *
 *   [Accelerate] (You may pay [1][calm] as an additional cost to have me enter ready.)
 *   [Deathknell] — Channel 2 runes exhausted and draw 1. (When I die, get the effect.)
 *
 * Rule 805 (Accelerate: optional additional cost → enters ready), 143.4 (units enter exhausted),
 * rule 808 (Deathknell triggers when the permanent dies).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-075-298";
// Inline 0-cost spell that deals lethal damage, so the test controls exactly when Faefolk dies.
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

describe("Tasty Faefolk (ogn-075-298)", () => {
  test("cost: 7 energy, enters exhausted when Accelerate is not paid; 6 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "fae").build();
    await game.p1.play("fae");
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("fae").isExhausted).toBe(true);
    expect(game.state("fae").might).toBe(6);
    const poor = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "fae").build();
    expect(poor.p1.can("play", "fae")).toBe(false);
  });

  test("Accelerate: paying an extra [1][calm] (8 energy + 1 calm total) has it enter ready", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { calm: 1 } }).hand(P1, CARD, "fae").build();
    await game.p1.play("fae", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").isExhausted).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("Accelerate: cannot be paid without a calm power (7 energy + fury power → only the plain play)", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { fury: 1 } }).hand(P1, CARD, "fae").build();
    const r = await game.p1.try((p) => p.play("fae", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fae")).toBe("hand");
    await game.p1.play("fae", { accelerate: false });
    await game.settle();
    expect(game.state("fae").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
  });

  test("Deathknell: when it dies, channel 2 runes exhausted", async () => {
    const game = await scenario().unit(P1, "base", CARD, "fae").hand(P1, BOLT, "bolt").build();
    expect(game.p1.runes()).toHaveLength(0);
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.cast("bolt", { targets: "fae" });
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // both channeled exhausted
    expect(game.p1.runeDeck().length).toBe(runeDeck - 2);
    expect(game.p1.energy()).toBe(0); // exhausted runes yield nothing by themselves
  });

  test.failing("BUG: Deathknell also draws 1 (\"Channel 2 runes exhausted AND draw 1\")", async () => {
    // Expected: after Faefolk dies P1's hand grows by one card (bolt is gone, +1 drawn = 1).
    // Actual: the parsed Deathknell effect only carries the channel clause; no card is drawn.
    const game = await scenario().unit(P1, "base", CARD, "fae").hand(P1, BOLT, "bolt").build();
    const deck = game.p1.deck().length;
    await game.p1.cast("bolt", { targets: "fae" });
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck().length).toBe(deck - 1);
  });

  test("Deathknell does not fire while Faefolk survives damage", async () => {
    const PING = { ...BOLT, abilities: [{ ...BOLT.abilities[0], effect: { ...BOLT.abilities[0].effect, amount: 3 } }], name: "Ping" };
    const game = await scenario().unit(P1, "base", CARD, "fae").hand(P1, PING, "ping").build();
    await game.p1.cast("ping", { targets: "fae" });
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").damage).toBe(3);
    expect(game.p1.runes()).toHaveLength(0);
  });
});
