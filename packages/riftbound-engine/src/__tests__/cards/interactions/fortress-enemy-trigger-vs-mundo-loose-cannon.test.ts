/**
 * Interaction: Frozen Fortress (unl-212-219) · Battlefield
 *     "At the start of each player's Beginning Phase, deal 1 to each unit here. (This happens before scoring.)"
 *   × Dr. Mundo, Expert (ogn-109-298) · Champion Unit · Mind · 6 Might
 *     "My Might is increased by the number of cards in your trash. At the start of your Beginning
 *      Phase, recycle 3 from your trash."
 *   × Loose Cannon (ogn-251-298) · Legend (Jinx)
 *     "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand."
 *
 * Board: bf2 = Frozen Fortress controlled by P2 with a 3-Might P2 unit there. P1: legend Loose Cannon,
 * 4 cards in hand, controls bf1 with Dr. Mundo, 5 cards in trash. P2 ends the turn → P1's turn begins.
 *
 * Rules: 315.2.a.1 (start-of-Beginning-Phase effects), 190.6.a (a controlled battlefield's abilities are
 * controlled by its controller — P2 — even on P1's turn), 383.2.a.1 (Loose Cannon's "if" is part of the
 * EFFECT, so it always triggers), 383.3.d / 383.3.d.1 (each player orders their own simultaneous
 * triggers, Turn Player first), 315.2.b.2 / 469.2 (Scoring Step: Turn Player holds what they control).
 *
 * Expected: (a) three chain items — Mundo (P1), Loose Cannon (P1), Frozen Fortress (P2); (b) Loose Cannon
 * IS on the chain and draws nothing; (c) P1 gets an order decision over its two, P2's single item lands
 * on top and resolves first (1 to P2's own unit, survives); (d) Mundo recycles 3 (Might 11 → 8), hand
 * 4 → 5 only from the Draw Phase, P1 holds bf1 for 1, bf2 unscored; (e) on P2's turn only Frozen
 * Fortress triggers and P2 holds bf2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FROZEN_FORTRESS = "unl-212-219";
const MUNDO_EXPERT = "ogn-109-298";
const LOOSE_CANNON = "ogn-251-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit, used as hand/trash filler

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** `endingTurnOf` is whose turn is about to END. `handSize` cards in P1's hand, 5 in P1's trash. */
function board(opts: { endingTurnOf: string; handSize?: number }) {
  let s = scenario()
    .turn(2)
    .active(opts.endingTurnOf)
    .legend(P1, LOOSE_CANNON, "looseCannon")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2, def: FROZEN_FORTRESS, inert: false })
    .unit(P1, "bf1", MUNDO_EXPERT, "mundo")
    .unit(P2, "bf2", { might: 3, name: "P2 Brute" }, "brute");
  for (let i = 0; i < (opts.handSize ?? 4); i++) {
    s = s.hand(P1, SKULKER, `h${i + 1}`);
  }
  for (let i = 0; i < 5; i++) {
    s = s.trash(P1, SKULKER, `t${i + 1}`);
  }
  return s;
}

const chainView = (game: Game) => game.chain().map((i) => `${i.name}/${i.controller}`);

/** Drive P1's Beginning Phase to the open main phase: order (Mundo bottom, Loose Cannon top), pass, recycle t1..t3. */
async function runP1Beginning(game: Game, order: readonly string[] = ["mundo", "looseCannon"]): Promise<void> {
  const d = game.decision();
  if (d?.kind === "order") {
    const keyOf = (card: string) => d.items.find((i) => i.card === card)?.key as string;
    await game.p1.order(order.map(keyOf));
  }
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
    await game.p1.pick("t1", "t2", "t3");
    await game.settle();
  }
}

