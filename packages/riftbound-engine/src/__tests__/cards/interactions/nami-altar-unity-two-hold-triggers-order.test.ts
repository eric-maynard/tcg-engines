/**
 * Interaction: Nami, Headstrong (unl-052-219) · Champion Unit · Calm · 3 · 3 Might
 *     "…When I hold, the next time you play a unit this turn, ready it and [Buff] it."
 *   × Altar to Unity (ogn-275-298) · Battlefield
 *     "When you hold here, play a 1 [Might] Recruit unit token in your base."
 *   (+ an inline 1-cost vanilla unit "Tide Caller" in P1's hand for the Main Phase.)
 *
 * Rules: 315.2.b.2 / 469.2 / 470 (one Hold per controlled battlefield in the Scoring Step → one score event, +1),
 * 471.2 / 471.2.b (Hold effects "here" trigger off that event), 383.4.d.2.a (a unit's "When I hold" triggers when
 * the battlefield it is at is held), 383.4.d.2.b (a battlefield's "When you hold here" is controlled by the
 * holder, 190.6), 383.3.d (simultaneous triggers with ONE controller → that player orders them on the chain),
 * 390.2 (Nami's payoff is a delayed trigger keyed to "the next time you play a unit this turn"), 350.2 (playing a
 * token IS playing a unit), 340.1 (LIFO).
 *
 * Question: P1's turn is about to begin; P1 controls Altar to Unity with a lone Nami on it and holds a cheap
 * vanilla unit. One battlefield scores, but TWO hold triggers (battlefield + unit, same controller) arise.
 *   (a) Is an order Decision surfaced, to whom, listing exactly which items?
 *   (b) Branch X — Nami's trigger resolves FIRST, then the Altar's: what does the Recruit look like, and does the
 *       hand unit played later get anything?
 *   (c) Branch Y — Altar first, then Nami: same questions.
 *   (d) Only one score event / one point regardless of branch?
 *
 * Expected:
 *   (d) exactly one Hold → P1 +1, scoredThisTurn = [altar]; both the Altar's and Nami's triggers fire off it.
 *   (a) an `order` Decision for P1 listing exactly {Nami trigger, Altar to Unity trigger}; P2 decides nothing.
 *   (b) X: Nami arms "next unit you play this turn: ready + Buff"; the Altar then PLAYS a Recruit token → that is
 *       the next unit → Recruit ends READY, BUFFED, 2 Might; the effect is spent, so Tide Caller later enters
 *       exhausted, unbuffed, 2 Might.
 *   (c) Y: Recruit is played before Nami's rider exists → exhausted, unbuffed, 1 Might; Nami then arms the rider;
 *       Tide Caller played from hand in Main Phase is "the next unit" → READY, BUFFED, 3 Might.
 *   One point either way.
 */
import { describe, expect, test } from "bun:test";
import type { OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NAMI = "unl-052-219";
const ALTAR_TO_UNITY = "ogn-275-298";
const TIDE_CALLER = { cardType: "unit", domain: "calm", energyCost: 1, might: 2, name: "Tide Caller" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2, P2 active and about to end the turn. P1 owns + controls a LIVE Altar to Unity with only Nami standing on
 * it; a second inert, empty battlefield; P2 has a bystander in base; P1 holds the 1-cost vanilla Tide Caller.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("altar", { controller: P1, def: ALTAR_TO_UNITY, inert: false, owner: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "altar", NAMI, "nami")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "grunt")
    .hand(P1, TIDE_CALLER, "caller");
}

const recruits = (game: Game) => game.p1.units().filter((u) => game.state(u).isToken && game.state(u).name === "Recruit");

/** P2 ends the turn → P1's Beginning Phase; the Hold has scored and both triggers are pending an order. */
async function atOrderOffer(): Promise<{ game: Game; order: OrderDecision; namiKey: string; altarKey: string }> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  const d = game.decision();
  expect(d?.kind).toBe("order");
  const order = d as OrderDecision;
  const namiKey = order.items.find((i) => i.card === "nami")?.key;
  const altarKey = order.items.find((i) => i.card === "altar")?.key;
  expect(namiKey).toBeDefined();
  expect(altarKey).toBeDefined();
  return { altarKey: altarKey!, game, namiKey: namiKey!, order };
}

