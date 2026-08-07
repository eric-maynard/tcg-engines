/**
 * Nami, Headstrong — unl-052-219 · Champion Unit (Nami) · Calm · 3 energy (no power) · 3 might
 *
 *   You may pay [calm] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, [Stun] an enemy unit. (It doesn't deal
 *   combat damage this turn.)
 *   When I hold, the next time you play a unit this turn, ready it and [Buff] it.
 *
 * Rules: 356.2 (optional additional cost, chosen and paid while playing the card), 359.3 ("if you
 * paid" is checked on resolution of the play trigger), 423 (Stun: no combat damage this turn, still
 * takes lethal, cleared in end-of-turn cleanup), 383.4.d (Hold effect: Nami must be AT a battlefield
 * you keep control of in YOUR Beginning Phase; you also score the hold point), 143.4 (units enter
 * exhausted unless an effect says otherwise), 701–703 (Buff = one counter, +1 might, max one),
 * 355.10.a.1 (playing from the Champion Zone is still "playing me").
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. The stun rides on the PAID cost, not on having calm: decline → 3 energy only, calm untouched,
 *     no stun prompt even with enemies around; no calm in pool → the option cannot be taken at all.
 *  2. Paid with no enemy unit on the board: legal (the cost is a cost), calm is spent, nothing to stun.
 *  3. Enemy units in base AND at battlefields are all eligible; friendly units never are.
 *  4. Hold payoff is a one-shot on the NEXT unit YOU play THIS turn: first unit enters ready + buffed
 *     (might +1), the second enters exhausted/unbuffed; a gear played in between does not consume it;
 *     if you play no unit that turn it simply lapses — next turn's unit is normal.
 *  5. Only Nami's own hold: Nami in base while another unit holds → point but no payoff; the
 *     opponent's Beginning Phase → nothing.
 *  6. Same-turn value of the stun: stun a defender, then attack it — it deals no damage back.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-052-219";
const RECRUIT = { cardType: "unit", domain: "calm", energyCost: 1, might: 2, name: "Tide Recruit" } as const;
const TRINKET = { abilities: [], cardType: "gear", domain: "calm", energyCost: 1, name: "Shell Trinket" } as const;

function inHand(power: Record<string, number> = { calm: 1 }) {
  return scenario()
    .resources(P1, { energy: 3, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CARD, "nami");
}

/** P2 about to end the turn; Nami sits at bf1 which P1 controls; two cheap units + a gear in P1's hand. */
function holding() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "nami")
    .hand(P1, RECRUIT, "r1")
    .hand(P1, RECRUIT, "r2")
    .hand(P1, TRINKET, "trinket");
}

/** From `holding()`: pass into P1's main phase with the hold trigger resolved and 3 energy available. */
async function intoMainAfterHold(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nami", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1);
  await game.p1.do("addResources", { energy: 3 });
}

