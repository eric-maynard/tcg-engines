/**
 * Interaction: Viktor, Leader (ogn-246-298) — 4 Might champion unit
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into
 *      your base."
 *   × Wraith of Echoes (ogn-118-298) — 5 Might unit
 *     "The first time a friendly unit dies each turn, draw 1."
 *   × Watchful Sentry (ogn-096-298) ×2 — 1 Might, "[Deathknell] — Draw 1."
 *   killers: Flurry of Blades (ogn-133-298, "Deal 1 to all units at battlefields") and
 *            The Ruination (unl-180-219, "Kill all units.")
 *
 * Question: P1 controls Viktor and Wraith in base plus two Sentries at bf1.
 *   (a) P2 resolves Flurry of Blades, killing both Sentries simultaneously — how many triggers,
 *       how many Recruit tokens and cards, and who orders them?
 *   (b) Instead P2 resolves The Ruination, killing Viktor, Wraith and both Sentries in one action
 *       — what triggers?
 *
 * Rules:
 *   370.1.a.2  one damage/kill instruction → the deaths are simultaneous (one cleanup, 323.4/5).
 *   808.2      each Deathknell instance triggers separately → 2 Sentry items.
 *   Viktor     per-event condition: each non-Recruit friendly death is its own fulfilment → 2 items
 *              → 2 Recruit tokens.
 *   383.1.b    "the first time" met by several simultaneous events → controller picks ONE, the
 *              ability triggers ONCE → exactly 1 Wraith item (the CR's own Wraith example).
 *   383.3.d    all five items are P1's → P1 selects the order to put them on the chain (an order
 *              decision; outcome-neutral here).
 *   383.3.e.1  a later friendly death the same turn: Viktor triggers again, Wraith does not.
 *   383.2.c.2  (b) Viktor and Wraith leave the board in the same game action that meets their
 *              conditions → neither can evaluate its trigger (Viktor is the rule's own example);
 *              only the two Sentry Deathknells go on the chain → P1 draws 2, 0 Recruit tokens.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-246-298";
const WRAITH_OF_ECHOES = "ogn-118-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const FLURRY_OF_BLADES = "ogn-133-298";
const THE_RUINATION = "unl-180-219";

/** Inline 1-energy action spell: deal 3 to a unit (kills the 1-Might fodder later in the turn). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn. P1: Viktor + Wraith + a 1-Might vanilla "fodder" in base, two Sentries at bf1.
 * P2 holds Flurry of Blades (1 energy), The Ruination (9 + 3 order) and a Test Bolt, all funded.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", VIKTOR, "vik")
    .unit(P1, "base", WRAITH_OF_ECHOES, "wraith")
    .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "s1")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "s2")
    .resources(P2, { energy: 12, power: { order: 3 } })
    .hand(P2, FLURRY_OF_BLADES, "flurry")
    .hand(P2, THE_RUINATION, "ruin")
    .hand(P2, BOLT, "bolt");
}

function recruitTokens(game: Game): string[] {
  return game.p1.base().filter((id) => game.state(id).name === "Recruit" && game.state(id).isToken);
}

/** Cast `alias` as P2 and pass priority once around so the spell itself resolves (triggers now pending / on the chain). */
async function resolveSpell(game: Game, alias: string) {
  await game.p2.cast(alias);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf(alias)).toBe("trash");
}

