/**
 * Jaull-Fish — sfd-103-221 · Unit · Body · 7 energy + [body][body] · 6 Might
 *
 *   [Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)
 *   I cost [2] less for each of your [Mighty] units. (A unit is Mighty while it has 5+ [Might].)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. "Mighty" is CURRENT Might on the board (708/710): a buffed 4 (=5) counts, a plain 4 does not,
 *      damage never lowers Might so a wounded 5 still counts; only YOUR units count, never the enemy's,
 *      and the Jaull-Fish being played (in hand / on the chain) is not one of "your units".
 *   2. The discount is [2] ENERGY per Mighty unit — the [body][body] power is never reduced — and
 *      Energy cannot go below 0 (356.6): four Mighty units make it 0 + [body][body], not −1.
 *   3. Accelerate (805) is an optional ADDITIONAL cost [1][body] applied at 356.2, before discounts
 *      (356.4); "Discounts can reduce additional costs, including to 0" (356.4.f), so with four Mighty
 *      units an accelerated Jaull-Fish costs 0 energy + [body]×3 and still enters ready (356.4.f.1).
 *   4. A resolved Jaull-Fish is itself Mighty, so the second copy is [2] cheaper (self-synergy).
 *   5. Units enter exhausted (143.4) unless Accelerate was paid; Accelerate needs a BODY power
 *      (805.1.a.1) — an off-domain power cannot pay it.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-103-221";

/** P1 holds Jaull-Fish with exactly `energy` + `body` power; `mighty` friendly 5-Might units sit in base. */
function withMighty(mighty: number, energy: number, body = 2) {
  const b = scenario().resources(P1, { energy, power: { body } }).hand(P1, CARD, "fish");
  for (let i = 0; i < mighty; i++) {
    b.unit(P1, "base", { might: 5, name: `Brute ${i + 1}` }, `brute${i + 1}`);
  }
  return b;
}

