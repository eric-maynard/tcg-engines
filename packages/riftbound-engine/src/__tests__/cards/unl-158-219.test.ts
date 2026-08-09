/**
 * Shepherd's Heirloom — unl-158-219 · Gear (Equipment) · Order · 2 energy (no power) · Might bonus +2
 *
 *   When you play this, gain 1 XP.
 *   [Equip] — Spend 1 XP (Pay the cost: Attach this to a unit you control.)
 *
 * Rules: 359.2.d (gear enters ready in base; the play uses no chain), 383.4.a (the "When you play this"
 * effect is a TRIGGERED ability on the chain — XP arrives on resolution, after the opponent's window),
 * 730.1 / 730.2 (Gain XP / Spend XP act on the CONTROLLER's XP total; XP persists across turns), 818.1 /
 * 818.1.c.3 ([Equip] is an activated ability whose cost may be a NON-resource cost — here "Spend 1
 * XP": paid in full on activation, unpayable with 0 XP; the attach happens when the chain item
 * resolves), 818.1.b.1 (the unit is a target: a unit YOU control), 151.2 (timing), 718.4 (+2 while
 * attached), 821 (Weaponmaster discounts [rainbow] — it cannot discount XP), 824 ([Level N] gates read
 * XP live).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Self-fuelling loop: play (2 energy) → trigger resolves → +1 XP → Equip spends exactly that XP →
 *     net 0 XP and a +2 unit, all in one Main Phase. Before the trigger resolves the XP is NOT there yet,
 *     so Equip cannot be activated "in response" at 0 XP.
 *  2. The Equip cost is XP, not energy/power: 5 energy + every power in the world with 0 XP → not
 *     offered; exactly 1 XP with an empty pool → offered, and exactly 1 XP leaves (from 4 → 3).
 *  3. It is still a chain item with a P2 response window; the +2 lands only on resolution.
 *  4. XP is per player: P2's XP never pays for P1's Heirloom; the gain goes to whoever PLAYED it.
 *  5. Partner (Order, Level): at 2 XP, playing the Heirloom reaches 3 XP → Bandle Soldier's "[Level 3]
 *     I enter ready" is live for the next play this turn.
 *  6. Engine status: the parser produced `{type:"spell", effect: spend-xp 1}` instead of an [Equip]
 *     keyword with `cost: { xp: 1 }`, so the engine sees an Equipment WITHOUT a printed Equip cost and
 *     lets it attach for free at any XP. Cost clauses are BUG tests.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-158-219";
const BANDLE_SOLDIER = "unl-151-219"; // Order · 4 + [order] · 5 Might · [Level 3] I enter ready.

const pairs = (game: Game, seat: "p1" | "p2" = "p1") =>
  game[seat]
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`))
    .sort();

function inBase(xp: number, pool: { energy?: number; power?: Record<string, number> } = {}) {
  return scenario()
    .xp(P1, xp)
    .resources(P1, { energy: pool.energy ?? 0, power: pool.power ?? {} })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Lamb" }, "lamb")
    .unit(P2, "bf1", { might: 3, name: "Wolf" }, "wolf")
    .gear(P1, CARD, "heir");
}

async function equip(game: Game, unit = "lamb"): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "heir", unitId: unit } });
  await game.settle();
}

describe("Shepherd's Heirloom (unl-158-219)", () => {
  test("registry payload (part 1): Order Equipment, 2 energy, no power, +2; first ability = play-self trigger gaining exactly 1 XP", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "order", energyCost: 2, mightBonus: 2, name: "Shepherd's Heirloom" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities?.[0]).toEqual({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "play-self" }, type: "triggered" });
    expect(def?.abilities).toHaveLength(2);
  });

  test("registry payload (part 2) — the second ability must be the [Equip] KEYWORD with a Spend-1-XP cost, not a free-floating 'spend-xp' spell effect", async () => {
    // Expected: { type: "keyword", keyword: "Equip", cost: { xp: 1 } } (818.1.c — "[Equip] — Spend 1 XP").
    // Actual: { type: "spell", effect: { type: "spend-xp", amount: 1 } } — no Equip keyword, no cost.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities?.[1]).toMatchObject({ cost: { xp: 1 }, keyword: "Equip", type: "keyword" });
    const game = await scenario().gear(P1, CARD, "heir").build();
    expect(game.state("heir").keywords).toContain("Equip");
  });

  test("play: exactly 2 energy, gear READY and unattached in base at once, a TRIGGERED item on the chain and XP still 0; P2 may respond; on resolution P1 (only) has 1 XP", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).xp(P1, 0).unit(P1, "base", { might: 2, name: "Lamb" }, "lamb").hand(P1, CARD, "heir").build();
    await game.p1.play("heir");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.state("heir")).toMatchObject({ attachedTo: undefined, isReady: true, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heir", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.state("lamb").might).toBe(2); // playing it attaches nothing
    expect((await scenario().resources(P1, { energy: 1, power: { order: 3 } }).xp(P1, 9).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
  });

  test("XP goes to whoever PLAYED it and stacks with existing XP (P2 plays it on their turn: P2 4 → 5, P1 untouched)", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 2 }).xp(P1, 2).xp(P2, 4).hand(P2, CARD, "theirs").build();
    await game.p2.play("theirs");
    await game.settle();
    expect(game.p2.xp()).toBe(5);
    expect(game.p1.xp()).toBe(2);
  });

  test("[Equip] targets a unit YOU control and attaches for +2 via a P1 chain item (2 → 4 only after it resolves); the enemy Wolf is never a holder", async () => {
    const game = await inBase(3).build();
    expect(pairs(game)).toEqual(["heir->lamb"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "heir", unitId: "wolf" } }))).ok).toBe(false);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "heir", unitId: "lamb" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heir", controller: P1, triggered: false })]);
    expect(game.state("lamb").might).toBe(2);
    await game.settle();
    expect(game.state("heir").attachedTo).toBe("lamb");
    expect(game.state("lamb")).toMatchObject({ attachments: ["heir"], baseMight: 2, might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("the Equip cost is 'Spend 1 XP' (818.1.c.3 / 730.2) — activating at 4 XP leaves exactly 3, and the XP is gone already while the item waits on the chain", async () => {
    // Expected: 4 → 3 on activation (cost), attach on resolution. Actual: no cost is charged (XP stays 4).
    const game = await inBase(4).build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "heir", unitId: "lamb" } });
    expect(game.p1.xp()).toBe(3);
    await game.settle();
    expect(game.state("heir").attachedTo).toBe("lamb");
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // nothing else was charged
  });

  test("with 0 XP the cost is unpayable — [Equip] is not offered even with 5 energy and order/rainbow power, and a forced attempt is rejected", async () => {
    // Expected: no equipCard option at 0 XP (a mandatory non-resource cost that cannot be paid).
    // Actual: offered and resolves for free.
    const game = await inBase(0, { energy: 5, power: { order: 2, rainbow: 2 } }).build();
    expect(pairs(game)).toEqual([]);
    const r = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "heir", unitId: "lamb" } }));
    expect(r.ok).toBe(false);
    expect(game.state("heir").attachedTo).toBeUndefined();
  });

  test("the self-fuelling line nets to ZERO XP — play (0 → 1 XP) then Equip spends that 1 (→ 0): Lamb is 4 Might, P1 has 0 XP and cannot Equip a second Heirloom", async () => {
    // Expected: xp 0 at the end and the second copy not offered. Actual: xp stays 1 and the second copy
    // is offered (free Equip).
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .xp(P1, 0)
      .unit(P1, "base", { might: 2, name: "Lamb" }, "lamb")
      .gear(P1, CARD, "spare")
      .hand(P1, CARD, "heir")
      .build();
    await game.p1.play("heir");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    await equip(game, "lamb");
    expect(game.state("lamb")).toMatchObject({ attachments: ["heir"], might: 4 });
    expect(game.p1.xp()).toBe(0);
    expect(pairs(game)).toEqual([]);
  });

  test("ordering inside the loop: while the gain-XP trigger is still on the chain (Closed State) [Equip] is not activatable at all (151.2) — only after it resolves", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).xp(P1, 0).unit(P1, "base", { might: 2, name: "Lamb" }, "lamb").hand(P1, CARD, "heir").build();
    await game.p1.play("heir");
    expect(game.chain()).toHaveLength(1);
    expect(pairs(game)).toEqual([]);
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(pairs(game)).toEqual(["heir->lamb"]);
  });

  test("timing (151.2): with XP to spare, nothing is offered on the opponent's turn, during a showdown, or once it is already attached (718.2)", async () => {
    expect(pairs(await inBase(5).active(P2).build())).toEqual([]);
    const sd = await inBase(5).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(pairs(sd)).toEqual([]);
    const worn = await inBase(5).unit(P1, "base", { might: 1, name: "Kid" }, "kid").build();
    await equip(worn, "lamb");
    expect(pairs(worn)).toEqual([]);
  });

  test("the +2 fights: Lamb (2) wearing the Heirloom attacks the 3-Might Wolf at 4 — Wolf dies, Lamb lives, conquers bf1, Heirloom rides along; bare Lamb would just die", async () => {
    const game = await inBase(3).build();
    await equip(game);
    await game.p1.move("lamb", "bf1");
    expect(game.state("lamb")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("wolf")).toBe("trash");
    expect(game.locationOf("lamb")).toBe("bf1");
    expect(game.locationOf("heir")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);

    const bare = await inBase(3).build();
    await bare.p1.move("lamb", "bf1");
    await bare.settle();
    expect(bare.zoneOf("lamb")).toBe("trash");
    expect(bare.zoneOf("heir")).toBe("base");
  });

  test("partner — Bandle Soldier [Level 3]: at 2 XP it would enter exhausted; play the Heirloom first (2 → 3 XP) and the Soldier played next enters READY", async () => {
    const low = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).xp(P1, 2).hand(P1, BANDLE_SOLDIER, "bs").build();
    await low.p1.play("bs");
    await low.settle();
    expect(low.state("bs").isExhausted).toBe(true);

    const game = await scenario().resources(P1, { energy: 6, power: { order: 1 } }).xp(P1, 2).hand(P1, CARD, "heir").hand(P1, BANDLE_SOLDIER, "bs").build();
    await game.p1.play("heir");
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    await game.p1.play("bs");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("bs")).toMatchObject({ isReady: true, might: 5, zone: "base" });
  });
});
