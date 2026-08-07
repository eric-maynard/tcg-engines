/**
 * Frostcoat Cub — sfd-067-221 · Unit · Mind · 3 energy (no power) · 3 might
 *
 *   You may pay [mind] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, give a unit -2 [Might] this turn.
 *
 * Rules: 356.2.b (optional additional cost chosen and paid while playing), 383.2.a.1 (an "if"
 * right after the trigger condition is PART of the condition → unpaid means the trigger never goes
 * on the chain), 355.5.b (the -2 target is chosen when the trigger is finalized, after the Cub is
 * on the board → the Cub itself is a legal "unit"), lethal damage = NON-ZERO damage ≥ Might (a
 * 2-Might unit dropped to 0 with no damage lives; a damaged unit dropped to its damage dies in the
 * next cleanup), Might below 0 reads as 0, 317.2.c ("this turn" expiry), 143.4/359.2.c (units enter
 * exhausted), 206 (paying [mind] extra does not change the printed cost).
 *
 * Head-judge corner cases considered:
 *   - unpaid play: 3 energy only, chain stays EMPTY (condition unmet — not a do-nothing trigger);
 *   - paid play: 3 energy + 1 mind exactly; a triggered item controlled by P1 sits on the chain
 *     while the Cub is already in base; several units → a real pick including enemy units AND the
 *     Cub itself; single other unit vs. Cub → still a choice (two units on board);
 *   - the extra cost is [mind] specifically: fury power cannot pay it → option not offered;
 *   - -2 on an undamaged 2-Might unit → 0 Might, still on the board (no non-zero damage);
 *   - -2 on a 4-Might unit carrying 2 damage → 2 Might with 2 damage → killed;
 *   - expiry: the shrunken unit is back to full Might after the turn passes.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-067-221";

function board(res: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 5, name: "Big" }, "big")
    .hand(P1, CARD, "cub");
}

/** Settle; if the trigger asks for its target, pick `target` and settle again. */
async function resolvePick(game: Game, target: string): Promise<Decision | null> {
  const r = await game.settle();
  const d = game.decision();
  if (r.reason === "unanswered" && d?.kind === "pick") {
    await game.p1.pick(target);
    await game.settle();
    return d;
  }
  return null;
}

