/**
 * Shurelya's Requiem — sfd-192-221 · Gear (Equipment) · Calm/Mind · 4 energy + [C][C] (two hybrid
 * calm|mind pips) · Might bonus +2
 *
 *   [Unique] (Your deck can have only 1 card with this name.)
 *   [Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)
 *   When you play this, ready your units.
 *
 * Rules: 135.2.e.6.c (a [C] pip on a two-domain card is one power of EITHER of its domains — calm or
 * mind — never a third domain; [A] added "any" power also pays), 359.2.d (gear enters ready in base;
 * the PLAY itself uses no chain), 383.4.a (a "When you play this" play effect is a TRIGGERED ability
 * put on the chain after the permanent has entered — opponents get priority before it resolves),
 * 438 (Ready: remove Exhausted; readying a ready permanent does nothing), "your units" = every unit you
 * control on the board (base and battlefields) and nothing else (not gear, legend, runes, not enemy
 * units), 818.1 ([Equip] is a separate activated ability with its own [C] cost; activating it is not
 * "playing this"), 718.2 (attached → own text inactive), 803 (Unique is deck construction only),
 * 144.4 (a readied unit may Standard Move again — that is the payoff).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Cost currencies: 4 energy AND two pips, each calm-or-mind (calm+mind mixed is fine, calm alone ×2
 *     fine, fury ×2 never, one pip short never, 3 energy never). Equip is a THIRD payment: one more
 *     calm|mind pip.
 *  2. The ready is a chain trigger: right after the play the units are STILL exhausted and P2 holds a
 *     response window; only resolution readies them.
 *  3. Scope: readies exhausted units in base AND at battlefields; leaves enemy units, your exhausted
 *     legend and your tapped runes alone; already-ready units are untouched (no error, no toggle).
 *  4. Only "when you PLAY this": activating [Equip] later (or wearing it) never readies anyone again.
 *  5. Payoff line: a unit that already attacked/moved this turn (exhausted at a battlefield) is readied
 *     and can Standard Move a second time the same turn.
 *  6. Partner (Calm/Mind): Fire Below the Mountain's gear-only [Add][rainbow] pays the Equip pip.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-192-221";
const FIRE_BELOW = "sfd-189-221"; // Legend · Calm/Mind · [Exhaust]: [Reaction] — [Add][rainbow]. Use only to play gear or use gear abilities.

/** P1 with 4 energy + `power`, Requiem in hand, two exhausted units (base + bf1), a ready one, enemy exhausted unit, exhausted legend. */
function board(power: Record<string, number> = { calm: 1, mind: 1 }) {
  return scenario()
    .resources(P1, { energy: 4, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Tired Home" }, "home", { exhausted: true })
    .unit(P1, "bf1", { might: 3, name: "Tired Field" }, "field", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "Fresh" }, "fresh")
    .unit(P2, "bf2", { might: 3, name: "Enemy" }, "enemy", { exhausted: true })
    .card("leg", { def: FIRE_BELOW, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    .rune(P1, "calm", { alias: "rune", exhausted: true })
    .hand(P1, CARD, "sr");
}

const pairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`))
    .sort();

describe("Shurelya's Requiem (sfd-192-221)", () => {
  test("registry payload: Calm/Mind Equipment, 4 energy + two hybrid pips, +2; abilities = [Unique] · [Equip] costing one [rainbow] · play-self trigger 'ready all friendly units'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: ["calm", "mind"], energyCost: 4, mightBonus: 2, name: "Shurelya's Requiem" });
    expect(def?.powerCost).toEqual(["rainbow", "rainbow"]);
    expect(def?.abilities).toEqual([
      { keyword: "Unique", type: "keyword" },
      { cost: { power: ["rainbow"] }, keyword: "Equip", type: "keyword" },
      { effect: { target: { controller: "friendly", quantity: "all", type: "unit" }, type: "ready" }, trigger: { event: "play-self" }, type: "triggered" },
      // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "Your units here have [Ganking]." — an
      // aura conferred through the equipped unit while attached (`effectText: true`).
      {
        effect: { keyword: "Ganking", target: { controller: "friendly", location: "here", type: "unit" }, type: "grant-keyword" },
        effectText: true,
        type: "static",
      },
    ] as never);
    const game = await scenario().gear(P1, CARD, "sr").build();
    expect(game.state("sr").keywords).toEqual(expect.arrayContaining(["Unique", "Equip"]));
  });

  test("play cost: 4 energy + one calm + one mind are all consumed; the gear is in base READY at once and a TRIGGERED item (not the gear) sits on the chain while every unit is still exhausted", async () => {
    const game = await board().build();
    await game.p1.play("sr");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.zoneOf("sr")).toBe("base");
    expect(game.state("sr")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sr", controller: P1, triggered: true })]);
    expect(game.state("home").isExhausted).toBe(true);
    expect(game.state("field").isExhausted).toBe(true);
  });

  test("hybrid pips (135.2.e.6.c): calm×2, mind×2 or added 'any' power ×2 all pay; fury×2, a single pip, or 3 energy do not", async () => {
    for (const ok of [{ calm: 2 }, { mind: 2 }, { rainbow: 2 }, { calm: 1, mind: 1 }]) {
      expect((await board(ok).build()).p1.can("play", "sr")).toBe(true);
    }
    for (const bad of [{ fury: 2 }, { calm: 1 }, { body: 1, order: 1 }]) {
      const g = await board(bad).build();
      expect(g.p1.can("play", "sr")).toBe(false);
      expect((await g.p1.try((p) => p.play("sr"))).ok).toBe(false);
      expect(g.zoneOf("sr")).toBe("hand");
    }
    expect((await board({ calm: 3, mind: 3 }).resources(P1, { energy: 3 }).build()).p1.can("play", "sr")).toBe(false);
  });

  test("383.4.a — P2 gets a response window on the trigger; on resolution EVERY friendly unit (base + bf1) is ready, the ready one untouched; enemy unit, my legend and my rune stay exhausted", async () => {
    const game = await board().build();
    await game.p1.play("sr");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("home").isExhausted).toBe(true); // not yet
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("home").isReady).toBe(true);
    expect(game.state("field").isReady).toBe(true);
    expect(game.state("fresh").isReady).toBe(true);
    expect(game.state("enemy").isExhausted).toBe(true);
    expect(game.state("leg").isExhausted).toBe(true);
    expect(game.state("rune").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("payoff (144.4): a Ganking unit that already moved this turn (conquered empty bf1, now exhausted) is readied by the trigger and moves AGAIN to take bf2 — 2 points in one turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { keywords: ["Ganking"], might: 2, name: "Runner" }, "runner")
      .hand(P1, CARD, "sr")
      .build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("runner").isExhausted).toBe(true);
    expect(game.p1.can("gank", "runner")).toBe(false);
    await game.p1.play("sr");
    await game.settle();
    expect(game.state("runner").isReady).toBe(true);
    await game.p1.gank("runner", "bf2");
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("[Equip] [rainbow]: from base it costs exactly one calm|mind pip (fury can't), is an UN-triggered chain item, attaches for +2 — and readies NOBODY (only 'when you play this' does)", async () => {
    const worn = (power: Record<string, number>) =>
      scenario().resources(P1, { energy: 0, power }).unit(P1, "base", { might: 2, name: "Tired" }, "tired", { exhausted: true }).gear(P1, CARD, "sr");
    expect(pairs(await worn({ fury: 1 }).build())).toEqual([]);
    expect(pairs(await worn({}).resources(P1, { energy: 5 }).build())).toEqual([]);
    expect(pairs(await worn({ mind: 1 }).build())).toEqual(["sr->tired"]);
    const game = await worn({ calm: 1 }).build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "sr", unitId: "tired" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sr", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("sr").attachedTo).toBe("tired");
    expect(game.state("tired")).toMatchObject({ attachments: ["sr"], isExhausted: true, might: 4 });
  });

  test("full sequence in one turn: play (4 + calm + mind → units ready) then Equip (third pip) onto the freshly readied unit → 2 + 2 = 4, still ready, 0 power left", async () => {
    const game = await board({ calm: 2, mind: 1 }).build();
    await game.p1.play("sr");
    await game.settle();
    expect(game.state("home").isReady).toBe(true);
    expect(pairs(game)).toEqual(["sr->field", "sr->fresh", "sr->home"]);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "sr", unitId: "home" } });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.state("home")).toMatchObject({ attachments: ["sr"], isReady: true, might: 4 });
    // Worn: its own [Equip] is inactive and nothing else is offered.
    expect(pairs(game)).toEqual([]);
  });

  test("negative space — timing: not playable on the opponent's turn or while a chain is pending; the trigger with ZERO friendly units resolves harmlessly", async () => {
    expect((await board().active(P2).build()).p1.can("play", "sr")).toBe(false);
    const busy = await board().hand(P1, { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", domain: "mind", energyCost: 0, name: "Cantrip" }, "cantrip").build();
    await busy.p1.cast("cantrip");
    expect(busy.chain()).toHaveLength(1);
    expect(busy.p1.can("play", "sr")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 4, power: { mind: 2 } }).unit(P2, "base", { might: 1, name: "Theirs" }, "theirs", { exhausted: true }).hand(P1, CARD, "sr").build();
    await empty.p1.play("sr");
    await empty.settle();
    expect(empty.zoneOf("sr")).toBe("base");
    expect(empty.state("theirs").isExhausted).toBe(true);
    expect(empty.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(empty.violations()).toEqual([]);
  });

  test("partner — Fire Below the Mountain: [Exhaust] adds one gear-only [rainbow], which pays the Equip pip with an otherwise empty pool", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .legend(P1, FIRE_BELOW, "fbm")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, CARD, "sr")
      .build();
    expect(pairs(game)).toEqual([]);
    await game.p1.activate("fbm");
    await game.settle();
    expect(game.state("fbm").isExhausted).toBe(true);
    expect(game.p1.power()).toBe(1);
    expect(pairs(game)).toEqual(["sr->squire"]);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "sr", unitId: "squire" } });
    await game.settle();
    expect(game.p1.power()).toBe(0);
    expect(game.state("squire")).toMatchObject({ attachments: ["sr"], might: 4 });
  });

  test("combat check of the +2: Squire (2) wearing the Requiem attacks a 3-Might defender at 4 — defender dies, Squire lives and conquers, Requiem rides to bf2", async () => {
    const game = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
      .gear(P1, CARD, "sr")
      .build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "sr", unitId: "squire" } });
    await game.settle();
    await game.p1.move("squire", "bf2");
    expect(game.state("squire")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("squire")).toBe("bf2");
    expect(game.locationOf("sr")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
