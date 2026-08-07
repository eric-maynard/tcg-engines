/**
 * Simian Ancestor — sfd-047-221 · Unit · Calm · 5 energy + [calm] · 5 Might
 *
 *   When you buff me, ready me.
 *
 * Head-judge checklist for this card:
 *  - Rule 426.1.c (printed example is literally this card): choosing an ALREADY-buffed Simian
 *    for a buff effect does not buff it, so the trigger must NOT fire (it stays exhausted).
 *  - "you": only buffs performed by Simian's controller trigger it — an opponent's effect that
 *    buffs it (inline "buff a unit" spell) must not ready it.
 *  - The classic line: units enter exhausted; Pit Rookie's play trigger buffs the fresh Simian →
 *    it readies and can attack the turn it was played. Also Arena Bar ("[Exhaust]: Buff an
 *    exhausted friendly unit") and Stand United (Calm, [Action]) mid-turn after a conquer.
 *  - It is a triggered ability (383): it goes on the chain above the buffing spell's resolution
 *    and the opponent gets priority before the ready happens.
 *  - Re-trigger: buff → spend the buff → buff again the same turn readies it again (no
 *    once-per-turn wording). Buffing a READY Simian is harmless (no error, stays ready).
 *  - Cost: 5 energy + 1 calm; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-047-221";
const STAND_UNITED = "ogn-053-298"; // Calm [Action] spell, 3: Buff a friendly unit (+ aura)
const PIT_ROOKIE = "ogn-136-298"; // Body unit, 2: When you play me, buff another friendly unit
const ARENA_BAR = "ogn-124-298"; // Body gear: [Exhaust]: Buff an exhausted friendly unit
// Exhausted through the flag store only, so an engine "ready" is observable via isReady.
const EXHAUSTED = { __flags: { exhausted: true } } as const;
/** Opponent's tool: a plain spell that buffs ANY unit. */
const ANY_BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Blessing",
  timing: "action",
} as const;

function withStandUnited() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "simian", EXHAUSTED)
    .hand(P1, STAND_UNITED, "su");
}