/** Pass priority for both seats until the chain is empty (each item: P1 then P2 pass → resolves). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 20 && game.chain().length > 0; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
  expect(game.chain()).toEqual([]);
}

/** In P1's Main Phase: float 1 energy and play Tide Caller to base, settle. */
async function playCaller(game: Game): Promise<void> {
  expect(game.phase()).toBe("main");
  await game.p1.do("addResources", { energy: 1 });
  await game.p1.play("caller", { to: "base" });
  await game.settle();
  expect(game.zoneOf("caller")).toBe("base");
}

describe("Nami, Headstrong × Altar to Unity — one Hold, two same-controller hold triggers, P1 orders them", () => {
  // ── (d) one score event ────────────────────────────────────────────────────────────────

  test("(d) exactly ONE Hold: P1 scores 1 point and `scoredThisTurn` lists the Altar once — already true while the two triggers are still waiting to be ordered", async () => {
    const { game } = await atOrderOffer();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["altar"]);
    expect(game.gameState.battlefields.altar?.controller).toBe(P1);
  });

  // ── (a) the order Decision ─────────────────────────────────────────────────────────────

  test("(a) both hold abilities trigger off that single Hold and share a controller → P1 is offered an ORDER decision listing exactly {Nami trigger, Altar to Unity trigger} (383.3.d); both items are P1-controlled triggered abilities", async () => {
    const { game, order } = await atOrderOffer();
    expect(order.seat).toBe(P1);
    expect(order.items).toHaveLength(2);
    expect(order.items.map((i) => i.card).sort()).toEqual(["altar", "nami"]);
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered]).sort()).toEqual(
      [
        ["altar", P1, true],
        ["nami", P1, true],
      ].sort(),
    );
  });

  test("(a) P2 gets no decision of its own here — P2's view of the pending decision is P1's order offer, and P2 has no action menu until P1 has ordered and passed", async () => {
    const { game } = await atOrderOffer();
    expect(game.p2.decision()).toBeNull();
    expect(game.p2.legal()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("(a) after ordering, P1 (controller of the top item) holds priority first and P2 gets a window before anything resolves — no Recruit exists yet, Nami unbuffed", async () => {
    const { game, namiKey, altarKey } = await atOrderOffer();
    await game.p1.order([altarKey, namiKey]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(2);
    expect(recruits(game)).toEqual([]);
    expect(game.state("nami")).toMatchObject({ isBuffed: false, might: 3 });
  });

  // ── (b) Branch X: Nami resolves first ──────────────────────────────────────────────────

  test("(b) Branch X — P1 orders [Altar bottom, Nami top]: the chain reads oldest→newest [altar, nami], so Nami's trigger resolves FIRST (LIFO)", async () => {
    const { game, namiKey, altarKey } = await atOrderOffer();
    await game.p1.order([altarKey, namiKey]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["altar", "nami"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Nami's item resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["altar"]);
    expect(recruits(game)).toEqual([]); // the Altar has not resolved yet
  });

  test("(b) Branch X — the Altar then PLAYS the Recruit token; playing a token is playing a unit (350.2) → Nami's armed rider fires on it: the Recruit ends READY and BUFFED at 2 Might (1 + buff)", async () => {
    const { game, namiKey, altarKey } = await atOrderOffer();
    await game.p1.order([altarKey, namiKey]);
    await drainChain(game);
    await game.settle();
    expect(game.phase()).toBe("main");
    const toks = recruits(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ baseMight: 1, controller: P1, isBuffed: true, isReady: true, isToken: true, location: "base", might: 2 });
  });

  test("(b) Branch X — Nami's effect was consumed by the Recruit: Tide Caller played from hand in the Main Phase enters EXHAUSTED, unbuffed, 2 Might", async () => {
    const { game, namiKey, altarKey } = await atOrderOffer();
    await game.p1.order([altarKey, namiKey]);
    await drainChain(game);
    await game.settle();
    await playCaller(game);
    expect(game.state("caller")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
    // and the Recruit kept what it got
    const [tok] = recruits(game);
    expect(game.state(tok!)).toMatchObject({ isBuffed: true, isReady: true, might: 2 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Branch Y: Altar resolves first ─────────────────────────────────────────────────

  test("(c) Branch Y — P1 orders [Nami bottom, Altar top] (also the listed default): the Altar resolves FIRST → the Recruit is played before Nami's rider exists → it enters EXHAUSTED, unbuffed, 1 Might, in base", async () => {
    const { game, namiKey, altarKey } = await atOrderOffer();
    await game.p1.order([namiKey, altarKey]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["nami", "altar"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Altar's item resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["nami"]);
    const toks = recruits(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ baseMight: 1, controller: P1, isBuffed: false, isExhausted: true, isToken: true, location: "base", might: 1 });
  });

  test("(c) Branch Y — Nami then resolves and arms the rider; the Recruit is NOT retroactively touched (still exhausted, 1 Might) when P1's Main Phase opens", async () => {
    const { game, namiKey, altarKey } = await atOrderOffer();
    await game.p1.order([namiKey, altarKey]);
    await drainChain(game);
    await game.settle();
    expect(game.phase()).toBe("main");
    const [tok] = recruits(game);
    expect(game.state(tok!)).toMatchObject({ isBuffed: false, isExhausted: true, might: 1 });
    expect(game.state("nami")).toMatchObject({ isBuffed: false, might: 3 }); // Nami herself never benefits
  });

  test("(c) Branch Y — Tide Caller played from hand later this turn IS 'the next unit': it ends READY and BUFFED at 3 Might (2 + buff); the Recruit stays a plain exhausted 1-Might token", async () => {
    const { game, namiKey, altarKey } = await atOrderOffer();
    await game.p1.order([namiKey, altarKey]);
    await drainChain(game);
    await game.settle();
    await playCaller(game);
    expect(game.state("caller")).toMatchObject({ isBuffed: true, isReady: true, might: 3 });
    const [tok] = recruits(game);
    expect(game.state(tok!)).toMatchObject({ isBuffed: false, isExhausted: true, might: 1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) accepting the LISTED order without re-ordering (settle) is Branch Y: exhausted 1-Might Recruit now, ready buffed 3-Might Tide Caller later", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle(); // accepts the soft order offer, passes everything
    expect(game.phase()).toBe("main");
    const [tok] = recruits(game);
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ isBuffed: false, isExhausted: true, might: 1 });
    await playCaller(game);
    expect(game.state("caller")).toMatchObject({ isBuffed: true, isReady: true, might: 3 });
  });

  // ── (d) again: the branch never changes the score ─────────────────────────────────────

  test("(d) the order Decision is outcome-determinative for the units but NOT for scoring: both branches end P1's Beginning Phase at exactly 1 point with one Recruit and one scored battlefield", async () => {
    for (const branch of ["X", "Y"] as const) {
      const { game, namiKey, altarKey } = await atOrderOffer();
      await game.p1.order(branch === "X" ? [altarKey, namiKey] : [namiKey, altarKey]);
      await drainChain(game);
      await game.settle();
      expect(game.p1.points()).toBe(1);
      expect(game.p2.points()).toBe(0);
      expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["altar"]);
      expect(recruits(game)).toHaveLength(1);
      expect(game.p1.units().sort()).toHaveLength(2); // Nami + the Recruit
    }
  });
});
