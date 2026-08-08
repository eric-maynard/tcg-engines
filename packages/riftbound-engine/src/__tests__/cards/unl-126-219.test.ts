/**
 * Megatusk — unl-126-219 · Unit · Chaos · 6 energy · 6 Might
 *
 *   Spend 3 XP: Give your units here [Ganking] this turn. (We can move from battlefield to battlefield.)
 *
 * Rules: 730.2 (Spend XP = pay exactly N from your XP total; can't if you have less), 145.2 (a unit's
 * activated ability: your turn, open state, no showdown), 810 / 144.4.c.1 (Ganking lets a Standard Move
 * go battlefield → battlefield), 140.3-ish "here" = the source's current location, 359.3.e.12 (a source
 * that left the board has a null location), one-shot "give … this turn" effects bind the units present on
 * resolution and expire in end-of-turn cleanup.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. Cost is ONLY XP — no [Exhaust]: a freshly played (exhausted) Megatusk can still activate; exactly
 *      3 is deducted (5 → 2); 2 XP is one short; 6 XP allows two (redundant, 810.2) activations.
 *   2. "your units HERE": Megatusk itself + friendly units at its location only — not friendly units at
 *      another battlefield or in base, never enemy units sharing the battlefield. With Megatusk in base,
 *      "here" is the base.
 *   3. One-shot, not an aura: a unit that arrives after resolution gets nothing; a unit that received it
 *      keeps it after ganking away; everything expires at end of turn.
 *   4. The payoff: after resolution a READY unit here can gank bf1 → bf2 (into combat); before, it can't.
 *   5. Timing: not on the opponent's turn, not inside a showdown.
 *   6. XP is paid on activation (before resolution) and is not refunded if Megatusk is killed in
 *      response; with Megatusk gone "here" is null so nobody gains Ganking.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-126-219";
const ZAP6 = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Obliterate",
  rulesText: "[Reaction] Deal 6 to a unit.",
  timing: "reaction",
} as const;

/** P1 holds bf1 with a READY Megatusk + ready ally; another ally on bf2 (P1) and one in base; P2 unit on bf3. */
function board(xp = 3, withSquatter = true) {
  const b = scenario()
    .xp(P1, xp)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", CARD, "mega")
    .unit(P1, "bf1", { might: 2, name: "Here Ally" }, "here")
    .unit(P1, "bf2", { might: 2, name: "There Ally" }, "there")
    .unit(P1, "base", { might: 2, name: "Home Ally" }, "home")
    .unit(P2, "bf3", { might: 2, name: "Foe" }, "foe");
  return withSquatter ? b.unit(P2, "bf1", { might: 1, name: "Squatter" }, "squatter") : b;
}

const hasGanking = (game: { state: (c: string) => { keywords: readonly string[] } }, c: string) => game.state(c).keywords.includes("Ganking");

