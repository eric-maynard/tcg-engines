/**
 * Vanguard Armory — sfd-168-221 · Gear · Order · 7 energy + [order]
 *
 *   [Exhaust]: Play three 1 [Might] Recruit unit tokens. (You may play them to different locations.)
 *
 * Head-judge checklist for this card:
 *  1. Cost split: PLAYING the gear is 7 energy + 1 order power and it enters READY (gear default), so
 *     it can be cranked the turn it lands; USING it costs only [Exhaust] — no resources — and an
 *     exhausted Armory cannot pay (once per Awaken).
 *  2. "Play three … tokens": each Recruit (187.1: domainless 1-Might unit token, Recruit tag) is PLAYED,
 *     so it enters exhausted (143.4) under P1's control; exactly three, never more.
 *  3. "(You may play them to different locations.)" = 439.2.b.1: each token independently goes to
 *     P1's base or a battlefield P1 CONTROLS — an uncontrolled or enemy battlefield is never offered;
 *     with no controlled battlefield they all simply land in base with no prompt.
 *  4. Timing: a plain activated ability (no [Action]/[Reaction]) — only on your own turn in an open
 *     state; not on the opponent's turn, not inside a showdown.
 *  5. It is a normal chain item (not an [Add]): the opponent gets priority before any token exists,
 *     and the Armory is already exhausted while the ability is pending (cost paid up front).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-168-221";

const recruits = (game: Game, ids: string[]) => ids.filter((id) => game.state(id).name === "Recruit");

/** P1's turn with a ready Armory in base; bf1 is P1's, bf2 uncontrolled, bf3 P2's. */
function withArmory(meta?: { exhausted?: boolean }) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P2 })
    .unit(P2, "bf3", { might: 2, name: "Sentry" }, "sentry")
    .gear(P1, CARD, "armory", meta);
}

/** Activate, let it resolve, and answer the three destination prompts. */
async function crank(game: Game, dests: [string, string, string]): Promise<void> {
  await game.p1.activate("armory");
  for (const d of dests) {
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick(d);
  }
  await game.settle();
}

