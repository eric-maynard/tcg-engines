/**
 * Interaction: Undercover Agent (ogn-178-298) · Unit · Chaos · 5+[chaos] · 5 Might
 *     "[Deathknell] — Discard 2, then draw 2."
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   × The Ruination (unl-180-219) · Spell · Order · 9+[order]x3 · Action — "Kill all units."
 *
 * Question: P2 is the turn player and resolves The Ruination. P1 controls Undercover Agent and
 * Watchful Sentry; P1's hand is exactly one card H and P1's deck top is D1, D2, D3. Both units die
 * from the one kill instruction.
 *   (a) How many triggers, who orders them (P1, or turn player P2), is an ordering Decision surfaced
 *       to P1?
 *   (b) Does the LIFO order change P1's final hand?
 *       Order A: Agent appended first, then Sentry (Sentry on top).
 *       Order B: Sentry first, then Agent (Agent on top).
 *
 * Rules: 370.1.a.2 (one game action → simultaneous deaths), 808.1.d.2 (each Deathknell becomes a
 * Pending Item before the unit goes to trash), 808.2 (two separate triggers), 383.3.d (the player
 * who CONTROLS simultaneous triggers picks their order; 383.3.d.1 only sequences between different
 * players — P2 controls none here), 337.1.b (newest chain item resolves first), 359.3.e.11
 * ("Discard 2" with one card in hand: discard that one, still draw 2).
 *
 * Expected: two P1-controlled triggered items; the engine must surface an ordering decision to P1
 * (never to P2); no targets are involved.
 *   Order A (Sentry on top): Sentry → draw D1 (hand H, D1); Agent → discard H + D1, draw D2, D3
 *     → final hand {D2, D3} (2 cards), P1's trash gains H and D1.
 *   Order B (Agent on top): Agent → discard H only (359.3.e.11), draw D1, D2; Sentry → draw D3
 *     → final hand {D1, D2, D3} (3 cards), P1's trash gains only H.
 * So the order is outcome-relevant (3 cards vs 2).
 *
 * Engine note: no ordering prompt exists today; simultaneous triggers are appended in board order
 * (base before battlefields, then placement order). The canonical board below (Agent then Sentry,
 * both at bf1) therefore yields Order A by default; a placement-swapped board is used only to REACH
 * Order B so the LIFO arithmetic of (b) can still be checked.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNDERCOVER_AGENT = "ogn-178-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const THE_RUINATION = "unl-180-219";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla, stands in for H / D1 / D2 / D3

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn 2. P1: Agent + Sentry at bf1, hand = [H], deck top = D1, D2, D3 (then filler).
 * P2: The Ruination fully funded (9 energy + 3 order). `swap` places Sentry before Agent.
 */
function board(opts: { swap?: boolean } = {}) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 });
  if (opts.swap) {
    s.unit(P1, "bf1", WATCHFUL_SENTRY, "sentry").unit(P1, "bf1", UNDERCOVER_AGENT, "agent");
  } else {
    s.unit(P1, "bf1", UNDERCOVER_AGENT, "agent").unit(P1, "bf1", WATCHFUL_SENTRY, "sentry");
  }
  return s
    .hand(P1, FILLER, "H")
    .deck(P1, [FILLER, FILLER, FILLER], ["D1", "D2", "D3"])
    .hand(P2, THE_RUINATION, "ruin");
}

/** P2 casts The Ruination and both pass once so ONLY the spell resolves (triggers now pending/on the chain). */
async function resolveRuination(game: Game): Promise<void> {
  await game.p2.cast("ruin");
  await game.p2.passPriority();
  await game.p1.passPriority();
}

/** If P1 is being asked to order its two Deathknells, answer so that `top` resolves first. */
async function orderIfAsked(game: Game, top: "agent" | "sentry"): Promise<boolean> {
  const d = game.decision();
  if (!d || d.seat !== P1) {
    return false;
  }
  const bottom = top === "agent" ? "sentry" : "agent";
  if (d.kind === "order") {
    // Assumed semantics: keys in the order they are APPENDED to the chain (last = top, resolves first).
    const keyOf = (c: string) => d.items.find((i) => i.card === c || i.key === c)?.key ?? c;
    await game.p1.order([keyOf(bottom), keyOf(top)]);
    return true;
  }
  if (d.kind === "pick") {
    // Assumed semantics: pick the trigger to put on the chain FIRST (i.e. the one that resolves last).
    const keyOf = (c: string) => d.options.find((o) => o.card === c || o.key === c)?.key ?? c;
    await game.p1.pick(keyOf(bottom));
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick(keyOf(top));
    }
    return true;
  }
  return false;
}

