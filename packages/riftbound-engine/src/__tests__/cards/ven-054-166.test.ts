/**
 * Questionable Tome — ven-054-166 · Gear · Mind · 3 energy
 *
 *   [Empower] — [Exhaust] (Pay the cost: Empower me. Use only if not Empowered.)
 *   Disempower this, [1], [Exhaust]: Draw 1.
 *
 * Head-judge checklist (the tricky spots this file covers):
 *  1. Both abilities cost [Exhaust]: Empowering exhausts the Tome, so the draw can NOT follow the same
 *     turn — the natural cadence is Empower (turn N) → awaken → draw (turn N+1) → Empower (N+2)…
 *     Hextech Formula ("[Exhaust]: Empower another gear") breaks the cadence: empowered while still
 *     ready → draw immediately.
 *  2. 827.1.c.1 "Use only if not Empowered": ability #0 disappears while Empowered; Empowered persists
 *     across turns (441.1.a — a state, no duration).
 *  3. Ability #1's costs are all mandatory: must be Empowered (Disempower this), have [1], and be ready.
 *     Missing any one → not offered. Costs are paid on activation (Tome is already disempowered +
 *     exhausted + energy gone while the draw sits on the chain); the draw happens on resolution.
 *  4. Gear enters ready (149.1) → play for 3 and Empower the same turn.
 *  5. Timing (151.2/381): only on your turn, open state, not during a showdown; both abilities use the
 *     chain and give the opponent priority.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-054-166";
const HEXTECH_FORMULA = "ven-062-166"; // Mind gear: This enters exhausted. [Exhaust]: Empower another gear.
const FILLER = "ogn-175-298";

function tomeInPlay(energy: number, meta?: { empowered?: boolean; exhausted?: boolean }) {
  return scenario()
    .resources(P1, { energy })
    .card("tome", { def: CARD, meta, owner: P1, zone: "base" })
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

describe("Questionable Tome (ven-054-166)", () => {
  test("registry payload: #0 Empower for [Exhaust] (only if not Empowered); #1 Disempower this + [1] + [Exhaust]: draw 1", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "mind", energyCost: 3, name: "Questionable Tome" });
    expect(def?.abilities).toEqual([
      { cost: { exhaust: true }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" },
      { cost: { disempower: "self", energy: 1, exhaust: true }, effect: { amount: 1, type: "draw" }, type: "activated" },
    ]);
  });

  test("play cost: 3 energy, no power; enters the base READY and not Empowered, so Empower is usable right away; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "tome").build();
    await game.p1.play("tome");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("tome")).toBe("base");
    expect(game.state("tome")).toMatchObject({ isEmpowered: false, isReady: true });
    expect(game.p1.can("activate", "tome")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("activateAbility:tome#0");
    const poor = await scenario().resources(P1, { energy: 2, power: { mind: 2 } }).hand(P1, CARD, "tome").build();
    expect(poor.p1.can("play", "tome")).toBe(false);
  });

  test("[Empower] — [Exhaust]: exhausting is the cost (paid on activation), Empowered arrives on resolution via the chain; energy untouched", async () => {
    const game = await tomeInPlay(2).build();
    await game.p1.activate("tome", 0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tome", controller: P1, triggered: false })]);
    expect(game.state("tome")).toMatchObject({ isEmpowered: false, isExhausted: true });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // opponent gets a response window
    await game.settle();
    expect(game.state("tome")).toMatchObject({ isEmpowered: true, isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.p1.hand()).toEqual([]); // empowering draws nothing
  });

  test("same turn after Empowering: the draw ability is NOT available (Tome is exhausted) and Empower is gone (already Empowered)", async () => {
    const game = await tomeInPlay(2).build();
    await game.p1.activate("tome", 0);
    await game.settle();
    expect(game.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility"))).toEqual([]);
    const r = await game.p1.try((p) => p.activate("tome", 1));
    expect(r.ok).toBe(false);
    expect(game.p1.hand()).toEqual([]);
  });

  test("full cadence: Empower → (opponent's turn: nothing usable) → next own turn it is still Empowered and ready → pay [1], disempower, exhaust, draw 1", async () => {
    const game = await tomeInPlay(0).build();
    await game.p1.activate("tome", 0);
    await game.settle();
    await game.advanceToTurnOf(P2);
    expect(game.p1.legal()).toEqual([]); // 381: not on the opponent's turn
    expect(game.state("tome").isEmpowered).toBe(true); // persists
    await game.advanceToTurnOf(P1);
    expect(game.state("tome")).toMatchObject({ isEmpowered: true, isReady: true }); // awaken readied it, still Empowered
    expect(game.p1.hand()).toEqual(["d1"]); // draw phase only
    // rule 357.1.a: the pool emptied at end of turn, but the runes channeled this turn are ready and
    // may be exhausted for energy while paying costs — so the [1] is affordable and #1 is offered.
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("activate", "tome")).toBe(true);
    await game.p1.tapRune();
    expect(game.p1.legal().map((o) => o.key)).toContain("activateAbility:tome#1");
    expect(game.p1.legal().map((o) => o.key)).not.toContain("activateAbility:tome#0");
    await game.p1.activate("tome", 1);
    // All three costs are paid up front; the draw waits on the chain.
    expect(game.p1.energy()).toBe(0);
    expect(game.state("tome")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.hand()).toEqual(["d1"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    // Now disempowered + exhausted: neither ability is usable for the rest of the turn.
    expect(game.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility"))).toEqual([]);
  });

  test("draw ability cost edge cases: Empowered+ready but 0 energy → no; Empowered+[1] but exhausted → no; ready+[1] but not Empowered → only Empower offered", async () => {
    const broke = await tomeInPlay(0, { empowered: true }).build();
    expect(broke.state("tome").isEmpowered).toBe(true);
    expect(broke.p1.can("activate", "tome")).toBe(false);
    const tired = await tomeInPlay(1, { empowered: true, exhausted: true }).build();
    expect(tired.p1.can("activate", "tome")).toBe(false);
    const plain = await tomeInPlay(1).build();
    expect(plain.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility"))).toEqual(["activateAbility:tome#0"]);
    const primed = await tomeInPlay(1, { empowered: true }).build();
    expect(primed.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility"))).toEqual(["activateAbility:tome#1"]);
  });

  test("draws exactly 1 per activation and exactly [1] is charged (3 energy → 2 left, one card)", async () => {
    const game = await tomeInPlay(3, { empowered: true }).build();
    await game.p1.activate("tome", 1);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.p1.can("activate", "tome")).toBe(false); // exhausted now, even with 2 energy left
    expect(game.violations()).toEqual([]);
  });

  test("Hextech Formula combo: Formula's [Exhaust] empowers the Tome WITHOUT exhausting it → draw the same turn for [1]", async () => {
    const game = await tomeInPlay(1).gear(P1, HEXTECH_FORMULA, "formula").build();
    await game.p1.activate("formula", 1);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("tome");
      await game.settle();
    }
    expect(game.state("formula").isExhausted).toBe(true);
    expect(game.state("tome")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(game.p1.legal().map((o) => o.key)).toContain("activateAbility:tome#1");
    expect(game.p1.legal().map((o) => o.key)).not.toContain("activateAbility:tome#0"); // 827.1.c.1
    await game.p1.activate("tome", 1);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("tome")).toMatchObject({ isEmpowered: false, isExhausted: true });
  });

  test("441.1.c: empowering an already-Empowered Tome (via Hextech Formula) changes nothing and does not 'stack' a second draw", async () => {
    const game = await tomeInPlay(2, { empowered: true }).gear(P1, HEXTECH_FORMULA, "formula").build();
    await game.p1.activate("formula", 1);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("tome");
      await game.settle();
    }
    expect(game.state("tome").isEmpowered).toBe(true);
    await game.p1.activate("tome", 1);
    await game.settle();
    expect(game.state("tome").isEmpowered).toBe(false); // one Disempower removes the (binary) state
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.can("activate", "tome")).toBe(false);
  });

  test("the draw is a chain item the opponent sees before it resolves: P2 holds priority while P1's hand is still unchanged", async () => {
    const game = await tomeInPlay(1, { empowered: true }).build();
    await game.p1.activate("tome", 1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tome", controller: P1, name: "Questionable Tome" })]);
    expect(game.p1.hand()).toEqual([]);
    await game.p2.passPriority();
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("timing (151.2): gear abilities cannot be used during a Showdown, even with Focus on your own turn", async () => {
    const game = await tomeInPlay(1, { empowered: true })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "attacker")
      .unit(P2, "bf1", { might: 3 }, "defender")
      .build();
    expect(game.p1.can("activate", "tome")).toBe(true);
    await game.p1.move("attacker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "tome")).toBe(false);
    expect(game.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility"))).toEqual([]);
  });
});