describe("Vanguard Armory (sfd-168-221)", () => {
  test("registry payload: 7 + [order] gear with ONE activated ability — cost {exhaust}, create-token ×3 of a 1-Might 'Recruit' unit", async () => {
    await withArmory().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "order", energyCost: 7, name: "Vanguard Armory", powerCost: ["order"] });
    expect(def?.abilities).toEqual([
      {
        cost: { exhaust: true },
        effect: { amount: 3, token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" },
        type: "activated",
      },
    ]);
  });

  test("cost to play: 7 energy + 1 order; the gear enters the base READY; short on either resource → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { order: 1 } }).hand(P1, CARD, "armory").build();
    await game.p1.play("armory");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("armory")).toBe("base");
    expect(game.state("armory")).toMatchObject({ cardType: "gear", isReady: true });
    expect((await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { order: 2 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
  });

  test("played and cranked the same turn: three exhausted 1-Might Recruit unit tokens, Armory exhausted, no resources spent on the ability", async () => {
    const game = await scenario().resources(P1, { energy: 9, power: { order: 1 } }).hand(P1, CARD, "armory").build();
    await game.p1.play("armory");
    await game.settle();
    await game.p1.activate("armory");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } }); // [Exhaust] only
    expect(game.state("armory").isExhausted).toBe(true); // cost paid on activation
    await game.settle(); // no controlled battlefield → no destination prompt, all to base
    const toks = recruits(game, game.p1.base());
    expect(toks).toHaveLength(3);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, name: "Recruit", owner: P1 });
      expect(game.state(t).domains).toEqual([]);
    }
    expect(recruits(game, game.p2.base())).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'different locations': each token is placed independently — base, bf1, bf1 → 1 Recruit in base, 2 at bf1, none elsewhere", async () => {
    const game = await withArmory().build();
    await crank(game, ["base", "battlefield-bf1", "battlefield-bf1"]);
    expect(recruits(game, game.p1.base())).toHaveLength(1);
    expect(recruits(game, game.p1.units("bf1"))).toHaveLength(2);
    expect(recruits(game, game.p1.units("bf2"))).toHaveLength(0);
    expect(recruits(game, game.p1.units("bf3"))).toHaveLength(0);
    expect(recruits(game, game.p1.units("bf1")).every((t) => game.state(t).isExhausted)).toBe(true);
  });

  test("destinations offered are exactly your base and battlefields YOU control (439.2.b.1) — never the open bf2 or the enemy bf3", async () => {
    const game = await withArmory().build();
    await game.p1.activate("armory");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["base", "battlefield-bf1"]);
    const bad = await game.p1.try((p) => p.pick("battlefield-bf3"));
    expect(bad.ok).toBe(false);
  });

  test("exactly three prompts / three tokens: after the third placement the game is back to P1's open main phase", async () => {
    const game = await withArmory().build();
    await crank(game, ["battlefield-bf1", "base", "battlefield-bf1"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(recruits(game, [...game.p1.base(), ...game.p1.units("bf1")])).toHaveLength(3);
  });

  test("[Exhaust] is the whole cost: an exhausted Armory cannot be activated; it readies at P1's next Awaken and works again (6 Recruits total)", async () => {
    const game = await withArmory({ exhausted: true }).build();
    expect(game.p1.can("activate", "armory")).toBe(false);
    expect((await game.p1.try((p) => p.activate("armory"))).ok).toBe(false);
    await game.advanceToTurnOf(P2);
    expect(game.state("armory").isExhausted).toBe(true);
    await game.advanceToTurnOf(P1);
    expect(game.state("armory").isReady).toBe(true);
    await crank(game, ["base", "base", "base"]);
    expect(recruits(game, game.p1.base())).toHaveLength(3);
    expect(game.p1.can("activate", "armory")).toBe(false); // spent for this turn again
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await crank(game, ["base", "base", "base"]);
    expect(recruits(game, game.p1.base())).toHaveLength(6);
  });

  test("timing: no [Action]/[Reaction] tag — not activatable on the opponent's turn, nor with Focus inside a showdown on your own turn", async () => {
    const oppTurn = await withArmory().active(P2).build();
    expect(oppTurn.p1.can("activate", "armory")).toBe(false);
    const myShowdown = await withArmory().unit(P1, "base", { might: 3, name: "Scout" }, "scout").build();
    await myShowdown.p1.move("scout", "bf3");
    expect(myShowdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(myShowdown.p1.can("activate", "armory")).toBe(false);
  });

  test("it is a normal chain item: Armory exhausted and ability pending while P2 holds priority; no Recruit exists until it resolves", async () => {
    const game = await withArmory().build();
    await game.p1.activate("armory");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "armory", controller: P1 })]);
    expect(game.state("armory").isExhausted).toBe(true);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(recruits(game, [...game.p1.base(), ...game.p1.units("bf1")])).toEqual([]);
    await game.p2.passPriority();
    for (let i = 0; i < 3; i++) {
      await game.settle();
      await game.p1.pick("base");
    }
    await game.settle();
    expect(recruits(game, game.p1.base())).toHaveLength(3);
  });

  test("Recruits played to your own battlefield defend it: P2's 2-Might Raider attacking into two fresh Recruits kills both but dies to their 1+1 — P2 scores nothing", async () => {
    const game = await withArmory().unit(P2, "base", { might: 2, name: "Raider" }, "raider").build();
    await crank(game, ["battlefield-bf1", "battlefield-bf1", "base"]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const p2Before = game.p2.points(); // P2 held bf3 in its Beginning Phase
    await game.p2.move("raider", "bf1");
    await game.settle({ policy: "first" });
    // Raider (2) assigns 1+1 → both Recruits die; Recruits deal 1+1 = 2 → Raider dies. Nobody conquers.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(recruits(game, game.p1.units("bf1"))).toHaveLength(0);
    // Nobody has units left there → P1 loses control in the cleanup (190.4.c) but P2 never conquered.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p2.points()).toBe(p2Before);
    expect(recruits(game, game.p1.base())).toHaveLength(1);
  });
});
