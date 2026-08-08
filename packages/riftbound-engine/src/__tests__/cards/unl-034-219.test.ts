/**
 * Herald of Spring — unl-034-219 · Unit · Calm · 4 energy + 1 [calm] · 4 Might
 *
 *   [Hunt] (When I conquer or hold, gain 1 XP.)
 *   When you play me, gain 2 XP.
 *
 * Rules: 823 (Hunt = "When I conquer or hold, my controller gains X XP"; bare [Hunt] = Hunt 1;
 * 823.2 values from several units/instances sum), 728–733 (XP is a player resource, public, no cap),
 * 469 (Hold: keep control through YOUR Beginning Phase; Conquer: take control — each also scores),
 * 383.4.d (hold/conquer effects fire only for units AT that battlefield), 135.2.e.5.b ([A]/rainbow
 * power pays a Power cost of any domain), 824 (Level N abilities switch on as soon as XP ≥ N).
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Exactly +1 XP per conquer/hold — the card carries both the Hunt keyword and its reminder
 *     text; a parser that emits both must not double-pay (2 XP) nor skip (0 XP).
 *  2. "When I conquer/hold": Herald sitting in base while ANOTHER unit holds/conquers earns nothing;
 *     a lost attack (no conquer) earns nothing; the opponent's Beginning Phase is not a hold.
 *  3. Conquering an EMPTY enemy battlefield is still a conquer → +1 XP.
 *  4. Two Heralds at the same battlefield: each triggers → +2 XP on one conquer/hold (823.2 spirit).
 *  5. The play trigger's 2 XP arrives on RESOLUTION (it is a chain item), and can flip a partner's
 *     [Level 6] ability on mid-turn (Honeyfruit unl-049-219: 4 XP → 6 XP unlocks its second ability).
 *  6. Cost: 4 energy + a CALM pip; rainbow power from Honeyfruit must be accepted for the pip.
 *  7. Full arc across turns: play (2) → conquer next own turn (3, 1 pt) → hold the turn after (4, 2 pts).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-034-219";
const HONEYFRUIT = "unl-049-219"; // Gear: [Reaction] Exhaust: Add [rainbow]; [Level 6] Exhaust: Add [1][rainbow]

describe("Herald of Spring (unl-034-219)", () => {
  test("cost & body: 4 energy + 1 calm; enters base exhausted as a 4-Might Hunt unit; the play trigger is a triggered chain item and the 2 XP land only when it resolves", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "herald").build();
    await game.p1.play("herald");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.state("herald")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    expect(game.state("herald").keywords).toContain("Hunt");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0); // not yet — still on the chain
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(game.p1.points()).toBe(0); // XP is not points
    expect(game.chain()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable: 4 energy but no calm power; a FURY power does not pay a calm pip; 3 energy + calm is short", async () => {
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
  });

  test("partner — Honeyfruit's [Add][rainbow] pays the calm pip (135.2.e.5.b): 4 energy + a ready Honeyfruit is enough to play Herald", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P1, HONEYFRUIT, "fruit").hand(P1, CARD, "herald").build();
    expect(game.p1.can("play", "herald")).toBe(false);
    await game.p1.activate("fruit");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 1 } });
    expect(game.p1.can("play", "herald")).toBe(true);
    await game.p1.play("herald");
    expect(game.p1.energy()).toBe(0);
    expect(Object.values(game.p1.resources().power).reduce((a, b) => a + b, 0)).toBe(0);
    expect(game.zoneOf("herald")).toBe("base");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
  });

  test("[Hunt] on conquer: Herald attacks a 1-Might defender, wins, conquers → exactly +1 XP (not 0, not 2) and 1 point", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry").unit(P1, "base", CARD, "herald").build();
    await game.p1.move("herald", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("[Hunt] on conquer of an EMPTY enemy battlefield: still a conquer → +1 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "herald").build();
    await game.p1.move("herald", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(1);
  });

  test("negative space — a LOST attack is not a conquer: Herald dies into a 5-Might defender, P1 gains no XP and no point", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 5, name: "Wall" }, "wall").unit(P1, "base", CARD, "herald").build();
    await game.p1.move("herald", "bf1");
    await game.settle();
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  test("[Hunt] on hold: at the start of P1's turn Herald holds bf1 → the hold trigger sits on the chain in the Beginning Phase, then exactly +1 XP (and the hold point)", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "herald").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space — 'When I hold': Herald in base while a vanilla unit holds bf1 → the point is scored but NO XP; and the opponent's Beginning Phase is never P1's hold", async () => {
    const inBase = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2 }, "grunt").unit(P1, "base", CARD, "herald").build();
    await inBase.advanceTurn();
    expect(inBase.turnPlayer()).toBe(P1);
    expect(inBase.p1.points()).toBe(1);
    expect(inBase.p1.xp()).toBe(0);

    const oppTurn = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "herald").build();
    await oppTurn.advanceTurn();
    expect(oppTurn.turnPlayer()).toBe(P2);
    expect(oppTurn.p1.xp()).toBe(0);
    expect(oppTurn.p2.xp()).toBe(0);
  });

  test("two Heralds at the same battlefield: one hold → each triggers → +2 XP (but still a single hold point)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "h1")
      .unit(P1, "bf1", CARD, "h2")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.points()).toBe(1);
  });

  test("two Heralds conquering together: +2 XP, 1 point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", CARD, "h1")
      .unit(P1, "base", CARD, "h2")
      .build();
    await game.p1.move(["h1", "h2"], "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(2);
  });

  test("partner — the play trigger's 2 XP flips a [Level 6] ability on mid-turn: at 4 XP Honeyfruit offers only its base ability; after Herald resolves (6 XP) the Level-6 ability is live and adds [1][rainbow]", async () => {
    const game = await scenario().xp(P1, 4).resources(P1, { energy: 4, power: { calm: 1 } }).gear(P1, HONEYFRUIT, "fruit").hand(P1, CARD, "herald").build();
    expect(game.p1.can("activateAbility:fruit#1")).toBe(true);
    expect(game.p1.can("activateAbility:fruit#2")).toBe(false);
    await game.p1.play("herald");
    expect(game.p1.can("activateAbility:fruit#2")).toBe(false); // trigger still on the chain: 4 XP
    await game.settle();
    expect(game.p1.xp()).toBe(6);
    expect(game.p1.can("activateAbility:fruit#2")).toBe(true);
    await game.p1.activate("fruit", 2);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, rainbow: 1 } });
  });

  test("full arc across turns: play (2 XP) → she readies → conquers an empty battlefield next own turn (3 XP, 1 pt) → holds it the turn after (4 XP, 2 pts)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .hand(P1, CARD, "herald")
      .build();
    await game.p1.play("herald");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.can("move")).toBe(false); // entered exhausted
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 — Awaken readied her
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("herald").isReady).toBe(true);
    await game.p1.move("herald", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // P2
    expect(game.p1.xp()).toBe(3); // nothing during the opponent's turn
    await game.advanceTurn(); // P1 — hold
    expect(game.p1.xp()).toBe(4);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("registry payload matches the printed text: [Hunt] (value 1), a play-self trigger gaining exactly 2 XP, any conquer/hold XP effect worth exactly 1; 4 energy + [calm], 4 Might", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 4, might: 4, name: "Herald of Spring" });
    expect(def?.powerCost).toEqual(["calm"]);
    type Ab = { type: string; keyword?: string; value?: number; trigger?: { event?: string }; effect?: { type?: string; amount?: number } };
    const abilities = (def?.abilities ?? []) as Ab[];
    const hunt = abilities.filter((a) => a.type === "keyword" && a.keyword === "Hunt");
    expect(hunt).toHaveLength(1);
    expect(hunt[0]?.value ?? 1).toBe(1);
    const play = abilities.filter((a) => a.type === "triggered" && a.trigger?.event === "play-self");
    expect(play).toEqual([expect.objectContaining({ effect: { amount: 2, type: "gain-xp" } })]);
    for (const a of abilities.filter((x) => x.type === "triggered" && (x.trigger?.event === "conquer" || x.trigger?.event === "hold"))) {
      expect(a.effect).toEqual({ amount: 1, type: "gain-xp" });
    }
    // Nothing else sneaked in (no other keywords, no static abilities).
    expect(abilities.filter((a) => a.type !== "keyword" && a.type !== "triggered")).toEqual([]);
    expect(abilities.filter((a) => a.type === "keyword").map((a) => a.keyword)).toEqual(["Hunt"]);
  });
});
