/**
 * Interaction: Shard of Undoing (unl-174-219) · Gear · Order · 6
 *     "The first time a friendly unit dies during your Beginning Phase each turn, each opponent
 *      must kill one of their units."
 *   × Frozen Fortress (unl-212-219) · Battlefield
 *     "At the start of each player's Beginning Phase, deal 1 to each unit here. (This happens
 *      before scoring.)"
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 1 Might · "[Deathknell] — Draw 1."
 *
 * Question: P1 has Shard of Undoing in base and two Watchful Sentries at Frozen Fortress; P2 has
 * units in base. (a) Start of P1's Beginning Phase: both Sentries take 1 and die in one cleanup —
 * how many Shard triggers, how many units must P2 kill, who orders P1's items? (b) Same board at
 * the start of P2's Beginning Phase. (c) After (a), another P1 unit dies later in that same
 * Beginning Phase.
 *
 * Rules: 383.1.b ("Nth time" trigger met by simultaneous events → triggers ONCE), 383.3.d /
 * 383.3.d.1 (controller orders simultaneous triggers; turn player first), 383.3.e.1 (already
 * performed this turn → does not trigger again), 323.4 / 323.5 (one cleanup: note Deathknells,
 * then kill all lethally-damaged units together), 370.1.a.2 (same game action → simultaneous),
 * 808.1.d.2.
 *
 * Expected: (a) exactly ONE Shard trigger + two Sentry Deathknells pending for P1 (P1 orders
 * them); P1 draws 2; P2 must kill exactly ONE unit of P2's choice (a decision for P2); with bf1
 * emptied before the Scoring Step P1 does not score a hold. (b) Sentries still die and P1 draws
 * 2, but it is not P1's Beginning Phase → Shard does not trigger, P2 kills nothing. (c) A second
 * friendly death in the same Beginning Phase does not re-trigger Shard → P2 still loses only one.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHARD_OF_UNDOING = "unl-174-219";
const FROZEN_FORTRESS = "unl-212-219";
const WATCHFUL_SENTRY = "ogn-096-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1: Shard in base, two Sentries at Frozen Fortress (bf1, P1-controlled). P2: two vanilla units
 * in base (2 and 3 Might) as Shard fodder. `active` is whose turn is about to END.
 */
function board(opts: { endingTurnOf: string }) {
  return scenario()
    .turn(2)
    .active(opts.endingTurnOf)
    .battlefield("bf1", { controller: P1, def: FROZEN_FORTRESS, inert: false })
    .gear(P1, SHARD_OF_UNDOING, "shard")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentryA")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentryB")
    .unit(P2, "base", { might: 2, name: "P2 Alpha" }, "p2alpha")
    .unit(P2, "base", { might: 3, name: "P2 Bravo" }, "p2bravo");
}

/** Both players pass priority until the named item is no longer the top of the chain. */
async function resolveTop(game: Game, name: string): Promise<void> {
  for (let i = 0; i < 6 && game.chain().at(-1)?.name === name; i++) {
    await game.acting().passPriority();
  }
}

