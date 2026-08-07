/**
 * Renekton, Rage Fueled — ven-019-166 · Champion Unit · Fury · 6 energy · 6 Might · Renekton
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   When I attack, if you control 4 or fewer runes, deal 2 to all enemy units here.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "if you control 4 or fewer runes" sits immediately after the condition → it is part of the
 *     TRIGGER CONDITION (383.2.a.1 / 383.4.e.2.b): with 5+ runes when he gains Attacker the ability
 *     never goes on the chain; with ≤4 it does, and channeling more in response does not stop it.
 *  2. "Runes you control" are rune CARDS on your board (154), ready or exhausted alike — not the
 *     Energy in the pool; the opponent's runes are irrelevant; recycling one first (5 → 4) turns it on.
 *  3. Attack trigger (383.4.e) resolves inside the showdown BEFORE combat damage: 2-Might defenders die
 *     first, so a lone 2-Might blocker never deals its damage and Renekton conquers unhurt.
 *  4. "all enemy units HERE" — every enemy unit at his battlefield, none in bases / other battlefields,
 *     never friendly units; not a target choice (no prompt).
 *  5. Only when HE attacks: defending, or walking onto an empty battlefield, triggers nothing.
 *  6. Accelerate: [1][fury] extra → enters ready and can swing the same turn; a non-fury pip can't pay it.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-019-166";

function attackBoard(runes: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .runes(P1, "fury", runes)
    .runes(P2, "calm", 6) // opponent's runes never count
    .unit(P1, "base", CARD, "renek")
    .unit(P1, "base", { might: 1, name: "Buddy" }, "buddy")
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P2, "base", { might: 2, name: "Home" }, "home");
}

describe("Renekton, Rage Fueled (ven-019-166)", () => {
  test("parsed abilities should be Accelerate [1][fury] + an attack trigger conditioned on ≤4 runes that deals 2 to all enemy units here; the effect is left raw", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 6, isChampion: true, might: 6, tags: ["Renekton"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" });
    expect(abilities[1]).toMatchObject({ trigger: { event: "attack", on: "self" }, type: "triggered" });
    const effect = abilities[1]?.effect as { type?: string; amount?: number };
    expect(effect.type).not.toBe("raw");
    expect(JSON.stringify(abilities[1])).toContain('"amount":2');
    expect(JSON.stringify(abilities[1])).toMatch(/rune/i); // the ≤4-runes condition is encoded somewhere
  });

  test("cost: 6 energy, enters the base exhausted at 6 Might; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "renek").build();
    await game.p1.play("renek");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("renek")).toBe("base");
    expect(game.state("renek")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6 });
    expect((await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "renek").build()).p1.can("play", "renek")).toBe(false);
  });

  test("Accelerate: 7 energy + 1 fury → enters READY with an empty pool; a calm pip cannot pay the fury half", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, CARD, "renek").build();
    await game.p1.play("renek", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("renek").isReady).toBe(true);
    const calm = await scenario().resources(P1, { energy: 7, power: { calm: 1 } }).hand(P1, CARD, "renek").build();
    expect((await calm.p1.try((p) => p.play("renek", { accelerate: true }))).ok).toBe(false);
    expect(calm.zoneOf("renek")).toBe("hand");
  });

  test("attacking with 4 runes puts his triggered ability on the chain inside the showdown, P1 holding priority", async () => {
    const game = await attackBoard(4).build();
    await game.p1.move("renek", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renek", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("renek").combatRole).toBe("attacker");
  });

  test("on resolution it deals 2 to EVERY enemy unit here and nothing else — Small dies, Big takes 2; base / other battlefield / friendly units untouched", async () => {
    // Expected per card text; actual: the raw effect resolves as a no-op.
    const game = await attackBoard(4).build();
    await game.p1.move(["renek", "buddy"], "bf1"); // Buddy attacks alongside: friendly unit "here"
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).toBe("action"); // no target prompt: "all enemy units here"
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("big").damage).toBe(2);
    expect(game.state("elsewhere").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("buddy").damage).toBe(0);
    expect(game.state("renek").damage).toBe(0);
  });

  test("full combat — the pre-softened Big (5 Might, 2 damage) dies to his 6, Renekton survives Big's 5, conquers bf1 and scores 1", async () => {
    const game = await attackBoard(0).build();
    await game.p1.move("renek", "bf1");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("renek")).toBe("battlefield-bf1");
    expect(game.state("renek").damage).toBe(0); // 466.1.a.1 heal after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("a lone 2-Might defender is killed by the trigger before combat damage — Renekton takes 0 and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .runes(P1, "fury", 3)
      .unit(P1, "base", CARD, "renek")
      .unit(P2, "bf1", { might: 2 }, "blocker")
      .build();
    await game.p1.move("renek", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("blocker")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("renek")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("with 5 runes the condition fails when he gains Attacker — NO ability is put on the chain at all (383.2.a.1 / 383.4.e.2.b)", async () => {
    // Actual: the trigger is queued unconditionally.
    const game = await attackBoard(5).build();
    await game.p1.move("renek", "bf1");
    expect(game.chain().filter((i) => i.cardId === "renek")).toEqual([]);
    await game.settle();
    expect(game.state("home").damage).toBe(0);
  });

  test("with 5+ runes nothing is dealt: Small survives to combat and both defenders deal their full 7 — Renekton dies, bf1 stays P2's", async () => {
    const game = await attackBoard(6).build();
    await game.p1.move("renek", "bf1");
    await game.settle();
    expect(game.zoneOf("renek")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("exhausted runes still count as controlled, and recycling one first (5 → 4) satisfies the condition — Small dies to the trigger", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .runes(P1, "fury", 3, { exhausted: true })
      .runes(P1, "fury", 2)
      .unit(P1, "base", CARD, "renek")
      .unit(P2, "bf1", { might: 2 }, "small")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .build();
    expect(game.p1.runes()).toHaveLength(5);
    await game.p1.recycleRune();
    expect(game.p1.runes()).toHaveLength(4);
    await game.p1.move("renek", "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("wall").damage).toBe(2);
  });

  test("negative space — defending never triggers it, and moving onto an EMPTY battlefield is not an attack (no chain, just a conquer)", async () => {
    const defend = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "renek")
      .unit(P2, "base", { might: 2 }, "raider")
      .build();
    await defend.p2.move("raider", "bf1");
    expect(defend.chain()).toEqual([]);
    await defend.settle();
    expect(defend.zoneOf("raider")).toBe("trash");
    const empty = await scenario().battlefield("bf1").unit(P1, "base", CARD, "renek").unit(P2, "base", { might: 2 }, "home").build();
    await empty.p1.move("renek", "bf1");
    expect(empty.chain()).toEqual([]);
    await empty.settle();
    expect(empty.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(empty.state("home").damage).toBe(0);
  });

  test("multi-step — Accelerate in, swing the same turn with 2 runes left: trigger clears three 2-Might defenders (exactly lethal 6 otherwise) and he conquers without a fight", async () => {
    // Without the trigger the three defenders deal 6 = exactly lethal and both sides are wiped.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .runes(P1, "fury", 2)
      .resources(P1, { energy: 7, power: { fury: 1 } })
      .hand(P1, CARD, "renek")
      .unit(P2, "bf1", { might: 2 }, "d1")
      .unit(P2, "bf1", { might: 2 }, "d2")
      .unit(P2, "bf1", { might: 2 }, "d3")
      .build();
    await game.p1.play("renek", { accelerate: true });
    await game.settle();
    expect(game.state("renek").isReady).toBe(true);
    await game.p1.move("renek", "bf1");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.zoneOf("d3")).toBe("trash");
    expect(game.zoneOf("renek")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