describe("Viktor, Leader × Wraith of Echoes × two Watchful Sentries — simultaneous deaths, trigger count", () => {
  // ---- (a) Flurry of Blades: both Sentries die, Viktor and Wraith survive ---------------------

  test("(a) Flurry of Blades deals 1 to all units at battlefields: both 1-Might Sentries die together; Viktor, Wraith and the fodder in base are untouched", async () => {
    const game = await board().build();
    await resolveSpell(game, "flurry");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.zoneOf("vik")).toBe("base");
    expect(game.zoneOf("wraith")).toBe("base");
    expect(game.state("vik").damage).toBe(0);
    expect(game.state("wraith").damage).toBe(0);
    expect(game.state("fodder").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(a) exactly FIVE pending items, all P1's: 2 Sentry Deathknells (808.2) + 2 Viktor triggers (one per death) + 1 Wraith trigger (383.1.b — once, not twice)", async () => {
    const game = await board().build();
    await resolveSpell(game, "flurry");
    // If the engine asks P1 to order them first (383.3.d), take the offered order.
    const d = game.decision();
    if (d && d.seat === P1 && (d.kind === "order" || d.kind === "pick")) {
      await game.settle({ maxSteps: 1, policy: "first" });
    }
    const items = game.chain().filter((i) => i.triggered);
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.controller === P1)).toBe(true);
    const byCard = items.map((i) => i.cardId).sort();
    expect(byCard).toEqual(["s1", "s2", "vik", "vik", "wraith"]);
    expect(items.filter((i) => i.cardId === "wraith")).toHaveLength(1);
  });

  // Expected: five simultaneous triggers with one controller → rule 383.3.d has P1 select the
  // order they are placed on the chain, i.e. an order/pick decision for P1 right after Flurry
  // resolves (a "which death" pick for Wraith per 383.1.b would also be acceptable). Actual: the
  // engine places all five in a fixed scan order and goes straight to priority — no P1 decision.
  test("BUG: P1 should be given an ordering decision for its five simultaneous triggers (383.3.d)", async () => {
    const game = await board().build();
    await resolveSpell(game, "flurry");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(["order", "pick"]).toContain(d?.kind as string);
  });

  test("(a) final state regardless of order: P1 draws exactly 3 (2 Deathknells + 1 Wraith) and has exactly 2 Recruit tokens in base", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await resolveSpell(game, "flurry");
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toHaveLength(hand0 + 3);
    expect(game.p1.deck()).toHaveLength(deck0 - 3);
    const toks = recruitTokens(game);
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ controller: P1, isToken: true, might: 1, zone: "base" });
    }
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P2); // back to P2's open main phase
  });

  test("(a) a further friendly non-Recruit death later the same turn: Viktor makes a third Recruit, Wraith draws nothing more (383.3.e.1)", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await resolveSpell(game, "flurry");
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toHaveLength(hand0 + 3);
    expect(recruitTokens(game)).toHaveLength(2);
    await game.p2.cast("bolt", { targets: "fodder" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(recruitTokens(game)).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(hand0 + 3); // no Wraith draw, fodder has no Deathknell
  });

  // ---- (b) The Ruination: everything dies in one action ----------------------------------------

  test("(b) The Ruination (9 + 3 order) kills Viktor, Wraith, fodder and both Sentries in one action — all five in P1's trash (370.1.a.2)", async () => {
    const game = await board().build();
    await game.p2.cast("ruin");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { order: 0 } });
    await game.settle({ policy: "first" });
    expect([...game.p1.trash()].sort()).toEqual(["fodder", "s1", "s2", "vik", "wraith"]);
    expect(game.p1.units()).toEqual([]);
  });

  test("(b) only the two Sentry Deathknells go on the chain — Viktor and Wraith left the board in the same action and cannot evaluate their triggers (383.2.c.2)", async () => {
    const game = await board().build();
    await resolveSpell(game, "ruin");
    const d = game.decision();
    if (d && d.seat === P1 && (d.kind === "order" || d.kind === "pick")) {
      await game.settle({ maxSteps: 1, policy: "first" });
    }
    const items = game.chain().filter((i) => i.triggered);
    expect(items.map((i) => i.cardId).sort()).toEqual(["s1", "s2"]);
    expect(items.every((i) => i.controller === P1)).toBe(true);
  });

  test("(b) final state: P1 draws exactly 2 and gets 0 Recruit tokens", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await resolveSpell(game, "ruin");
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(recruitTokens(game)).toEqual([]);
    expect(game.p1.base()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