describe("Nami, Headstrong (unl-052-219)", () => {
  test("registry payload: optional [calm] additional cost (static), play-self stun gated on paid cost, hold trigger installing a next-unit ready+buff", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, isChampion: true, might: 3, name: "Nami, Headstrong", tags: ["Nami"] });
    expect(def?.powerCost).toBeUndefined();
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(3);
    expect(abilities[0]).toMatchObject({ effect: { additionalCost: { power: ["calm"] }, optional: true, type: "additional-cost-option" }, type: "static" });
    expect(abilities[1]).toMatchObject({
      condition: { type: "paid-additional-cost" },
      effect: { target: { controller: "enemy", type: "unit" }, type: "stun" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(abilities[2]).toMatchObject({ effect: { buff: true, replaces: "enters-ready" }, trigger: { event: "hold", on: "self" }, type: "triggered" });
  });

  test("base cost: 3 energy, the calm is NOT spent when the option is declined; enters base exhausted at 3 might; 2 energy is not enough", async () => {
    const game = await inHand().build();
    expect(game.p1.option("play", "nami")?.fields.some((f) => f.arg === "payOptional")).toBe(true);
    await game.p1.play("nami", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("nami")).toBe("base");
    expect(game.state("nami")).toMatchObject({ isExhausted: true, might: 3 });
    expect((await inHand().resources(P1, { energy: 2, power: { calm: 3 } }).build()).p1.can("play", "nami")).toBe(false);
  });

  test("declined cost → no stun: no prompt appears and neither enemy unit is stunned even though both were available", async () => {
    const game = await inHand().build();
    await game.p1.play("nami", { to: "base" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.state("home").isStunned).toBe(false);
  });

  test("paid [calm]: 3 energy + 1 calm deducted, the play trigger resolves and the chosen enemy unit (either location is eligible, friendly is not) is stunned", async () => {
    const game = await inHand().build();
    await game.p1.play("nami", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).sort();
    expect(offered).toEqual(["foe", "home"]);
    await game.p1.pick("home");
    await game.settle();
    expect(game.state("home").isStunned).toBe(true);
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.state("ally").isStunned).toBe(false);
    expect(game.zoneOf("nami")).toBe("base");
  });

  test("no calm in the pool: the additional cost cannot be paid — forcing payOptional is rejected and a plain play spends energy only", async () => {
    const game = await inHand({ fury: 2 }).build();
    const forced = await game.p1.try((p) => p.play("nami", { payOptional: true, to: "base" }));
    if (forced.ok) {
      // Tolerate an engine that silently drops an unpayable option — but then nothing may have been charged or stunned.
      await game.settle();
      expect(game.decision()?.kind).toBe("action");
    } else {
      await game.p1.play("nami", { to: "base" });
      await game.settle();
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 2 } });
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.state("home").isStunned).toBe(false);
  });

  test("paid with NO enemy unit anywhere: still legal, calm is spent, Nami lands, and no prompt is left dangling", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", { might: 1 }, "ally").hand(P1, CARD, "nami").build();
    await game.p1.play("nami", { payOptional: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("nami")).toBe("base");
    expect(game.state("ally").isStunned).toBe(false);
  });

  test("same-turn value: pay, stun Foe (2) at bf1, then attack it with a ready 2-might Ally — Foe deals no damage back and dies; Ally conquers unhurt", async () => {
    const game = await inHand().build();
    await game.p1.play("nami", { payOptional: true, to: "base" });
    await game.settle();
    await game.p1.pick("foe");
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("ally").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("played from the Champion Zone the [calm] option is offered too (356.2 applies to any play, 355.10.a.1) — paying it stuns an enemy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
      .champion(P1, CARD, "nami")
      .build();
    const offered = game.p1.option("playChampion")?.fields.some((f) => f.arg === "payOptional") ?? false;
    if (offered) {
      await game.p1.choose("playFromChampionZone", { payOptional: true, to: "base" });
    } else {
      await game.p1.playChampion("base");
    }
    // The optional-cost decision may instead surface as a yes/no on this path; accept it if asked.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d?.seat === P1 && d.kind === "pick") {
        await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "home") ? "home" : d.options[0]!.key);
      } else {
        const r = await game.settle();
        if (r.reason === "open") {
          break;
        }
      }
    }
    expect(game.zoneOf("nami")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("home").isStunned).toBe(true);
  });

  test("When I hold: trigger on the chain in P1's Beginning Phase, hold point scored; the NEXT unit played this turn enters READY and BUFFED (2 → 3 might)", async () => {
    const game = await holding().build();
    await intoMainAfterHold(game);
    await game.p1.play("r1", { to: "base" });
    await game.settle();
    expect(game.zoneOf("r1")).toBe("base");
    expect(game.state("r1")).toMatchObject({ isBuffed: true, isReady: true, might: 3 });
    expect(game.state("nami")).toMatchObject({ isBuffed: false, might: 3 }); // Nami herself is untouched
    expect(game.violations()).toEqual([]);
  });

  test("one-shot: only the FIRST unit after the hold gets it — the second unit this turn enters exhausted and unbuffed", async () => {
    const game = await holding().build();
    await intoMainAfterHold(game);
    await game.p1.play("r1", { to: "base" });
    await game.settle();
    await game.p1.play("r2", { to: "base" });
    await game.settle();
    expect(game.state("r1")).toMatchObject({ isBuffed: true, isReady: true });
    expect(game.state("r2")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
  });

  test("'play a UNIT': a gear played first does not consume the payoff — the unit played after it is still ready + buffed", async () => {
    const game = await holding().build();
    await intoMainAfterHold(game);
    await game.p1.play("trinket");
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("base");
    await game.p1.play("r1", { to: "base" });
    await game.settle();
    expect(game.state("r1")).toMatchObject({ isBuffed: true, isReady: true, might: 3 });
  });

  test("the payoff also applies to a unit played straight to the held battlefield", async () => {
    const game = await holding().build();
    await intoMainAfterHold(game);
    await game.p1.play("r1", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("r1")).toBe("bf1");
    expect(game.state("r1")).toMatchObject({ isBuffed: true, isReady: true });
  });

  test("'this turn' lapses unused: play nothing, go around the table, and the unit played on P1's NEXT turn (after a second hold) … only that turn's fresh payoff applies once", async () => {
    // Turn N: hold → payoff armed, unused. Turn N+2: Nami holds AGAIN → a new payoff; r1 ready+buffed, r2 normal.
    // Guards against the stale turn-N payoff stacking into a second ready/buff.
    const game = await holding().build();
    await intoMainAfterHold(game);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again (second hold: 2 points)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    await game.p1.do("addResources", { energy: 3 });
    await game.p1.play("r1", { to: "base" });
    await game.settle();
    await game.p1.play("r2", { to: "base" });
    await game.settle();
    expect(game.state("r1")).toMatchObject({ isBuffed: true, isReady: true });
    expect(game.state("r2")).toMatchObject({ isBuffed: false, isExhausted: true });
  });

  test("only Nami's OWN hold: Nami in base while another unit holds bf1 → the point is scored but the next unit enters exhausted and unbuffed", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "base", CARD, "nami")
      .hand(P1, RECRUIT, "r1")
      .build();
    await game.p2.endTurn();
    expect(game.chain().some((i) => i.cardId === "nami")).toBe(false);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.play("r1", { to: "base" });
    await game.settle();
    expect(game.state("r1")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
  });

  test("nothing during the OPPONENT's Beginning Phase: Nami at P1's battlefield while P2's turn starts → no chain item, no point for anyone", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "nami").build();
    await game.p1.endTurn();
    expect(game.chain().some((i) => i.cardId === "nami")).toBe(false);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});