describe("Jaull-Fish (sfd-103-221)", () => {
  test("registry payload: Accelerate [1][body] + a self cost-reduction of [2] energy scaled by your Mighty units", async () => {
    const game = await withMighty(0, 0).build();
    expect(game.state("fish")).toMatchObject({ baseMight: 6, cardType: "unit", energyCost: 7, name: "Jaull-Fish" });
    expect(game.state("fish").powerCost).toEqual(["body", "body"]);
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      { cost: { energy: 1, power: ["body"] }, keyword: "Accelerate", type: "keyword" },
      { effect: { reduction: ":rb_energy_2:", scope: "for each of your [Mighty] units", target: "self", type: "cost-reduction" }, type: "static" },
    ]);
  });

  test("no Mighty units: full price 7 energy + 2 body; enters the base EXHAUSTED as a 6-Might (itself Mighty) unit", async () => {
    const game = await withMighty(0, 7).build();
    await game.p1.play("fish");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("fish")).toBe("base");
    expect(game.state("fish")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.state("fish").keywords).toContain("Accelerate");
    expect((await withMighty(0, 6).build()).p1.can("play", "fish")).toBe(false);
    expect((await withMighty(0, 7, 1).build()).p1.can("play", "fish")).toBe(false);
    // Off-domain power does not pay a [body] pip.
    expect((await scenario().resources(P1, { energy: 7, power: { fury: 2 } }).hand(P1, CARD, "fish").build()).p1.can("play", "fish")).toBe(false);
  });

  test("one friendly Mighty unit → costs 5 energy (+2 body)", async () => {
    // Expected: 7 − 2 = 5 energy is enough and is fully spent. Actual: the parsed scope
    // "for each of your [Mighty] units" is not one the cost engine counts, so the price stays 7.
    const game = await withMighty(1, 5).build();
    expect(game.p1.can("play", "fish")).toBe(true);
    await game.p1.play("fish");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("fish")).toBe("base");
  });

  test("the discount scales — two Mighty → 3 energy, three Mighty → 1 energy; the [body][body] is never discounted", async () => {
    const two = await withMighty(2, 3).build();
    expect(two.p1.can("play", "fish")).toBe(true);
    await two.p1.play("fish");
    expect(two.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    const three = await withMighty(3, 1).build();
    expect(three.p1.can("play", "fish")).toBe(true);
    expect((await withMighty(3, 1, 1).build()).p1.can("play", "fish")).toBe(false); // power still due in full
  });

  test("four Mighty units floor the Energy cost at 0 (356.6) — playable with 0 energy + 2 body, and nothing goes negative", async () => {
    const game = await withMighty(4, 0).build();
    expect(game.p1.can("play", "fish")).toBe(true);
    await game.p1.play("fish");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("fish")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("Mighty is CURRENT Might (710) — a buffed 4-Might unit (=5) and a damaged 5-Might unit both count → 3 energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 2 } })
      .unit(P1, "base", { might: 4, name: "Buffed Four" }, "buffed", { buffed: true })
      .unit(P1, "base", { might: 5, name: "Wounded Five" }, "wounded", { damage: 3 })
      .hand(P1, CARD, "fish")
      .build();
    expect(game.state("buffed").might).toBe(5);
    expect(game.state("wounded").might).toBe(5);
    expect(game.p1.can("play", "fish")).toBe(true);
    await game.p1.play("fish");
    expect(game.p1.energy()).toBe(0);
  });

  test("negative space: ENEMY Mighty units and friendly 4-Might units give no discount (6 energy is still short)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { body: 2 } })
      .unit(P2, "base", { might: 7, name: "Their Giant" }, "giant")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Their Brute" }, "theirs")
      .unit(P1, "base", { might: 4, name: "Almost" }, "almost")
      .hand(P1, CARD, "fish")
      .build();
    expect(game.p1.can("play", "fish")).toBe(false);
    const seven = await scenario().resources(P1, { energy: 7, power: { body: 2 } }).unit(P2, "base", { might: 7 }, "giant").unit(P1, "base", { might: 4 }, "almost").hand(P1, CARD, "fish").build();
    await seven.p1.play("fish");
    expect(seven.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("Accelerate: 7 + 1 energy and [body]×3 in total; enters READY", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { body: 3 } }).hand(P1, CARD, "fish").build();
    await game.p1.play("fish", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("fish")).toBe("base");
    expect(game.state("fish").isReady).toBe(true);
  });

  test("Accelerate needs the extra [body] (805.1.a.1): with 8 energy + body,body,fury only the plain (exhausted) play is possible", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { body: 2, fury: 1 } }).hand(P1, CARD, "fish").build();
    const r = await game.p1.try((p) => p.play("fish", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fish")).toBe("hand");
    await game.p1.play("fish");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0, fury: 1 } });
    await game.settle();
    expect(game.state("fish").isExhausted).toBe(true);
  });

  test("Accelerate + discount — with four Mighty units the [2]-per-unit discount also eats the Accelerate energy (356.4.f): 0 energy + [body]×3, enters ready", async () => {
    // Expected: total energy max(0, 7 + 1 − 8) = 0; power body×3; the optional cost still counts as paid
    // (356.4.f.1) so it enters ready. Actual: no discount is applied at all (needs 8 energy).
    const game = await withMighty(4, 0, 3).build();
    await game.p1.play("fish", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("fish").isReady).toBe(true);
  });

  test("self-synergy — a Jaull-Fish already on the board is Mighty, so the second copy costs 5", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 2 } }).unit(P1, "base", CARD, "first").hand(P1, CARD, "second").build();
    expect(game.state("first").might).toBe(6);
    expect(game.p1.can("play", "second")).toBe(true);
    await game.p1.play("second");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("the copy being played never discounts itself: alone, a Jaull-Fish in hand (printed 6) still needs the full 7", async () => {
    // Rule 711 makes a unit in hand 'Mighty' by printed Might, but "your units" are the ones you control
    // on the board — the card on its way to the chain is not among them.
    const game = await withMighty(0, 5).build();
    expect(game.p1.can("play", "fish")).toBe(false);
  });

  test("in combat it is just a 6: attacking a lone 5-Might defender kills it and conquers (ready via Accelerate, same turn)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { body: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "wall")
      .hand(P1, CARD, "fish")
      .build();
    await game.p1.play("fish", { accelerate: true });
    await game.settle();
    expect(game.state("fish").isReady).toBe(true);
    await game.p1.move("fish", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("fish")).toBe("bf1");
    expect(game.state("fish").damage).toBe(0); // combat cleanup heals the 5 it took (143.3.b.2)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
