/**
 * Qiyana, Victorious — ogn-155-298 · Champion Unit (Qiyana) · Body · 4 energy + [body] · 4 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   When I conquer, draw 1 or channel 1 rune exhausted.
 *
 * Rules: 809 (Deflect — opponents pay 1 extra power of any domain to choose me),
 * 467 (conquer), channel "exhausted" stipulation.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-155-298";
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** Qiyana walks into an empty enemy-held battlefield → conquers → the trigger asks for a mode. */
async function conquer() {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "qiyana")
    .build();
  const hand0 = game.p1.hand().length;
  const runes0 = game.p1.runes().length;
  await game.p1.move("qiyana", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return { game, hand0, runes0 };
}

describe("Qiyana, Victorious (ogn-155-298)", () => {
  test("cost: 4 energy + 1 body; 4-Might unit with Deflect lands in base", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { body: 1 } }).hand(P1, CARD, "qiyana").build();
    await game.p1.play("qiyana");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("qiyana")).toBe("base");
    expect(game.state("qiyana").might).toBe(4);
    expect(game.state("qiyana").keywords).toContain("Deflect");
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "qiyana").build();
    expect(noPower.p1.can("play", "qiyana")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).hand(P1, CARD, "qiyana").build();
    expect(noEnergy.p1.can("play", "qiyana")).toBe(false);
  });

  test("Deflect: an opponent's spell cannot choose Qiyana without a power to pay; with one it can and pays it", async () => {
    const broke = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "qiyana").hand(P2, BOLT, "bolt").build();
    const r = await broke.p2.try((p) => p.cast("bolt", { targets: "qiyana" }));
    expect(r.ok).toBe(false);
    expect(broke.zoneOf("bolt")).toBe("hand");

    const rich = await scenario().active(P2).resources(P2, { energy: 1, power: { mind: 1 } }).unit(P1, "base", CARD, "qiyana").hand(P2, BOLT, "bolt").build();
    await rich.p2.cast("bolt", { targets: "qiyana" });
    expect(rich.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await rich.settle();
    expect(rich.zoneOf("qiyana")).toBe("trash");
  });

  test("When I conquer: the controller is asked to choose between 'draw 1' and 'channel 1 rune exhausted'", async () => {
    const { game } = await conquer();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" && d.options.length).toBe(2);
  });

  test("mode 1 — draw 1: hand grows by one, rune pool unchanged", async () => {
    const { game, hand0, runes0 } = await conquer();
    await game.p1.chooseMode(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.runes()).toHaveLength(runes0);
  });

  test("mode 2 — channel 1 rune exhausted: one more rune in the pool, and it is exhausted; no draw", async () => {
    const { game, hand0, runes0 } = await conquer();
    await game.p1.chooseMode(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(runes0);
  });

  test("only on conquer: holding an already-controlled battlefield triggers nothing", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "base", CARD, "qiyana").build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("qiyana", "bf1");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.hand()).toHaveLength(hand0);
  });
});