describe("Simian Ancestor (sfd-047-221)", () => {
  test("registry payload: one triggered ability — on buff of self, ready self — and a 5/[calm] 5-Might unit", async () => {
    const game = await withStandUnited().build();
    expect(game.state("simian")).toMatchObject({ baseMight: 5, cardType: "unit", energyCost: 5, might: 5, name: "Simian Ancestor" });
    expect(game.state("simian").powerCost).toEqual(["calm"]);
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      { effect: { target: "self", type: "ready" }, trigger: { event: "buff", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 5 energy + [calm]; enters the base exhausted; unaffordable without the calm or with 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "simian").build();
    await game.p1.play("simian");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("simian")).toBe("base");
    expect(game.state("simian").isExhausted).toBe(true);
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
  });

  test("buffing an exhausted Simian (Stand United) buffs it AND readies it; the ready is a chain trigger the opponent sees first", async () => {
    const game = await withStandUnited().build();
    expect(game.state("simian").isExhausted).toBe(true);
    await game.p1.cast("su", { targets: "simian" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Stand United resolves → buff → trigger pending
    expect(game.state("simian").isBuffed).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "simian", controller: P1, triggered: true })]);
    expect(game.state("simian").isExhausted).toBe(true); // not yet — still on the chain
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("simian").isReady).toBe(true);
    expect(game.state("simian").might).toBe(7); // 5 + buff + Stand United's +1 aura this turn
  });

  test("rule 426.1.c: an already-buffed Simian chosen for a buff is not buffed, so it is NOT readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "simian", { ...EXHAUSTED, buffed: true })
      .hand(P1, STAND_UNITED, "su")
      .build();
    expect(game.state("simian").isBuffed).toBe(true);
    await game.p1.cast("su", { targets: "simian" }); // still a legal choice (426.1.c)
    await game.settle();
    expect(game.zoneOf("su")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("simian").isExhausted).toBe(true);
  });

  test("'When YOU buff me' — an opponent buffing Simian must not ready it (cf. 'when you stun/deal' controller attribution)", async () => {
    // Expected: the buff lands but "you" (Simian's controller) did not perform it → no trigger,
    // Simian stays exhausted. Actual: the buff trigger matches on the buffed card only and ignores
    // who buffed, so P2's spell readies P1's Simian.
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", CARD, "simian", EXHAUSTED)
      .hand(P2, ANY_BUFF, "bless")
      .build();
    await game.p2.cast("bless", { targets: "simian" });
    await game.settle();
    expect(game.state("simian").isBuffed).toBe(true);
    expect(game.state("simian").isExhausted).toBe(true);
  });

  test("combo: played this turn (enters exhausted), then Pit Rookie's play-buff readies it and it attacks and conquers immediately", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Sentinel" }, "sentinel")
      .hand(P1, CARD, "simian")
      .hand(P1, PIT_ROOKIE, "rookie")
      .build();
    await game.p1.play("simian");
    await game.settle();
    expect(game.state("simian").isExhausted).toBe(true);
    expect(game.p1.can("move")).toBe(false); // nothing ready to move
    await game.p1.play("rookie");
    await game.settle(); // only "another friendly unit" is Simian → forced pick / auto
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("simian");
      await game.settle();
    }
    expect(game.state("simian").isBuffed).toBe(true);
    expect(game.state("simian").isReady).toBe(true);
    expect(game.state("rookie").isExhausted).toBe(true); // Rookie itself is not readied
    await game.p1.move("simian", "bf1");
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash"); // 6 ≥ 4
    expect(game.locationOf("simian")).toBe("bf1"); // 4 < 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("Arena Bar: '[Exhaust]: Buff an exhausted friendly unit' on Simian readies it (gear exhausts, Simian buffed + ready)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "simian", EXHAUSTED).gear(P1, ARENA_BAR, "bar").build();
    await game.p1.activate("bar");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("simian");
      await game.settle();
    }
    expect(game.state("bar").isExhausted).toBe(true);
    expect(game.state("simian").isBuffed).toBe(true);
    expect(game.state("simian").isReady).toBe(true);
  });

  test("multi-step turn: conquer (exhausts) → Stand United readies it → walk back to base (exhausts) → a 2nd Stand United finds it still buffed and does NOT ready it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "simian")
      .hand(P1, STAND_UNITED, "su1")
      .hand(P1, STAND_UNITED, "su2")
      .build();
    await game.p1.move("simian", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("simian").isExhausted).toBe(true);
    await game.p1.cast("su1", { targets: "simian" });
    await game.settle();
    expect(game.state("simian").isReady).toBe(true);
    await game.p1.move("simian", "base");
    await game.settle();
    expect(game.locationOf("simian")).toBe("base");
    expect(game.state("simian").isExhausted).toBe(true);
    await game.p1.cast("su2", { targets: "simian" }); // buff persists → 426.1.c → no trigger
    await game.settle();
    expect(game.state("simian").isBuffed).toBe(true);
    expect(game.state("simian").isExhausted).toBe(true);
  });

  test("no once-per-turn limit: buff → spend the buff → buff again readies it a second time", async () => {
    const spendForCard = {
      abilities: [{ effect: { then: { amount: 1, type: "draw" }, type: "spend-buff" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "body",
      energyCost: 0,
      name: "Test Cash In",
      timing: "action",
    };
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P1, "base", CARD, "simian", EXHAUSTED)
      .hand(P1, STAND_UNITED, "su1")
      .hand(P1, STAND_UNITED, "su2")
      .hand(P1, spendForCard, "cash")
      .build();
    await game.p1.cast("su1", { targets: "simian" });
    await game.settle();
    expect(game.state("simian").isReady).toBe(true);
    await game.p1.cast("cash");
    await game.settle();
    expect(game.state("simian").isBuffed).toBe(false);
    await game.p1.do("exhaustCard", { cardId: "simian" });
    expect(game.state("simian").isExhausted).toBe(true);
    await game.p1.cast("su2", { targets: "simian" });
    await game.settle();
    expect(game.state("simian").isBuffed).toBe(true);
    expect(game.state("simian").isReady).toBe(true);
  });

  test("negative space: buffing a different friendly unit does nothing to Simian; buffing a READY Simian keeps it ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P1, "base", CARD, "simian", EXHAUSTED)
      .unit(P1, "base", { might: 1, name: "Bystander" }, "other", EXHAUSTED)
      .hand(P1, STAND_UNITED, "su1")
      .hand(P1, STAND_UNITED, "su2")
      .build();
    await game.p1.cast("su1", { targets: "other" });
    await game.settle();
    expect(game.state("other").isBuffed).toBe(true);
    expect(game.state("other").isExhausted).toBe(true); // vanilla unit: no ready
    expect(game.state("simian").isExhausted).toBe(true);
    expect(game.state("simian").isBuffed).toBe(false);
    await game.p1.do("readyCard", { cardId: "simian" });
    await game.p1.cast("su2", { targets: "simian" });
    await game.settle();
    expect(game.state("simian").isBuffed).toBe(true);
    expect(game.state("simian").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