describe("Undercover Agent × Watchful Sentry × The Ruination — who orders simultaneous Deathknells, and LIFO matters", () => {
  test("setup: P1's hand is exactly [H], deck top is D1, D2, D3; The Ruination costs P2 9 energy + 3 order", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toEqual(["H"]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["D1", "D2", "D3"]);
    expect(game.p2.can("cast", "ruin")).toBe(true);
    await game.p2.cast("ruin");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ruin"]);
  });

  test("(a) one kill instruction → both units die simultaneously into P1's trash; The Ruination to P2's trash (370.1.a.2)", async () => {
    const game = await board().build();
    await resolveRuination(game);
    expect(game.zoneOf("agent")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["agent", "sentry"]));
    expect(game.zoneOf("ruin")).toBe("trash");
    expect(game.p2.trash()).toContain("ruin");
  });

  test("(a) exactly TWO triggered items, both controlled by P1, are on the chain before either resolves — nothing drawn or discarded yet (808.1.d.2, 808.2)", async () => {
    const game = await board().build();
    await resolveRuination(game);
    await orderIfAsked(game, "sentry");
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "agent", controller: P1, triggered: true }),
        expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true }),
      ]),
    );
    expect(game.p1.hand()).toEqual(["H"]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["D1", "D2", "D3"]);
  });

  // Expected (383.3.d): both triggers are P1's, so P1 chooses their order → an order/pick decision for
  // P1 listing the Agent and Sentry triggers, raised right after The Ruination resolves.
  // Actual: no prompt — the engine appends them in board order and hands out chain priority.
  test("BUG: (a) an ORDER decision is surfaced to P1 (the triggers' controller) naming the two Deathknells (383.3.d)", async () => {
    const game = await board().build();
    await resolveRuination(game);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(["order", "pick"]).toContain(d?.kind as string);
    const named =
      d?.kind === "order" ? d.items.map((i) => i.card ?? i.key) : d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(named.sort()).toEqual(["agent", "sentry"]);
  });

  test("(a) the turn player P2 is NEVER the one asked to order P1's triggers (383.3.d.1 only sequences between players)", async () => {
    const game = await board().build();
    await resolveRuination(game);
    const d = game.decision();
    // Either P1's ordering prompt (correct) or straight to chain priority — but not a P2 order/pick.
    if (d && d.kind !== "action") {
      expect(d.seat).toBe(P1);
    }
    await game.settle({ policy: "first" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(a) no targets: resolving both Deathknells never raises a target pick — settle runs straight back to P2's open main phase", async () => {
    const game = await board().build();
    await resolveRuination(game);
    await orderIfAsked(game, "sentry");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
  });

  // ---- (b) Order A: Agent appended first, Sentry on top ------------------------------------------

  test("(b) Order A — Sentry's trigger is on TOP of the chain (resolves first, 337.1.b)", async () => {
    const game = await board().build();
    await resolveRuination(game);
    await orderIfAsked(game, "sentry");
    const chain = game.chain();
    expect(chain.at(-1)?.cardId).toBe("sentry");
    expect(chain[0]?.cardId).toBe("agent");
  });

  test("(b) Order A — step 1: Sentry resolves → P1 draws D1 (hand H, D1); Agent's trigger still waiting", async () => {
    const game = await board().build();
    await resolveRuination(game);
    await orderIfAsked(game, "sentry");
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (Sentry) resolves
    expect(game.p1.hand().sort()).toEqual(["D1", "H"]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["agent"]);
  });

  test("(b) Order A — final: Agent discards H AND D1, then draws D2, D3 → hand exactly {D2, D3} (2 cards); trash gains H and D1", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await resolveRuination(game);
    await orderIfAsked(game, "sentry");
    await game.settle({ policy: "first" }); // a 'choose which 2 to discard' prompt over exactly 2 cards is forced anyway
    expect(game.p1.hand().sort()).toEqual(["D2", "D3"]);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["H", "D1", "agent", "sentry"]));
    expect(game.p1.trash()).not.toContain("D2");
    expect(game.p1.deck()).toHaveLength(deck0 - 3);
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) Order B: Sentry appended first, Agent on top ------------------------------------------

  // Expected (383.3.d): on the SAME board P1 may instead elect Order B (Agent on top) → Agent discards
  // only H (359.3.e.11), draws D1, D2; Sentry draws D3 → hand {D1, D2, D3}, trash gains only H.
  // Actual: no ordering prompt; board order forces Sentry on top (Order A) → hand {D2, D3}.
  test("BUG: (b) Order B on the same board — P1 elects Agent on top → final hand exactly {D1, D2, D3} (3 cards); only H is discarded", async () => {
    const game = await board().build();
    await resolveRuination(game);
    await orderIfAsked(game, "agent");
    expect(game.chain().at(-1)?.cardId).toBe("agent");
    await game.settle({ policy: "first" });
    expect(game.p1.hand().sort()).toEqual(["D1", "D2", "D3"]);
    expect(game.p1.trash()).toContain("H");
    expect(game.p1.trash()).not.toContain("D1");
  });

  test("(b) Order B reached via placement (engine appends in board order) — Agent on top: step 1 discards ONLY H then draws D1, D2 (359.3.e.11); Sentry still waiting", async () => {
    const game = await board({ swap: true }).build();
    await resolveRuination(game);
    await orderIfAsked(game, "agent");
    expect(game.chain().at(-1)?.cardId).toBe("agent");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Agent resolves
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("H"); // a discard prompt over the single card H, if the engine asks
    }
    expect(game.p1.trash()).toContain("H");
    expect(game.p1.hand().sort()).toEqual(["D1", "D2"]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry"]);
  });

  test("(b) Order B reached via placement — final: hand exactly {D1, D2, D3} (3 cards); trash gains only H (not D1)", async () => {
    const game = await board({ swap: true }).build();
    const deck0 = game.p1.deck().length;
    await resolveRuination(game);
    await orderIfAsked(game, "agent");
    await game.settle({ policy: "first" });
    expect(game.p1.hand().sort()).toEqual(["D1", "D2", "D3"]);
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.trash()).toContain("H");
    expect(game.p1.trash()).not.toContain("D1");
    expect(game.p1.deck()).toHaveLength(deck0 - 3);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the order is outcome-relevant: Order A leaves P1 with 2 cards, Order B with 3", async () => {
    const a = await board().build();
    await resolveRuination(a);
    await orderIfAsked(a, "sentry");
    await a.settle({ policy: "first" });
    const b = await board({ swap: true }).build();
    await resolveRuination(b);
    await orderIfAsked(b, "agent");
    await b.settle({ policy: "first" });
    expect(a.p1.hand()).toHaveLength(2);
    expect(b.p1.hand()).toHaveLength(3);
  });
});