describe("Megatusk (unl-126-219)", () => {
  test("registry payload: 6-cost chaos 6-Might unit with ONE activated ability — cost {xp:3} (no exhaust), grant Ganking (turn) to all friendly units here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 6, might: 6, name: "Megatusk" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toEqual({
      cost: { xp: 3 },
      effect: { duration: "turn", keyword: "Ganking", target: { controller: "friendly", location: "here", quantity: "all", type: "unit" }, type: "grant-keyword" },
      type: "activated",
    });
  });

  test("cost to play: 6 energy, no power → 6-Might unit in base, exhausted; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "mega").build();
    await game.p1.play("mega");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("mega")).toMatchObject({ isExhausted: true, might: 6, zone: "base" });
    expect((await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).hand(P1, CARD, "mega").build()).p1.can("play", "mega")).toBe(false);
  });

  test("Spend 3 XP: paid on activation (5 → 2), ability on the chain, and on resolution Megatusk + the ally HERE have Ganking — not the ally on bf2, not the one in base, not the enemy squatter", async () => {
    const game = await board(5).build();
    expect(hasGanking(game, "mega")).toBe(false);
    await game.p1.activate("mega");
    expect(game.p1.xp()).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mega", controller: P1, triggered: false })]);
    expect(hasGanking(game, "here")).toBe(false); // nothing before resolution
    await game.settle();
    expect(game.state("mega").grantedKeywords).toContainEqual(expect.objectContaining({ duration: "turn", keyword: "Ganking" }));
    expect(hasGanking(game, "here")).toBe(true);
    expect(hasGanking(game, "there")).toBe(false);
    expect(hasGanking(game, "home")).toBe(false);
    expect(hasGanking(game, "squatter")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("XP boundary: legal at exactly 3 (→ 0), not legal at 2; no [Exhaust] in the cost so an EXHAUSTED Megatusk can activate", async () => {
    const exact = await scenario().xp(P1, 3).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "mega", { exhausted: true }).build();
    expect(exact.p1.can("activate", "mega")).toBe(true);
    await exact.p1.activate("mega");
    await exact.settle();
    expect(exact.p1.xp()).toBe(0);
    expect(exact.state("mega")).toMatchObject({ isExhausted: true });
    expect(hasGanking(exact, "mega")).toBe(true);
    const short = await scenario().xp(P1, 2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "mega").build();
    expect(short.p1.can("activate", "mega")).toBe(false);
  });

  test("the payoff: before activation the ready ally here cannot gank; afterwards it ganks bf1 → bf3 into the enemy and a showdown opens", async () => {
    const game = await board(3).build();
    expect(game.p1.can("gank", "here")).toBe(false);
    await game.p1.activate("mega");
    await game.settle();
    expect(game.p1.can("gank", "here")).toBe(true);
    expect(game.p1.can("gank", "there")).toBe(false); // other battlefield: no Ganking
    await game.p1.gank("here", "bf3");
    expect(game.locationOf("here")).toBe("bf3");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 2 vs 2 trade
    expect(game.zoneOf("here")).toBe("trash");
  });

  test("Megatusk itself (ready, 6 Might) can gank bf1 → bf3 and conquer it", async () => {
    const game = await board(3).build();
    await game.p1.activate("mega");
    await game.settle();
    await game.p1.gank("mega", "bf3");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("mega")).toBe("bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'this turn': the grant is gone after the turn passes (both on Megatusk and on the ally)", async () => {
    const game = await board(3, false).build();
    await game.p1.activate("mega");
    await game.settle();
    expect(hasGanking(game, "here")).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(hasGanking(game, "here")).toBe(false);
    expect(hasGanking(game, "mega")).toBe(false);
    expect(game.state("mega").grantedKeywords).toEqual([]);
  });

  test("one-shot, not an aura: a unit that moves 'here' AFTER resolution does not pick up Ganking; a unit that had it keeps it after leaving", async () => {
    const game = await board(3).build();
    await game.p1.activate("mega");
    await game.settle();
    await game.p1.move("home", "bf1"); // arrives after the fact
    expect(game.locationOf("home")).toBe("bf1");
    expect(hasGanking(game, "home")).toBe(false);
    await game.p1.gank("here", "bf2"); // friendly bf → no combat
    expect(game.locationOf("here")).toBe("bf2");
    expect(hasGanking(game, "here")).toBe(true);
  });

  test("'here' follows Megatusk: with Megatusk in BASE the base units get Ganking and battlefield units do not", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "mega")
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P1, "bf1", { might: 2 }, "field")
      .build();
    await game.p1.activate("mega");
    await game.settle();
    expect(hasGanking(game, "home")).toBe(true);
    expect(hasGanking(game, "mega")).toBe(true);
    expect(hasGanking(game, "field")).toBe(false);
  });

  test("6 XP buys two activations in one turn (Ganking is redundant, 810.2) — XP ends at 0 and the unit still has Ganking once in its keyword list semantics", async () => {
    const game = await board(6).build();
    await game.p1.activate("mega");
    await game.settle();
    expect(game.p1.can("activate", "mega")).toBe(true);
    await game.p1.activate("mega");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(hasGanking(game, "here")).toBe(true);
    expect(game.p1.can("activate", "mega")).toBe(false);
  });

  test("timing (145.2): not on the opponent's turn; not inside a showdown even with XP to spare", async () => {
    const opp = await board(6).active(P2).build();
    expect(opp.p1.can("activate", "mega")).toBe(false);
    const sd = await scenario().xp(P1, 6).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "foe").unit(P1, "base", CARD, "mega").build();
    await sd.p1.move("mega", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "mega")).toBe(false);
  });

  test("XP is spent on activation and not refunded when Megatusk is killed in response; with the source off the board 'here' is null → nobody gains Ganking (359.3.e.12)", async () => {
    const game = await board(3).resources(P2, { energy: 0 }).hand(P2, ZAP6, "zap").build();
    await game.p1.activate("mega");
    expect(game.p1.xp()).toBe(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("zap", { targets: "mega" });
    await game.settle();
    expect(game.zoneOf("mega")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
    expect(hasGanking(game, "here")).toBe(false);
    expect(hasGanking(game, "there")).toBe(false);
    expect(hasGanking(game, "home")).toBe(false);
  });
});
