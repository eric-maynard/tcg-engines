/**
 * Sivir, Mercenary — sfd-143-221 · Champion Unit (Sivir) · Chaos · 4 energy + [chaos] · 4 Might
 *
 *   [Accelerate] (You may pay [1][chaos] as an additional cost to have me enter ready.)
 *   If you've spent at least [rainbow][rainbow] this turn, I have +2 [Might] and [Ganking].
 *   (I can move from battlefield to battlefield.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. "[rainbow][rainbow]" is two POWER of ANY domain(s) spent this turn by Sivir's controller —
 *      energy never counts, unspent power sitting in the pool never counts, and 1 power is one short.
 *   2. Self-synergy: Sivir's own cost is [chaos]; played WITH Accelerate she has spent [chaos][chaos]
 *      as she lands → she is immediately a ready 6-Might Ganking unit. Played plain she has spent only
 *      one power → a 4 with no Ganking (unless something else was paid for earlier this turn).
 *   3. It is a conditional PASSIVE (364.3.a), continuously re-evaluated: paying two power for
 *      anything else later in the turn switches it on for a Sivir already on the board; "this turn"
 *      means it is off again once the turn passes (checked across game.advanceTurn()).
 *   4. Ganking (810 / 144.4.c.1) is what makes battlefield→battlefield moves legal; without the
 *      condition met such a move must be refused.
 *   5. Accelerate (805): optional additional cost [1][chaos]; the power pip must be CHAOS
 *      (805.1.a.1); paid → enters ready, unpaid → enters exhausted (143.4).
 *
 * Engine status: the parser dropped the "+2 [Might]" half and the "[rainbow][rainbow]" amount, and the
 * engine has no notion of power spent this turn (unknown condition ⇒ always true), so Ganking is
 * always on and the Might bonus never appears — those clauses are BUG tests below.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-143-221";
/** A 0-energy unit costing two FURY power — paying for it is "spending [rainbow][rainbow]". */
const HIRED_BLADE = { cardType: "unit", domain: "fury", energyCost: 0, might: 1, name: "Hired Blade", powerCost: ["fury", "fury"] } as const;
/** Same, but only one power. */
const CHEAP_BLADE = { ...HIRED_BLADE, name: "Cheap Blade", powerCost: ["fury"] } as const;

