/**
 * Corina Veraza — sfd-179-221 · Unit · Order · 7 energy + [order] · 6 Might
 *
 *   [Accelerate] (You may pay [1][order] as an additional cost to have me enter ready.)
 *   When I move to a battlefield, play three 1 [Might] Recruit unit tokens here.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - Accelerate (805): optional ADDITIONAL cost [1] + an ORDER pip (805.1.a.1 — an off-domain power
 *    cannot pay it, a universal/rainbow power can); paid → enters ready (a replacement, 805.6),
 *    unpaid → exhausted like any played unit (143.4). With exactly 7 energy the option is simply
 *    not available.
 *  - The trigger is a MOVE trigger with a battlefield destination (447/449): base→bf and bf→bf
 *    (Ganking) fire it, a move back to base does not, and being PLAYED to a battlefield is not a
 *    move at all (446.2). A move performed by a spell (Ride the Wind) still counts. Only "I" —
 *    other units moving never trigger it.
 *  - "here" = the battlefield she moved to; the Recruits are PLAYED there (enter exhausted, 143.4;
 *    tokens are controlled by the ability's controller, 182). Moving into an enemy-held
 *    battlefield: the trigger resolves before combat damage, the Recruits gain the attacker
 *    designation (323.2.a) and add 3 Might to her side — 6+3 beats an 8-Might defender that
 *    Corina alone would lose to, and a surviving Recruit conquers.
 *  - The natural line: Accelerate → move the same turn → instant 9 Might of board.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-179-221";
const RIDE_THE_WIND = "ogn-173-298"; // [Action] 2 + [chaos]: Move a friendly unit and ready it.

const recruitsAt = (game: Game, loc: string) =>
  game.p1.units(loc).filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");

function inHand(energy = 8, power: Record<string, number> = { order: 2 }) {
  return scenario().resources(P1, { energy, power }).hand(P1, CARD, "cv");
}

describe("Corina Veraza (sfd-179-221)", () => {
  test("cost & body: without Accelerate she costs exactly 7 energy + [order] and enters the base EXHAUSTED as a 6-Might unit; 6 energy or no order power is not enough", async () => {
    const game = await inHand().build();
    await game.p1.play("cv", { accelerate: false });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.zoneOf("cv")).toBe("base");
    expect(game.state("cv")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.state("cv").keywords).toContain("Accelerate");
    expect(game.chain()).toHaveLength(0); // playing is not moving — no token trigger
    expect((await inHand(6, { order: 2 }).build()).p1.can("play", "cv")).toBe(false);
    expect((await inHand(8, {}).build()).p1.can("play", "cv")).toBe(false);
  });

  test("Accelerate paid: an extra [1][order] on top (8 energy + 2 order total) and she enters READY (805.2.b / 805.6)", async () => {
    const game = await inHand().build();
    await game.p1.play("cv", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("cv").isReady).toBe(true);
    expect(recruitsAt(game, "base")).toHaveLength(0);
  });

  test("Accelerate affordability: with only 7 energy + 1 order the accelerated play is not offered (and asking for it is rejected); an off-domain (fury) power cannot pay the order pip (805.1.a.1)", async () => {
    const exact = await inHand(7, { order: 1 }).build();
    expect(exact.p1.can("play", "cv")).toBe(true);
    expect(exact.p1.option("playUnit", "cv")?.variants.some((v) => v.params.paidAdditionalCost === true)).toBe(false);
    const declined = await exact.p1.try((p) => p.play("cv", { accelerate: true }));
    expect(declined.ok).toBe(false);
    expect(exact.zoneOf("cv")).toBe("hand");

    const fury = await inHand(8, { fury: 1, order: 1 }).build();
    expect(fury.p1.option("playUnit", "cv")?.variants.some((v) => v.params.paidAdditionalCost === true)).toBe(false);
    await fury.p1.play("cv");
    expect(fury.state("cv").isExhausted).toBe(true);
    expect(fury.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  });

  test("a universal (rainbow) power may pay Accelerate's [order] pip (135.2.e / 805.1.a.1)", async () => {
    const rainbow = await inHand(8, { order: 1, rainbow: 1 }).build();
    expect(rainbow.p1.option("playUnit", "cv")?.variants.some((v) => v.params.paidAdditionalCost === true)).toBe(true);
    await rainbow.p1.play("cv", { accelerate: true });
    expect(rainbow.state("cv").isReady).toBe(true);
    expect(rainbow.p1.energy()).toBe(0);
    expect(rainbow.p1.power()).toBe(0);
  });

  test("moving to an open battlefield puts her trigger on the chain; it resolves into THREE 1-Might Recruit unit tokens at that battlefield (exhausted, P1's), none in base — and she conquers it", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "cv").build();
    await game.p1.move("cv", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cv", controller: P1, triggered: true })]);
    await game.settle();
    const recruits = recruitsAt(game, "bf1");
    expect(recruits).toHaveLength(3);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, owner: P1 });
    }
    expect(recruitsAt(game, "base")).toHaveLength(0);
    expect(game.locationOf("cv")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("being PLAYED straight to a battlefield you control is not a move (446.2): no trigger, no Recruits", async () => {
    const game = await inHand().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1 }, "holder").build();
    await game.p1.play("cv", { to: "bf1" });
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.locationOf("cv")).toBe("bf1");
    expect(recruitsAt(game, "bf1")).toHaveLength(0);
  });

  test("moving from a battlefield back to base is not 'to a battlefield': nothing triggers", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "cv").unit(P1, "bf1", { might: 1 }, "holder").build();
    await game.p1.move("cv", "base");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("cv")).toBe("base");
    expect(recruitsAt(game, "base")).toHaveLength(0);
    expect(recruitsAt(game, "bf1")).toHaveLength(0);
  });

  test("only 'I': another friendly unit moving to a battlefield while Corina stays home makes no Recruits", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "cv").unit(P1, "base", { might: 2 }, "pal").build();
    await game.p1.move("pal", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(recruitsAt(game, "bf1")).toHaveLength(0);
  });

  test("Accelerate → move the same turn into an 8-Might defender: the Recruits arrive before combat damage and attack with her (6+3 ≥ 8) — the defender dies, and with P2 assigning its 8 damage to Corina + two Recruits the last Recruit conquers", async () => {
    const game = await inHand()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 8, name: "Warden" }, "warden")
      .build();
    await game.p1.play("cv", { accelerate: true });
    expect(game.state("cv").isReady).toBe(true);
    await game.p1.move("cv", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cv", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves inside the combat showdown, before any damage
    const recruits = recruitsAt(game, "bf2");
    expect(recruits).toHaveLength(3);
    expect(game.state("warden").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle({ maxSteps: 30 }); // both pass focus → combat damage
    // 465.2.c: if the defender is asked how to line up its 8 damage, it kills Corina and two Recruits
    // (the same as the greedy default): 6 → Corina, 1 → Recruit, 1 → Recruit.
    if (game.decision()?.kind === "distribute") {
      expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 8 });
      await game.p2.distribute({ cv: 6, [recruits[0]!]: 1, [recruits[1]!]: 1 });
      await game.settle({ maxSteps: 30 });
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // combat finished — no re-prompt
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.zoneOf("cv")).toBe("trash");
    expect(game.has(recruits[0]!)).toBe(false); // dead tokens cease to exist
    expect(game.has(recruits[1]!)).toBe(false);
    expect(game.locationOf(recruits[2]!)).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("control: WITHOUT the Recruits a lone 6-Might Corina loses to the same 8-Might defender (proves the tokens fought)", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 8, name: "Warden" }, "warden")
      .unit(P1, "base", { might: 6, name: "Plain Six" }, "six")
      .build();
    await game.p1.move("six", "bf2");
    await game.settle();
    expect(game.zoneOf("six")).toBe("trash");
    expect(game.locationOf("warden")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("Ganking from one battlefield to another is a move TO a battlefield: three more Recruits appear at the destination, the earlier ones stay behind", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "cv", { grantedKeywords: [{ duration: "permanent", keyword: "Ganking" }] })
      .unit(P1, "bf1", { might: 1, name: "Recruit" }, "token-recruit-old")
      .build();
    expect(game.p1.can("gank", "cv")).toBe(true);
    await game.p1.gank("cv", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cv", triggered: true })]);
    await game.settle();
    expect(game.locationOf("cv")).toBe("bf2");
    expect(recruitsAt(game, "bf2")).toHaveLength(3);
    expect(recruitsAt(game, "bf1")).toEqual(["token-recruit-old"]);
  });

  test("no once-per-turn limit + spell moves count (449): a standard move to bf1 makes three Recruits, then Ride the Wind moves her on to bf2 for three MORE (and readies her)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "cv")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.move("cv", "bf1");
    await game.settle();
    if (game.decision()?.kind === "action" && game.p1.decision()?.kind === "action" && !game.p1.can("cast", "rtw")) {
      await game.settle(); // let an auto-begun showdown at bf1 play out
    }
    expect(recruitsAt(game, "bf1")).toHaveLength(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("cv").isExhausted).toBe(true);
    // Ride the Wind is a spell-driven move: bf1 → bf2 needs no Ganking, and it still "moves to a battlefield".
    await game.p1.cast("rtw", { targets: "cv" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("cv")).toBe("bf2");
    expect(game.state("cv").isReady).toBe(true);
    expect(recruitsAt(game, "bf2")).toHaveLength(3);
    expect(recruitsAt(game, "bf1")).toHaveLength(3); // the first batch stays where it was played
    expect(recruitsAt(game, "base")).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("registry payload matches the printed text: Accelerate costing {1, [order]} and a self move-to-battlefield trigger creating 3 × 1-Might Recruit unit tokens 'here'", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 7, might: 6, powerCost: ["order"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities).toContainEqual(expect.objectContaining({ cost: { energy: 1, power: ["order"] }, keyword: "Accelerate", type: "keyword" }));
    expect(abilities).toContainEqual(
      expect.objectContaining({
        effect: { amount: 3, location: "here", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" },
        trigger: { event: "move-to-battlefield", on: "self" },
        type: "triggered",
      }),
    );
  });
});