describe("Frostcoat Cub (sfd-067-221)", () => {
  test("base cost: 3 energy for a 3-Might unit that enters the base exhausted; 2 energy is not enough", async () => {
    const game = await board({ energy: 3 }).build();
    expect(game.p1.can("play", "cub")).toBe(true);
    await game.p1.play("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("base");
    expect(game.state("cub")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const poor = await board({ energy: 2, power: { mind: 1 } }).build();
    expect(poor.p1.can("play", "cub")).toBe(false);
  });

  test("declining the additional cost: only 3 energy is spent and NO trigger is put on the chain (383.2.a.1); nobody shrinks", async () => {
    const game = await board({ energy: 3, power: { mind: 1 } }).build();
    await game.p1.play("cub", { payOptional: false });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.zoneOf("cub")).toBe("base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // no target prompt either
    expect(game.state("small").might).toBe(2);
    expect(game.state("big").might).toBe(5);
    expect(game.state("cub").might).toBe(3);
  });

  test("paying [mind]: 3 energy + 1 mind are deducted, the Cub is in base and its play trigger waits on the chain under P1's control", async () => {
    const game = await board({ energy: 3, power: { mind: 1 } }).build();
    expect(game.p1.option("play", "cub")?.fields.some((f) => f.arg === "payOptional")).toBe(true);
    await game.p1.play("cub", { payOptional: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("cub")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cub", controller: P1, triggered: true })]);
    expect(game.state("small").might).toBe(2); // nothing applied before resolution
  });

  test("on resolution P1 picks 'a unit' — enemy units anywhere AND the Cub itself are offered; the pick gets -2 this turn", async () => {
    const game = await board({ energy: 3, power: { mind: 1 } }).build();
    await game.p1.play("cub", { payOptional: true });
    const d = await resolvePick(game, "big");
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["big", "cub", "small"]);
    expect(game.state("big")).toMatchObject({ baseMight: 5, might: 3, mightModifier: -2 });
    expect(game.state("small").might).toBe(2);
    expect(game.state("cub").might).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the Cub may shrink itself (it is on the board when the trigger is finalized): 3 → 1", async () => {
    const game = await board({ energy: 3, power: { mind: 1 } }).build();
    await game.p1.play("cub", { payOptional: true });
    await resolvePick(game, "cub");
    expect(game.state("cub").might).toBe(1);
    expect(game.zoneOf("cub")).toBe("base");
  });

  test("'this turn': the -2 wears off in the Expiration Step", async () => {
    const game = await board({ energy: 3, power: { mind: 1 } }).build();
    await game.p1.play("cub", { payOptional: true });
    await resolvePick(game, "big");
    expect(game.state("big").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("big")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("the additional cost is [mind] power: with 3 energy + a FURY power only the plain play is offered", async () => {
    const game = await board({ energy: 3, power: { fury: 1 } }).build();
    expect(game.p1.can("play", "cub")).toBe(true);
    expect(game.p1.option("play", "cub")?.fields.some((f) => f.arg === "payOptional")).toBe(false);
    const r = await game.p1.try((p) => p.play("cub", { payOptional: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("cub")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
  });

  test("with 3 energy and no power at all the optional cost is simply not offered (the unit is still playable)", async () => {
    const game = await board({ energy: 3 }).build();
    expect(game.p1.can("play", "cub")).toBe(true);
    expect(game.p1.option("play", "cub")?.fields.some((f) => f.arg === "payOptional")).toBe(false);
  });

  test("an undamaged 2-Might unit taken to 0 Might stays on the board — lethal damage must be non-zero", async () => {
    const game = await board({ energy: 3, power: { mind: 1 } }).build();
    await game.p1.play("cub", { payOptional: true });
    await resolvePick(game, "small");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.state("small").damage).toBe(0);
    expect(game.state("small").might).toBe(0);
    await game.advanceTurn();
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.state("small").might).toBe(2);
  });

  test("Might below 0 reads as 0: a 1-Might unit given -2 is a living 0-Might unit, not -1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .unit(P2, "base", { might: 1, name: "Tiny" }, "tiny")
      .hand(P1, CARD, "cub")
      .build();
    await game.p1.play("cub", { payOptional: true });
    await resolvePick(game, "tiny");
    expect(game.state("tiny")).toMatchObject({ might: 0, mightModifier: -2, zone: "base" });
  });

  test("a 4-Might unit carrying 2 damage that gets -2 now has lethal damage (2 ≥ 2) and is killed in the cleanup", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wounded" }, "wounded", { damage: 2 })
      .hand(P1, CARD, "cub")
      .build();
    expect(game.state("wounded")).toMatchObject({ damage: 2, might: 4 });
    await game.p1.play("cub", { payOptional: true });
    await resolvePick(game, "wounded");
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.zoneOf("cub")).toBe("base");
  });

  test("only the Cub on the board: it is the lone legal unit, so the paid trigger shrinks the Cub itself", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "cub").build();
    await game.p1.play("cub", { payOptional: true });
    await resolvePick(game, "cub"); // settle() auto-takes a forced single pick; explicit pick otherwise
    expect(game.state("cub").might).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
  });

  test("parsed abilities: an optional [mind] additional-cost static + a play-self trigger gated on 'paid the additional cost' giving a unit -2 this turn", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, might: 3 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { optional: true, type: "additional-cost-option" },
      type: "static",
    });
    expect(JSON.stringify(def?.abilities?.[0])).toMatch(/mind/);
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "paid-additional-cost" },
      effect: { amount: -2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });
});