describe("Frozen Fortress (enemy-controlled) × Dr. Mundo, Expert × Loose Cannon — start of P1's Beginning Phase", () => {
  test("setup sanity: Mundo is 6 + 5 trash = 11 Might, P1 has 4 in hand", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    expect(game.state("mundo").might).toBe(11);
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p1.trash()).toHaveLength(5);
  });

  test("(a) all three trigger at the start of P1's Beginning Phase; Frozen Fortress's item is controlled by P2 (190.6.a) even though it is P1's turn", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    const items = game.chain();
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.triggered)).toBe(true);
    expect(items.find((i) => i.name === "Dr. Mundo, Expert")?.controller).toBe(P1);
    expect(items.find((i) => i.name === "Loose Cannon")?.controller).toBe(P1);
    expect(items.find((i) => i.name === "Frozen Fortress")).toMatchObject({ cardId: "bf2", controller: P2 });
  });

  test("(b) Loose Cannon goes on the chain with 4 cards in hand — its 'if one or fewer' is part of the effect, not the condition (383.2.a.1)", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    expect(game.chain().some((i) => i.name === "Loose Cannon" && i.cardId === "looseCannon")).toBe(true);
  });

  test("(b) …and on resolution with 4 in hand it draws nothing: when Mundo (ordered below it) asks for its recycle pick, P1 still has exactly 4", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d?.kind).toBe("order");
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("mundo"), keyOf("looseCannon")]); // Mundo bottom, Loose Cannon top
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "mundo" } });
    expect(game.chain().some((i) => i.name === "Loose Cannon")).toBe(false); // already resolved
    expect(game.p1.hand()).toHaveLength(4);
  });

  test("(b) contrast: with ONE card in hand Loose Cannon does draw 1 on resolution (hand 1 → 2 before the Draw Phase, 3 after)", async () => {
    const game = await board({ endingTurnOf: P2, handSize: 1 }).build();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d?.kind).toBe("order");
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("mundo"), keyOf("looseCannon")]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", source: { cardId: "mundo" } });
    expect(game.p1.hand()).toHaveLength(2);
    await game.p1.pick("t1", "t2", "t3");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("(c) 383.3.d.1: the Turn Player (P1) gets an ORDER decision over exactly its own two triggers; Frozen Fortress is not in it and P2 is never asked to order", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const cards = d?.kind === "order" ? d.items.map((i) => i.card).sort() : [];
    expect(cards).toEqual(["looseCannon", "mundo"]);
    // P2's lone trigger needs no ordering: after P1 orders, the next decision is chain priority, not a P2 order.
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("mundo"), keyOf("looseCannon")]);
    const next = game.decision();
    expect(next?.kind).toBe("action");
    expect(next?.kind === "action" ? next.context : undefined).toBe("chain");
  });

  test("(c) placement: P1's two go on first in P1's chosen order, then P2's Frozen Fortress on TOP — chain bottom→top = [Mundo, Loose Cannon, Frozen Fortress]", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    const d = game.decision();
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("mundo"), keyOf("looseCannon")]);
    expect(chainView(game)).toEqual([`Dr. Mundo, Expert/${P1}`, `Loose Cannon/${P1}`, `Frozen Fortress/${P2}`]);

    // The other order P1 may choose: Loose Cannon bottom, Mundo above it — Fortress still on top.
    const alt = await board({ endingTurnOf: P2 }).build();
    await alt.p2.endTurn();
    const d2 = alt.decision();
    const keyOf2 = (card: string) => (d2?.kind === "order" ? d2.items.find((i) => i.card === card)?.key : undefined) as string;
    await alt.p1.order([keyOf2("looseCannon"), keyOf2("mundo")]);
    expect(chainView(alt)).toEqual([`Loose Cannon/${P1}`, `Dr. Mundo, Expert/${P1}`, `Frozen Fortress/${P2}`]);
  });

  test("(c) LIFO: Frozen Fortress resolves FIRST — P2's own 3-Might unit at bf2 takes 1 and survives while both P1 items are still on the chain; Mundo at bf1 is untouched", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    for (let i = 0; i < 4 && game.chain().some((c) => c.name === "Frozen Fortress"); i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((i) => i.name).sort()).toEqual(["Dr. Mundo, Expert", "Loose Cannon"]);
    expect(game.state("brute").damage).toBe(1);
    expect(game.locationOf("brute")).toBe("bf2");
    expect(game.state("mundo").damage).toBe(0); // "each unit HERE" = bf2 only
    expect(game.p1.trash()).toHaveLength(5); // Mundo not yet resolved
  });

  test("(d) Mundo's resolution: P1 picks 3 of the 5 trash cards to recycle → trash 2, those 3 on the bottom of the deck, Mundo 11 → 8", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    const deck = game.p1.deck().length;
    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 3, seat: P1, source: { cardId: "mundo" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    await game.p1.pick("t1", "t2", "t3");
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["t4", "t5"]);
    expect([...game.p1.deck().slice(-3)].sort()).toEqual(["t1", "t2", "t3"]);
    expect(game.p1.deck()).toHaveLength(deck + 3 - 1); // +3 recycled, −1 Draw Phase
    expect(game.state("mundo").might).toBe(8);
  });

  test("(d) net result at P1's open main phase: hand 4 → 5 (Draw Phase only), Brute at 1 damage, chain empty, no violations", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await runP1Beginning(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.state("brute").damage).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) Scoring Step: P1 holds bf1 → exactly one score event {bf1} and 1 point; P2's bf2 is not scored by anyone on P1's turn (315.2.b.2, 469.2)", async () => {
    const game = await board({ endingTurnOf: P2 }).build();
    await game.p2.endTurn();
    await runP1Beginning(game);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn).toEqual({ [P1]: ["bf1"], [P2]: [] });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("(e) contrast — start of P2's Beginning Phase: ONLY Frozen Fortress triggers (controlled by P2); Mundo and Loose Cannon ('your Beginning Phase') stay silent", async () => {
    const game = await board({ endingTurnOf: P1 }).build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(chainView(game)).toEqual([`Frozen Fortress/${P2}`]);
    expect(game.decision()?.kind).not.toBe("order"); // a single trigger: nothing to order
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("brute").damage).toBe(1); // hit its own unit again
    expect(game.locationOf("brute")).toBe("bf2");
    expect(game.p1.trash()).toHaveLength(5); // Mundo did not recycle
    expect(game.state("mundo").might).toBe(11);
    expect(game.p1.hand()).toHaveLength(4); // Loose Cannon did not draw; not P1's Draw Phase
    expect(game.p2.points()).toBe(1); // P2 holds bf2 on P2's turn
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn).toEqual({ [P1]: [], [P2]: ["bf2"] });
    expect(game.violations()).toEqual([]);
  });
});
