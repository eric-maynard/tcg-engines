/**
 * Lucian, Merciless — sfd-113-221 · Champion Unit (Lucian) · Body · 3 energy · 3 Might
 *
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for
 *   [rainbow] less, even if it's already attached.)
 *   The first time I conquer each turn, ready me.
 *
 * Head-judge checklist for this card:
 *  - "The first time … each turn" (383.1): conquer #1 readies him; a SECOND conquer the same
 *    turn (he needs Ganking — Vault Breaker) must not; the count resets on a later turn.
 *  - Conquer = gaining control of a battlefield not yet scored this turn (469.1): both walking
 *    onto an empty enemy battlefield and winning a combat qualify; moving to a battlefield you
 *    already control is not a conquer (stays exhausted).
 *  - The ready is a triggered chain item (383.4.c.2.a): the opponent gets priority first and can
 *    kill Lucian in response — the trigger then does nothing, the conquer point stays.
 *  - Weaponmaster (821): optional; Doran's Blade (Equip [body]) becomes free and gives +2; an
 *    Equipment already worn by another unit may be pulled over; no Equipment → no prompt.
 *  - Weaponmaster + conquer line: 3+2 = 5 Might Lucian kills a 4-Might defender, survives, conquers,
 *    readies — and keeps the Blade.
 *  - Cost: 3 energy, no power; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-113-221";
const DORANS_BLADE = "sfd-095-221"; // Equipment · Body · Equip [body] · +2 Might
const VAULT_BREAKER = "unl-010-219"; // [Action] spell, 1+[fury]: Assault 2 + Ganking this turn
/** Opponent's [Reaction]: deal 4 to a unit. */
const SNIPE = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  timing: "reaction",
} as const;

function twoFields() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "lucian");
}

