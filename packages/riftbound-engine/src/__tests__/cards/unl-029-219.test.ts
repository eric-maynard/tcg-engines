/**
 * Red Brambleback — unl-029-219 · Unit · Fury · 4 energy + [fury] · 4 Might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   Your conquer effects for conquering here trigger an additional time.
 *   When I conquer, [Buff] a friendly unit. (Give it a +1 [Might] buff if it doesn't have one.)
 *
 * Rules: 805 (Accelerate: optional additional [1][C], C must match the unit's domain → enters ready),
 * 383.4.c (conquer effects = "When I conquer…" of units PRESENT at the conquer, 383.4.c.2.a, and
 * "When you conquer (here)…" of anything referencing the conquering player, 383.4.c.2.b), 471.2.a
 * (they trigger at the battlefield that was conquered), 702.2.a/702.3 (Buff = choose a unit, place a
 * +1 buff counter; a unit can carry only one), 823.1.b (Hunt is a conquer effect too).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Its own "When I conquer" IS one of "your conquer effects for conquering here" → it triggers
 *     twice: two separate Buff choices (two different friendly units anywhere, base included). With
 *     Brambleback as your only unit the second Buff fizzles on 702.3 (still exactly 5 Might).
 *  2. "here" is where Brambleback IS when the conquer happens: arriving with the conquering group
 *     counts; parked at bf1 while you conquer bf2 does not; sitting in base never does; and if it
 *     DIES in the combat that wins the battlefield it is no longer here → no doubling.
 *  3. "Your … conquer effects": Hunt (Voracious Gromp → 6 XP), a champion's "When I conquer, draw 1"
 *     (Kai'Sa → 2 cards) and the battlefield's own "When you conquer here" (Minefield → mill 4) all
 *     double; HOLD effects at the same battlefield do not (Gromp holds for 3), and an OPPONENT
 *     conquering the battlefield Brambleback defended gets nothing extra.
 *  4. Accelerate needs [fury] specifically on top of the printed [fury]: 5 energy + 2 fury total; a
 *     ready Brambleback can march out and conquer the turn it is played (full play → move → score line).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-029-219";
const KAISA = "ogn-039-298"; // Fury champion 4: [Accelerate] / When I conquer, draw 1.
const GROMP = "unl-100-219"; // Body 5: [Hunt 3]
const MINEFIELD = "sfd-212-221"; // Battlefield: When you conquer here, put the top 2 cards of your Main Deck into your trash.

describe("Red Brambleback (unl-029-219)", () => {
  test("cost: 4 energy + 1 fury, enters the base EXHAUSTED without Accelerate; short of energy or of fury → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "rb").build();
    expect(game.p1.option("play", "rb")?.fields.some((f) => f.arg === "payOptional")).toBe(false); // no 2nd fury → no Accelerate variant
    await game.p1.play("rb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("rb")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4, zone: "base" });
    expect(game.state("rb").keywords).toContain("Accelerate");
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "x").build()).p1.can("play", "x")).toBe(false);
    expect((await scenario().resources(P1, { energy: 9, power: { mind: 2 } }).hand(P1, CARD, "x").build()).p1.can("play", "x")).toBe(false);
  });

  test("Accelerate (805): paying an extra [1][fury] — 5 energy + 2 fury in all — it enters READY; energy alone (9 + 1 fury) never offers the option", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 2 } }).hand(P1, CARD, "rb").build();
    await game.p1.play("rb", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    await game.settle();
    expect(game.state("rb")).toMatchObject({ isReady: true, zone: "base" });
    const rich = await scenario().resources(P1, { energy: 9, power: { fury: 1 } }).hand(P1, CARD, "rb").build();
    expect(rich.p1.option("play", "rb")?.fields.some((f) => f.arg === "payOptional")).toBe(false);
    expect((await rich.p1.try((p) => p.play("rb", { accelerate: true }))).ok).toBe(false);
    expect(rich.zoneOf("rb")).toBe("hand");
  });

  test("full line: Accelerate in, march onto an open battlefield the same turn, conquer → its OWN conquer effect triggers twice: two Buff choices on two different friendly units (base units are legal, enemies are not)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 1, name: "Foe" }, "foe")
      .hand(P1, CARD, "rb")
      .build();
    await game.p1.play("rb", { accelerate: true });
    await game.settle();
    await game.p1.move("rb", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const first = game.decision();
    expect(first).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "rb" } });
    expect(first?.kind === "pick" ? first.options.map((o) => o.card).sort() : []).toEqual(["home", "rb"]);
    await game.p1.pick("home");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "rb" } }); // the additional trigger
    await game.p1.pick("rb");
    await game.settle();
    expect(game.state("home")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("rb")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.state("foe").isBuffed).toBe(false);
    expect(game.decision()?.kind).toBe("action"); // exactly two, not three
    expect(game.violations()).toEqual([]);
  });

  test("702.3 — Brambleback as your ONLY unit: both Buff instructions land on it but a unit holds one buff → exactly 5 Might", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "rb").build();
    await game.p1.move("rb", "bf1");
    await game.settle(); // single legal target each time → auto-picked
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("rb")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.points()).toBe(1);
  });

  test("doubles OTHER conquer effects of yours here: Kai'Sa ('When I conquer, draw 1') conquering alongside Brambleback draws 2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .unit(P1, "base", CARD, "rb")
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    game.script(P1, ["kaisa", "rb"]); // Brambleback's two Buffs
    const hand0 = game.p1.hand().length;
    await game.p1.move(["rb", "kaisa"], "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.state("kaisa").isBuffed).toBe(true);
    expect(game.state("rb").isBuffed).toBe(true);
  });

  test("doubles Hunt (823.1.b: a conquer effect): Voracious Gromp conquering here gains 6 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "rb").unit(P1, "base", GROMP, "gromp").build();
    game.script(P1, ["gromp", "rb"]);
    await game.p1.move(["rb", "gromp"], "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(6);
  });

  test("doubles the battlefield's own 'When you conquer here' (383.4.c.2.b): Minefield mills 4 of your cards instead of 2 — even though the battlefield card is the opponent's", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null, def: MINEFIELD, inert: false, owner: P2 })
      .unit(P1, "base", CARD, "rb")
      .build();
    const deck0 = game.p1.deck().length;
    await game.p1.move("rb", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toHaveLength(4);
    expect(game.p1.deck()).toHaveLength(deck0 - 4);
    expect(game.p2.trash()).toHaveLength(0);
  });

  test("negative space — 'here' only: Brambleback parked at bf1 while Kai'Sa conquers bf2 → she draws exactly 1; Minefield as bf2 mills exactly 2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null, def: MINEFIELD, inert: false, owner: P1 })
      .unit(P1, "bf1", CARD, "rb")
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.trash()).toHaveLength(2);
    expect(game.state("rb").isBuffed).toBe(false); // it did not conquer anything itself
  });

  test("negative space — Brambleback in BASE doubles nothing: Gromp conquers alone for 3 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "rb").unit(P1, "base", GROMP, "gromp").build();
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.decision()?.kind).toBe("action");
  });

  test("negative space — Brambleback that DIES in the winning combat is not 'here' at the conquer: Kai'Sa takes bf1 and draws exactly 1, no Buff prompt", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P1, "base", CARD, "rb")
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    // Warden's 4 goes onto Brambleback (P2 assigns its own units' damage, 465.2.c).
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { rb: 4 }, kind: "distribute" } : undefined)]);
    const hand0 = game.p1.hand().length;
    await game.p1.move(["rb", "kaisa"], "bf1");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash"); // 4 + 4 ≥ 4
    expect(game.zoneOf("rb")).toBe("trash");
    expect(game.locationOf("kaisa")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.state("kaisa").isBuffed).toBe(false);
    expect(game.decision()?.kind).toBe("action");
  });

  test("negative space — HOLD effects are not conquer effects: Gromp holding at Brambleback's battlefield gains 3 XP, and Brambleback's own trigger stays silent on a hold", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", GROMP, "gromp").unit(P1, "bf1", CARD, "rb").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("gromp").isBuffed).toBe(false);
    expect(game.state("rb").isBuffed).toBe(false);
  });

  test("negative space — 'YOUR conquer effects': the opponent's Kai'Sa conquering the battlefield Brambleback defended draws exactly 1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rb")
      .unit(P2, "base", { might: 4, name: "Escort" }, "escort")
      .unit(P2, "base", KAISA, "ekaisa")
      .build();
    // Brambleback's 4 goes onto the Escort so Kai'Sa lives to conquer.
    game.script(P1, [(d) => (d.kind === "distribute" ? { allocation: { escort: 4 }, kind: "distribute" } : undefined)]);
    const hand0 = game.p2.hand().length;
    await game.p2.move(["escort", "ekaisa"], "bf1");
    await game.settle();
    expect(game.zoneOf("rb")).toBe("trash"); // 8 ≥ 4
    expect(game.locationOf("ekaisa")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p2.hand()).toHaveLength(hand0 + 1);
  });

  test("registry payload matches the printed text: Accelerate [1][fury] · static conquer-doubler scoped to 'here' · self-conquer trigger that Buffs ONE friendly unit (not restricted to here); 4 + [fury], 4 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 4, might: 4, name: "Red Brambleback" });
    expect(def?.powerCost).toEqual(["fury"]);
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toEqual({ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({ effect: { event: "conquer", location: "here", type: "trigger-double" }, type: "static" });
    expect(def?.abilities?.[2]).toMatchObject({
      effect: { target: { controller: "friendly", type: "unit" }, type: "buff" },
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
    const target = (def?.abilities?.[2] as { effect: { target: Record<string, unknown> } }).effect.target;
    expect(target.location).toBeUndefined();
    expect(target.quantity ?? 1).not.toBe("all");
  });
});