/** P1's turn: Sivir already on bf1 (ready), an enemy-held bf2, and Blades in hand with fury to pay for them. */
function onBoard(fury = 3) {
  return scenario()
    .resources(P1, { energy: 0, power: { fury } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "sivir")
    .unit(P2, "bf2", { might: 5, name: "Warden" }, "warden")
    .hand(P1, HIRED_BLADE, "blade")
    .hand(P1, CHEAP_BLADE, "cheap");
}

describe("Sivir, Mercenary (sfd-143-221)", () => {
  test("registry payload should be Accelerate [1][chaos] + ONE conditional static (spent ≥ 2 power) granting BOTH +2 Might and Ganking", async () => {
    // Expected (cf. Gustwalker / Brutal Hunter parses): a static whose effect is a sequence of
    // modify-might +2 and grant-keyword Ganking, gated on { type: "spent-power", amount: 2 }.
    // Actual: the static carries only the Ganking grant and a bare { type: "spent-power" } condition.
    const game = await scenario().unit(P1, "base", CARD, "sivir").build();
    expect(game.state("sivir")).toMatchObject({ baseMight: 4, cardType: "unit", energyCost: 4, name: "Sivir, Mercenary" });
    expect(game.state("sivir").powerCost).toEqual(["chaos"]);
    const abilities = peekDefaultCardPool()?.get(CARD)?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ cost: { energy: 1, power: ["chaos"] }, keyword: "Accelerate", type: "keyword" });
    expect(abilities[1]).toMatchObject({ condition: { amount: 2, type: "spent-power" }, type: "static" });
    const effects = JSON.stringify((abilities[1] as { effect: unknown }).effect);
    expect(effects).toContain('"type":"modify-might"');
    expect(effects).toContain('"amount":2');
    expect(effects).toContain('"keyword":"Ganking"');
  });

  test("cost: 4 energy + 1 chaos, enters EXHAUSTED without Accelerate; short on energy or with off-domain power it is not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "sivir").build();
    await game.p1.play("sivir");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("sivir")).toBe("base");
    expect(game.state("sivir")).toMatchObject({ isExhausted: true, might: 4 });
    expect((await scenario().resources(P1, { energy: 3, power: { chaos: 2 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
  });

  test("Accelerate: 5 energy + [chaos][chaos] in total and she enters READY (805.1.a)", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).hand(P1, CARD, "sivir").build();
    await game.p1.play("sivir", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("sivir")).toBe("base");
    expect(game.state("sivir").isReady).toBe(true);
  });

  test("Accelerate's power pip must be CHAOS (805.1.a.1): 5 energy + chaos + fury cannot accelerate, only the plain exhausted play", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 1, fury: 1 } }).hand(P1, CARD, "sivir").build();
    const r = await game.p1.try((p) => p.play("sivir", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sivir")).toBe("hand");
    await game.p1.play("sivir");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0, fury: 1 } });
    await game.settle();
    expect(game.state("sivir").isExhausted).toBe(true);
  });

  test("nothing spent this turn → a plain 4-Might unit WITHOUT Ganking; a battlefield→battlefield move is refused", async () => {
    // Expected: condition false at the start of a fresh turn → no keyword, might 4, bf1→bf2 illegal.
    // Actual: the unknown `spent-power` condition defaults to true, so Ganking is always granted.
    const game = await onBoard().build();
    expect(game.state("sivir").might).toBe(4);
    expect(game.state("sivir").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "sivir")).toBe(false);
    const r = await game.p1.try((p) => p.move("sivir", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("sivir")).toBe("bf1");
  });

  test("after paying [fury][fury] for another card this turn, Sivir on the board becomes 6 Might with Ganking (any domain counts as [rainbow])", async () => {
    // Expected: continuous re-evaluation (364.3.a) — spending two power of ANY domain flips it on.
    // Actual: no power-spent tracking and no +2 Might clause → might stays 4.
    const game = await onBoard().build();
    await game.p1.play("blade", { to: "base" });
    expect(game.p1.power("fury")).toBe(1);
    await game.settle();
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("sivir").might).toBe(6);
    expect(game.state("sivir").keywords).toContain("Ganking");
  });

  test("with two power spent this turn she may move battlefield → battlefield and fights there", async () => {
    const game = await onBoard().build();
    await game.p1.play("blade", { to: "base" });
    await game.settle();
    await game.p1.move("sivir", "bf2");
    expect(game.locationOf("sivir")).toBe("bf2");
    await game.settle();
    // Rules: 6 vs 5 → Warden dies and Sivir conquers. (With the engine's missing +2 it is 4 vs 5.)
    expect(game.zoneOf("sivir") === "battlefield-bf2" || game.zoneOf("sivir") === "trash").toBe(true);
  });

  test("the Ganking move above should be a 6-vs-5 win — Warden dies, Sivir conquers bf2 for a point", async () => {
    // Expected: +2 Might applies (spent [fury][fury]) → 6 ≥ 5 kills Warden, 5 < 6 Sivir survives.
    // Actual: Sivir fights as a 4 and dies.
    const game = await onBoard().build();
    await game.p1.play("blade", { to: "base" });
    await game.settle();
    await game.p1.move("sivir", "bf2");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("sivir")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("exactly ONE power spent is one short — still 4 Might, no Ganking", async () => {
    // Expected: "at least [rainbow][rainbow]" needs 2; paying [fury] for Cheap Blade leaves it off.
    // Actual: Ganking is granted unconditionally.
    const game = await onBoard().build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.p1.power("fury")).toBe(2); // paid 1 of 3 — the 2 left in the pool are NOT "spent"
    expect(game.state("sivir").might).toBe(4);
    expect(game.state("sivir").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "sivir")).toBe(false);
  });

  test("unspent power and spent ENERGY do not count — 6 fury in the pool + a 2-energy play leaves her a plain 4", async () => {
    // Expected: only POWER actually paid counts; energy paid for the filler and power merely held do not.
    // Actual: Ganking always on.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 6 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sivir")
      .hand(P1, { cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: "Recruit" }, "recruit")
      .build();
    await game.p1.play("recruit", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 6 } });
    expect(game.state("sivir").might).toBe(4);
    expect(game.state("sivir").keywords).not.toContain("Ganking");
  });

  test("self-synergy — played WITH Accelerate she has spent [chaos][chaos]: lands ready as a 6 with Ganking; played plain (one [chaos]) she is a 4 without it", async () => {
    // Expected: the Accelerate pip is power spent this turn too (2 total) → condition met on arrival.
    // Actual: might 4 in both cases (no +2 clause), Ganking in both cases (condition ignored).
    const accel = await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).hand(P1, CARD, "sivir").build();
    await accel.p1.play("sivir", { accelerate: true });
    await accel.settle();
    expect(accel.state("sivir")).toMatchObject({ isReady: true, might: 6 });
    expect(accel.state("sivir").keywords).toContain("Ganking");
    const plain = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "sivir").build();
    await plain.p1.play("sivir");
    await plain.settle();
    expect(plain.state("sivir").might).toBe(4);
    expect(plain.state("sivir").keywords).not.toContain("Ganking");
  });

  test("'this turn' — the bonus earned by spending two power is gone once the turn passes to the opponent and on your next turn", async () => {
    // Expected: 6/Ganking during the spending turn; 4/no Ganking during P2's turn and at the start of
    // P1's next turn (nothing spent yet). Actual: never 6, always Ganking.
    const game = await onBoard().build();
    await game.p1.play("blade", { to: "base" });
    await game.settle();
    expect(game.state("sivir").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sivir").might).toBe(4);
    expect(game.state("sivir").keywords).not.toContain("Ganking");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sivir").might).toBe(4);
    expect(game.p1.can("gank", "sivir")).toBe(false);
  });

  test("negative space: the OPPONENT spending two power on their turn does nothing for your Sivir", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sivir")
      .hand(P2, HIRED_BLADE, "theirs")
      .build();
    await game.p2.play("theirs", { to: "base" });
    await game.settle();
    expect(game.p2.power("fury")).toBe(0);
    expect(game.state("sivir").might).toBe(4);
  });
});