describe("Lucian, Merciless (sfd-113-221)", () => {
  test("registry payload: Weaponmaster keyword + 'first time I conquer each turn → ready me' trigger; 3-cost 3-Might Lucian champion", async () => {
    const game = await twoFields().build();
    expect(game.state("lucian")).toMatchObject({ baseMight: 3, cardType: "unit", energyCost: 3, might: 3, name: "Lucian, Merciless" });
    expect(game.state("lucian").powerCost).toEqual([]);
    expect(game.state("lucian").keywords).toContain("Weaponmaster");
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ isChampion: true, tags: ["Lucian"] });
    expect(def?.abilities).toEqual([
      { keyword: "Weaponmaster", type: "keyword" },
      {
        effect: { target: "self", type: "ready" },
        trigger: { event: "conquer", on: "self", restrictions: [{ type: "first-time-each-turn" }] },
        type: "triggered",
      },
    ]);
  });

  test("cost: 3 energy, no power; enters the base exhausted; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "lucian").build();
    await game.p1.play("lucian");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("base");
    expect(game.state("lucian").isExhausted).toBe(true);
    expect((await scenario().resources(P1, { energy: 2, power: { body: 3 } }).hand(P1, CARD, "l").build()).p1.can("play", "l")).toBe(false);
  });

  test("conquering an empty enemy battlefield scores 1 and the trigger (a chain item P2 sees first) readies him there", async () => {
    const game = await twoFields().build();
    await game.p1.move("lucian", "bf1");
    // Walk to the point where the conquer has happened and the ready trigger is pending.
    for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "lucian" && c.triggered); i++) {
      await game.acting().pass();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("lucian").isExhausted).toBe(true); // the move exhausted him; ready not resolved yet
    await game.settle();
    expect(game.locationOf("lucian")).toBe("bf1");
    expect(game.state("lucian").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("'first time each turn': with Ganking (Vault Breaker) a second conquer the same turn scores but does NOT ready him again", async () => {
    const game = await twoFields().resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, VAULT_BREAKER, "vb").build();
    await game.p1.cast("vb", { targets: "lucian" });
    await game.settle();
    expect(game.state("lucian").keywords).toContain("Ganking");
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.state("lucian").isReady).toBe(true);
    await game.p1.gank("lucian", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.locationOf("lucian")).toBe("bf2");
    expect(game.state("lucian").isExhausted).toBe(true);
  });

  test("'each turn' resets: conquer (readied) → walk home → on his NEXT turn a fresh conquer readies him again", async () => {
    const game = await twoFields().build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.state("lucian").isReady).toBe(true);
    await game.p1.move("lucian", "base");
    await game.settle();
    expect(game.state("lucian").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // 190.4.c: left it empty
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("lucian").isReady).toBe(true); // awaken
    const before = game.p1.points();
    await game.p1.move("lucian", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(before + 1);
    expect(game.state("lucian").isReady).toBe(true);
  });

  test("conquer through combat: kills a 2-Might defender, survives (2 < 3), takes the field and is readied", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "lucian")
      .unit(P2, "bf1", { might: 2, name: "Picket" }, "picket")
      .build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.locationOf("lucian")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("lucian").isReady).toBe(true);
  });

  test("negative space: moving to a battlefield you already control is no conquer — no point, stays exhausted", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1 }, "holder").unit(P1, "base", CARD, "lucian").build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.locationOf("lucian")).toBe("bf1");
    expect(game.p1.points()).toBe(0);
    expect(game.state("lucian").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("negative space: losing the combat (3 into a 5-Might defender) kills Lucian — no conquer, no ready, no point", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "lucian").unit(P2, "bf1", { might: 5 }, "wall").build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("the ready trigger can be answered: P2 snipes Lucian in response → he dies, the trigger does nothing, the conquer point stays", async () => {
    const game = await twoFields().hand(P2, SNIPE, "snipe").build();
    await game.p1.move("lucian", "bf1");
    for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "lucian" && c.triggered); i++) {
      await game.acting().pass();
    }
    expect(game.chain().some((c) => c.cardId === "lucian" && c.triggered)).toBe(true);
    // Hand priority to P2 if P1 holds it, then react.
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("snipe", { targets: "lucian" });
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: while P1 holds priority over Lucian's pending conquer trigger, P2 is also offered its [Reaction] (312.2 — only the priority holder may play)", async () => {
    // Expected: right after the conquer, the trigger is on the chain and P1 (its controller) alone
    // has priority; P2 may react only once P1 passes. Actual: P2's reaction is legal at the same
    // time (the harness' singleDecisionCursor invariant fires).
    const game = await twoFields().hand(P2, SNIPE, "snipe").build();
    await game.p1.move("lucian", "bf1");
    for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "lucian" && c.triggered); i++) {
      await game.acting().pass();
    }
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "snipe")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Weaponmaster: on play, Doran's Blade (Equip [body]) is offered, attaches for [rainbow] less = free, Lucian becomes 5 Might", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, DORANS_BLADE, "blade").hand(P1, CARD, "lucian").build();
    await game.p1.play("lucian");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("blade");
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("lucian");
    expect(game.state("lucian").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Weaponmaster is optional and needs an Equipment: declining keeps 3 Might; with no Equipment there is no prompt at all", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, DORANS_BLADE, "blade").hand(P1, CARD, "lucian").build();
    await game.p1.play("lucian");
    await game.p1.decline();
    await game.settle();
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("lucian").might).toBe(3);
    const bare = await scenario().resources(P1, { energy: 3 }).gear(P1, { cardType: "gear", name: "Trinket" }, "trinket").hand(P1, CARD, "lucian").build();
    await bare.p1.play("lucian");
    expect(bare.decision()?.kind).toBe("action");
    await bare.settle();
    expect(bare.state("lucian").attachments).toEqual([]);
  });

  test("'even if it's already attached': a Blade worn by a squire moves onto Lucian (squire drops to base Might)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .gear(P1, DORANS_BLADE, "blade")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .hand(P1, CARD, "lucian")
      .build();
    await game.p1.do("equipCard", { equipmentId: "blade", unitId: "squire" });
    await game.settle();
    expect(game.state("squire").might).toBe(4);
    await game.p1.play("lucian");
    await game.p1.pick("blade");
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("lucian");
    expect(game.state("squire").might).toBe(2);
    expect(game.state("lucian").might).toBe(5);
  });

  test("full line: play with Weaponmaster (5 Might, exhausted) → next turn attack a 4-Might defender → survive, conquer, readied, Blade still on", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Bruiser" }, "bruiser")
      .gear(P1, DORANS_BLADE, "blade")
      .hand(P1, CARD, "lucian")
      .build();
    await game.p1.play("lucian", { answers: ["blade"] });
    await game.settle();
    expect(game.state("lucian").isExhausted).toBe(true);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash"); // 5 ≥ 4
    expect(game.locationOf("lucian")).toBe("bf1"); // 4 < 5
    expect(game.state("blade").attachedTo).toBe("lucian");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("lucian").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
