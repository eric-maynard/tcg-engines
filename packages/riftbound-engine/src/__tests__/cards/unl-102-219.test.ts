/**
 * Crowd Favorite — unl-102-219 · Unit · Body · 3 energy · 3 might
 *
 *   [Hunt] (When I conquer or hold, gain 1 XP.)
 *   Spend 2 XP: [Buff] me. (Give me a +1 [Might] buff if I don't have one.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Hunt (823) is a triggered ability keyed on THIS unit conquering or holding: it fires when Crowd
 *      Favorite is among the conquering attackers (even into an empty battlefield) or sits on a held
 *      battlefield at the start of ITS CONTROLLER's Beginning Phase — not when some other unit conquers,
 *      not when it attacks and dies, not during the opponent's Beginning Phase. Bare "[Hunt]" = Hunt 1.
 *   2. "Spend 2 XP" is the whole cost: no [Exhaust], so it works while exhausted; exactly 2 XP is
 *      enough, 1 is not; exactly 2 is deducted (730.2) — not more.
 *   3. Buff (426/702): a +1 Might COUNTER, not a "this turn" bonus — it survives turn ends. A unit can
 *      hold only one: activating again while buffed still spends the XP but adds nothing (426.1.c).
 *   4. Unit activated abilities (145.2): only in your Main Phase open state — never on the opponent's
 *      turn and never inside a showdown, even one where Crowd Favorite is the attacker.
 *   5. The natural loop: hold twice (2 XP over two of your turns) → cash in for the buff → a 4-Might
 *      holder from then on.
 *   6. Cost: 3 energy, no power; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-102-219";

describe("Crowd Favorite (unl-102-219)", () => {
  test("registry payload: Hunt 1 keyword (+ its conquer/hold gain-xp triggers) and an activated 'xp: 2 → buff self' ability with no exhaust cost", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 3, might: 3 });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toEqual({ keyword: "Hunt", type: "keyword", value: 1 });
    expect(abilities).toContainEqual(expect.objectContaining({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "conquer", on: "self" }, type: "triggered" }));
    expect(abilities).toContainEqual(expect.objectContaining({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "hold", on: "self" }, type: "triggered" }));
    const activated = abilities.find((a) => a.type === "activated");
    expect(activated).toMatchObject({ cost: { xp: 2 }, effect: { target: "self", type: "buff" }, type: "activated" });
    expect((activated?.cost as { exhaust?: boolean }).exhaust).toBeUndefined();
  });

  test("cost: 3 energy for a 3-Might Hunt unit that enters the base exhausted; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "cf").build();
    await game.p1.play("cf");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("cf")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
    expect(game.state("cf").keywords).toContain("Hunt");
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "cf").build()).p1.can("play", "cf")).toBe(false);
  });

  test("Hunt on CONQUER: attacking a 2-Might defender — it dies, bf1 is conquered (+1 point) and the Hunt trigger resolves for +1 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2, name: "Foe" }, "foe").unit(P1, "base", CARD, "cf").build();
    expect(game.p1.xp()).toBe(0);
    await game.p1.move("cf", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat resolves → conquer → Hunt on the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cf", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
  });

  test("Hunt on conquering an EMPTY uncontrolled battlefield also gives 1 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "cf").build();
    await game.p1.move("cf", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(1);
  });

  test("Hunt on HOLD: at the start of YOUR Beginning Phase on a battlefield you control → trigger on the chain, +1 XP (and the hold point); nothing during the opponent's Beginning Phase", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "cf").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cf", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // → P2's turn: P1 still controls bf1 but it is not P1's Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(1);
  });

  test("negative space: 'when I conquer' — another unit conquering while Crowd Favorite sits in base gives no XP; Crowd Favorite attacking and DYING gives no XP", async () => {
    const other = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", { might: 2, name: "Other" }, "other").unit(P1, "base", CARD, "cf").build();
    await other.p1.move("other", "bf1");
    await other.settle();
    expect(other.p1.points()).toBe(1);
    expect(other.p1.xp()).toBe(0);
    const dies = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 5, name: "Wall" }, "wall").unit(P1, "base", CARD, "cf").build();
    await dies.p1.move("cf", "bf1");
    await dies.settle();
    expect(dies.zoneOf("cf")).toBe("trash");
    expect(dies.p1.xp()).toBe(0);
    expect(dies.p1.points()).toBe(0);
  });

  test("Hunt is per unit: conquering alongside a plain ally (both survive a 2-Might defender) gives exactly 1 XP; two Crowd Favorites conquering together give 2", async () => {
    const one = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2 }, "foe").unit(P1, "base", CARD, "cf").unit(P1, "base", { might: 4 }, "ally").build();
    await one.p1.move(["cf", "ally"], "bf1");
    await one.settle({ policy: "first" });
    expect(one.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(one.locationOf("cf")).toBe("bf1");
    expect(one.p1.xp()).toBe(1);
    const two = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2 }, "foe").unit(P1, "base", CARD, "cf1").unit(P1, "base", CARD, "cf2").build();
    await two.p1.move(["cf1", "cf2"], "bf1");
    await two.settle({ policy: "first" });
    expect(two.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(two.p1.units("bf1").sort()).toEqual(["cf1", "cf2"]);
    expect(two.p1.xp()).toBe(2);
  });

  test("a Crowd Favorite that DIES in a winning attack did not conquer: ally (4) + Crowd Favorite into a 3-Might defender that puts its 3 on Crowd Favorite → conquered, 0 XP", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "foe")
      .unit(P1, "base", CARD, "cf")
      .unit(P1, "base", { might: 4 }, "ally")
      .script(P2, [(d) => (d.kind === "distribute" ? { allocation: { ally: 0, cf: 3 }, kind: "distribute" as const } : undefined)])
      .build();
    await game.p1.move(["cf", "ally"], "bf1");
    await game.settle({ policy: "first" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("cf")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
  });

  test("Spend 2 XP: legal at exactly 2 XP (even while EXHAUSTED — no [Exhaust] in the cost), paid on activation, ability on the chain, then buffed to 4; not legal at 1 XP", async () => {
    const game = await scenario().xp(P1, 2).unit(P1, "base", CARD, "cf", { exhausted: true }).build();
    expect(game.p1.can("activate", "cf")).toBe(true);
    await game.p1.activate("cf");
    expect(game.p1.xp()).toBe(0); // cost paid up front
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cf", controller: P1, triggered: false })]);
    expect(game.state("cf").isBuffed).toBe(false); // effect not yet
    await game.settle();
    expect(game.state("cf")).toMatchObject({ baseMight: 3, isBuffed: true, isExhausted: true, might: 4 });
    const poor = await scenario().xp(P1, 1).unit(P1, "base", CARD, "cf").build();
    expect(poor.p1.can("activate", "cf")).toBe(false);
  });

  test("'Spend 2 XP' deducts exactly 2 (730.2) — from 5 XP the activation leaves 3", async () => {
    const game = await scenario().xp(P1, 5).unit(P1, "base", CARD, "cf").build();
    await game.p1.activate("cf");
    await game.settle();
    expect(game.state("cf").isBuffed).toBe(true);
    expect(game.p1.xp()).toBe(3);
  });

  test("the buff is a counter, not a 'this turn' bonus: still 4 Might two turns later", async () => {
    const game = await scenario().xp(P1, 2).unit(P1, "base", CARD, "cf").build();
    await game.p1.activate("cf");
    await game.settle();
    expect(game.state("cf").might).toBe(4);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("cf")).toMatchObject({ isBuffed: true, might: 4 });
  });

  test("only one buff per unit (426.1.c / 702.3): activating while already buffed still spends the XP but Might stays 4", async () => {
    const game = await scenario().xp(P1, 2).unit(P1, "base", CARD, "cf", { buffed: true }).build();
    expect(game.state("cf")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.p1.can("activate", "cf")).toBe(true); // a buffed unit is still a legal choice
    await game.p1.activate("cf");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.state("cf")).toMatchObject({ isBuffed: true, might: 4 });
  });

  test("timing (145.2): the ability is not available on the opponent's turn, nor inside a showdown — not even one where Crowd Favorite is the attacker", async () => {
    const opp = await scenario().active(P2).xp(P1, 4).unit(P1, "base", CARD, "cf").build();
    expect(opp.p1.can("activate", "cf")).toBe(false);
    const sd = await scenario().xp(P1, 4).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "foe").unit(P1, "base", CARD, "cf").build();
    await sd.p1.move("cf", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "cf")).toBe(false);
  });

  test("the loop: hold on two of your turns (1 + 1 XP, 2 points), then spend the 2 XP in your main phase → a buffed 4-Might holder", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "cf").build();
    expect(game.p1.can("activate", "cf")).toBe(false); // 0 XP (and not your turn)
    await game.advanceTurn(); // P1: hold #1
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.can("activate", "cf")).toBe(false); // 1 XP is one short
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1: hold #2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.points()).toBe(2);
    await game.p1.activate("cf");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.state("cf")).toMatchObject({ isBuffed: true, location: "bf1", might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