describe("Shard of Undoing × Frozen Fortress × two Watchful Sentries — one 'first time' trigger", () => {
  // ---- (a) P1's Beginning Phase --------------------------------------------------------------

  test("(a) at the start of P1's Beginning Phase Frozen Fortress's trigger goes on the chain; once it resolves both 1-Might Sentries die in the same cleanup (323.5, 370.1.a.2)", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((i) => i.name)).toEqual(["Frozen Fortress"]);
    expect(game.zoneOf("sentryA")).toBe("battlefield-bf1");
    await resolveTop(game, "Frozen Fortress");
    expect(game.zoneOf("sentryA")).toBe("trash");
    expect(game.zoneOf("sentryB")).toBe("trash");
  });

  test("(a) the simultaneous deaths put exactly ONE Shard of Undoing trigger and TWO Sentry Deathknells on the chain, all controlled by P1 (383.1.b, 808.1.d.2)", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await resolveTop(game, "Frozen Fortress");
    const names = game.chain().map((i) => i.name);
    expect(names.filter((n) => n === "Shard of Undoing")).toHaveLength(1);
    expect(names.filter((n) => n === "Watchful Sentry")).toHaveLength(2);
    expect(names).toHaveLength(3);
    expect(game.chain().every((i) => i.controller === P1 && i.triggered)).toBe(true);
  });

  // Expected (383.3.d): three simultaneous P1 triggers → P1 is asked to order them before they
  // are put on the chain. Actual: the engine auto-orders (Shard first-in, Deathknells on top) and
  // goes straight to chain priority without asking.
  test("BUG: (a) P1 is offered an order decision for its three simultaneous triggers (383.3.d)", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await resolveTop(game, "Frozen Fortress");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("order");
    expect(d?.kind === "order" ? d.items.length : 0).toBe(3);
  });

  test("(a) on resolution P2 — not P1 — must choose which ONE of P2's units to kill: a pick decision for P2 over {Alpha, Bravo}", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["p2alpha", "p2bravo"]);
    expect(d?.kind === "pick" ? d.max : 0).toBe(1);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false); // "must kill"
  });

  test("(a) P2 kills exactly ONE unit (its choice) — not two, even though two friendly units died (383.1.b)", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await game.settle();
    await game.p2.pick("p2bravo");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("p2bravo")).toBe("trash");
    expect(game.zoneOf("p2alpha")).toBe("base");
    expect(game.p2.units()).toEqual(["p2alpha"]);
    expect(game.chain()).toEqual([]);
  });

  test("(a) P1 draws 2 from the two Deathknells (+1 Draw Phase) — hand goes from 0 to 3 by P1's main phase", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    expect(game.p1.hand()).toHaveLength(0);
    const deck = game.p1.deck().length;
    await game.p2.endTurn();
    await game.settle();
    // Both Deathknells have resolved by the time Shard (first-in, bottom of chain) asks P2.
    expect(game.p1.hand()).toHaveLength(2);
    await game.p2.pick("p2alpha");
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.deck()).toHaveLength(deck - 3);
  });

  test("(a) secondary: bf1 is empty before the Scoring Step, so P1 does not score a hold there (Frozen Fortress 'happens before scoring')", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await game.settle();
    await game.p2.pick("p2alpha");
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);

    // Contrast: a 2-Might unit survives the ping, keeps bf1 and P1 DOES hold for 1.
    const held = await board({ endingTurnOf: P2 }).unit(P1, "bf1", { might: 2, name: "Tough" }, "tough").build();
    await held.p2.endTurn();
    await held.settle();
    await held.p2.pick("p2alpha");
    await held.settle();
    expect(held.locationOf("tough")).toBe("bf1");
    expect(held.state("tough").damage).toBe(1);
    expect(held.p1.points()).toBe(1);
  });

  test("(a) Shard of Undoing stays in P1's base; no invariant violations", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await game.settle();
    await game.p2.pick("p2alpha");
    await game.settle();
    expect(game.zoneOf("shard")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) P2's Beginning Phase --------------------------------------------------------------

  test("(b) at the start of P2's Beginning Phase the Sentries still die and P1 still draws 2 (its Deathknells resolve on P2's turn)", async () => {
    const game = await board({ endingTurnOf: P1 }).build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((i) => i.name)).toEqual(["Frozen Fortress"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sentryA")).toBe("trash");
    expect(game.zoneOf("sentryB")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2); // P1 is not the turn player: no Draw Phase card
  });

  test("(b) it is not P1's Beginning Phase → Shard of Undoing does NOT trigger: never on the chain, no prompt for P2, P2 keeps both units", async () => {
    const game = await board({ endingTurnOf: P1 }).build();
    await game.p1.endTurn();
    await resolveTop(game, "Frozen Fortress");
    expect(game.chain().map((i) => i.name)).toEqual(["Watchful Sentry", "Watchful Sentry"]);
    expect(game.chain().every((i) => i.controller === P1)).toBe(true);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("p2alpha")).toBe("base");
    expect(game.zoneOf("p2bravo")).toBe("base");
    expect(game.p2.units().sort()).toEqual(["p2alpha", "p2bravo"]);
  });

  // ---- (c) a later friendly death in the same Beginning Phase -------------------------------

  test("(c) a second friendly death later in the SAME Beginning Phase (a second Frozen Fortress resolving separately) does not re-trigger Shard — P2 loses exactly one unit in total (383.3.e.1)", async () => {
    // Two Frozen Fortress triggers resolve one at a time (two cleanups → two non-simultaneous
    // death events). Whichever resolves first fires Shard once; the other must not.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: FROZEN_FORTRESS, inert: false })
      .battlefield("bf2", { controller: P1, def: FROZEN_FORTRESS, inert: false })
      .gear(P1, SHARD_OF_UNDOING, "shard")
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentryA")
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentryB")
      .unit(P1, "bf2", { might: 1, name: "Straggler" }, "straggler")
      .unit(P2, "base", { might: 2, name: "P2 Alpha" }, "p2alpha")
      .unit(P2, "base", { might: 3, name: "P2 Bravo" }, "p2bravo")
      .unit(P2, "base", { might: 4, name: "P2 Charlie" }, "p2charlie")
      .build();
    await game.p2.endTurn();
    expect(game.chain().map((i) => i.name)).toEqual(["Frozen Fortress", "Frozen Fortress"]);
    let shardPrompts = 0;
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      expect(d?.seat).toBe(P2);
      expect(d?.kind).toBe("pick");
      shardPrompts++;
      await game.p2.pick("p2alpha");
    }
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sentryA")).toBe("trash");
    expect(game.zoneOf("sentryB")).toBe("trash");
    expect(game.zoneOf("straggler")).toBe("trash");
    expect(shardPrompts).toBe(1);
    expect(game.zoneOf("p2alpha")).toBe("trash");
    expect(game.p2.units().sort()).toEqual(["p2bravo", "p2charlie"]);
    expect(game.p1.hand()).toHaveLength(3); // 2 Deathknells + Draw Phase; the Straggler has none
    expect(game.violations()).toEqual([]);
  });
});
