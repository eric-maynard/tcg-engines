/**
 * Interaction: Keeper of the Hammer (unl-203-219) · Legend (Poppy) · Body/Order
 *     "When you hold, gain 1 XP.  Spend 3 XP, [Exhaust]: Draw 1."
 *   × Grove of the God-Willow (ogn-280-298) · Battlefield
 *     "When you hold here, draw 1."
 *   × Sumpworks Map (unl-085-219) · Gear · Mind · [Reaction] [Temporary]
 *     "When an opponent scores, draw 1."
 *
 * Question (1v1, Victory Score 8). P1's legend is Keeper of the Hammer and P1 controls BOTH
 * battlefields as its turn starts: bf1 = Grove of the God-Willow with one P1 unit, bf2 = a blank
 * battlefield with one EXHAUSTED P1 unit. P2 has Sumpworks Map in base. Nothing triggers at the
 * start of the Beginning Phase.
 *   (a) P1 on 3: how many score events happen in the Scoring Step, for which battlefields / deltas?
 *   (b) Which triggered abilities result (how many instances each), who orders what, what resolves
 *       first, and the net cards / XP / points per player?
 *   (c) P1 on 6 instead: does P1 win, and when relative to those triggers?
 *   (d) Does the [Temporary] Map die during P1's Beginning Phase?
 *
 * Rules: 315.2.b.2 (the Turn Player Holds ALL battlefields they control), 469.2 + 470 (a Hold is a
 * Score, once per battlefield per turn → two battlefields = two score events), 471.1 / 471.1.a.1
 * (the Final-Point restriction is Conquer-only — Hold points count all the way to 8), 471.2 /
 * 471.2.b + 383.4.d.2.b (hold abilities trigger per battlefield held: Grove ×1, "When you hold" ×2,
 * "When an opponent scores" ×2), 383.3.d / 383.3.d.1 (simultaneous triggers: the Turn Player orders
 * theirs first, then the next player stacks theirs on top → LIFO: P2's two Map draws resolve before
 * any of P1's three), 323.1 (8 ≥ Victory Score and more than P2 → P1 wins at the very next Cleanup,
 * before any trigger resolves), 816.1.b / 816.1.c (Temporary kills the Map at the start of ITS
 * CONTROLLER's — P2's — Beginning Phase, so it survives and triggers on P1's turn).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KEEPER = "unl-203-219";
const GROVE = "ogn-280-298";
const MAP = "unl-085-219";

/**
 * P2 is about to end turn 2. P1 (Keeper of the Hammer, `points` points) controls bf1 (a live Grove
 * of the God-Willow, one ready P1 unit) and bf2 (inert blank battlefield, one EXHAUSTED P1 unit).
 * P2's Sumpworks Map sits in P2's base. Decks are auto-filled so every draw succeeds.
 */
function board(points: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, points)
    .points(P2, 0)
    .legend(P1, KEEPER, "keeper")
    .battlefield("bf1", { controller: P1, def: GROVE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Grove Holder" }, "groveHolder")
    .unit(P1, "bf2", { might: 3, name: "Tired Holder" }, "tiredHolder", { exhausted: true })
    .gear(P2, MAP, "map");
}

/** P2 ends its turn → P1's Beginning Phase has scored and raised its triggers; nothing resolved yet. */
async function intoBeginning(points: number): Promise<{ game: Game; p1Hand0: number; p2Hand0: number }> {
  const game = await board(points).build();
  const p1Hand0 = game.p1.hand().length;
  const p2Hand0 = game.p2.hand().length;
  expect(game.state("tiredHolder").isExhausted).toBe(true);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  return { game, p1Hand0, p2Hand0 };
}

const orderDecision = (game: Game) => {
  const d = game.decision();
  return d?.kind === "order" ? (d as Extract<Decision, { kind: "order" }>) : undefined;
};

describe("Keeper of the Hammer + Grove of the God-Willow held together, opponent's Sumpworks Map watching", () => {
  // ── (a) the Scoring Step ────────────────────────────────────────────────────────────────

  test("(a) P1 on 3 holds BOTH battlefields it controls: two separate score events {bf1,+1} and {bf2,+1} → 3 → 5, already booked in the Beginning Phase before any trigger resolves (315.2.b.2, 469.2, 470)", async () => {
    const { game } = await intoBeginning(3);
    expect(game.phase()).toBe("beginning");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1", "bf2"]);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    expect(game.p1.points()).toBe(5);
    expect(game.p2.points()).toBe(0);
    // Both are Holds, not Conquers.
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("(a) the bf2 unit being exhausted is irrelevant to holding — bf2 scores all the same (469.2: Hold = maintaining control)", async () => {
    const { game } = await intoBeginning(3);
    expect(game.gameState.scoredThisTurn[P1]).toContain("bf2");
    // (It was exhausted going in; P1's own Awaken step has readied it by now — the hold did not need that.)
    expect(game.locationOf("tiredHolder")).toBe("bf2");
  });

  // ── (b) the triggers ────────────────────────────────────────────────────────────────────

  test("(b) trigger instances: Grove ×1 (bf1 only), Keeper of the Hammer ×2 (once per Hold), Sumpworks Map ×2 (an opponent scored twice) — five triggered items pending, none resolved (471.2.b, 383.4.d.2.b)", async () => {
    const { game, p1Hand0, p2Hand0 } = await intoBeginning(3);
    const items = game.chain();
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.triggered)).toBe(true);
    const count = (cardId: string) => items.filter((i) => i.cardId === cardId).length;
    expect(count("bf1")).toBe(1);
    expect(count("keeper")).toBe(2);
    expect(count("map")).toBe(2);
    expect(items.filter((i) => i.cardId === "map").every((i) => i.controller === P2)).toBe(true);
    expect(items.filter((i) => i.cardId !== "map").every((i) => i.controller === P1)).toBe(true);
    // Nothing has resolved yet.
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand0);
    expect(game.p2.hand()).toHaveLength(p2Hand0);
  });

  test("(b) 383.3.d.1: the TURN PLAYER (P1) is the first one asked to order its simultaneous triggers — an `order` Decision owned by P1 over P1-controlled items only", async () => {
    const { game } = await intoBeginning(3);
    const d = orderDecision(game);
    expect(d).toBeDefined();
    expect(d?.seat).toBe(P1);
    const cards = (d?.items ?? []).map((i) => i.card);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c === "keeper" || c === "bf1")).toBe(true); // never P2's Map
  });

  // Expected: both Holds come from ONE task (315.2.b.2), so all five triggers are simultaneous:
  // P1's order offer spans its THREE items {Grove, Hammer, Hammer}; P2's two Map triggers are then
  // stacked on top (383.3.d.1). Actual: the engine scores bf1 and bf2 as two sequential batches —
  // P1 is only offered {Hammer, Grove} from the bf1 batch, and the chain interleaves
  // [Hammer, Grove, Map, Hammer, Map] so a Hammer trigger sits above the first Map trigger.
  test("P1's order Decision should cover all three of its hold triggers, with P2's two Map triggers ending up on top of all of them (315.2.b.2 one task → 383.3.d.1)", async () => {
    const { game } = await intoBeginning(3);
    const d = orderDecision(game);
    expect(d?.seat).toBe(P1);
    expect((d?.items ?? []).map((i) => i.card).sort()).toEqual(["bf1", "keeper", "keeper"]);
    await game.acceptTriggerOrder();
    // If P2 is offered its own (Map, Map) order it is interchangeable — accept it as listed.
    if (orderDecision(game)?.seat === P2) {
      await game.acceptTriggerOrder();
    }
    const controllers = game.chain().map((i) => i.controller); // bottom … top
    expect(controllers).toEqual([P1, P1, P1, P2, P2]);
  });

  test("(b) LIFO: the very first item to resolve is one of P2's Sumpworks Map draws (P2 +1 card while P1 still has 0 XP and no Grove card)", async () => {
    const { game, p1Hand0, p2Hand0 } = await intoBeginning(3);
    await game.acceptTriggerOrder();
    if (orderDecision(game)?.seat === P2) {
      await game.acceptTriggerOrder();
    }
    expect(game.chain().at(-1)).toMatchObject({ cardId: "map", controller: P2 });
    // One full round of passes resolves exactly the top item.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toHaveLength(4);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand0);
  });

  // Expected (383.3.d.1 LIFO): P2's two Map items are both above P1's three, so the first TWO
  // resolutions are both P2 draws and P1 has gained nothing yet. Actual: the second item down is a
  // Keeper of the Hammer trigger (interleaved batches), so after two resolutions P1 already has 1 XP
  // and P2 has drawn only once.
  test("both Sumpworks Map draws resolve before ANY of P1's hold triggers (P2 +2 cards, P1 still 0 XP after two resolutions)", async () => {
    const { game, p2Hand0 } = await intoBeginning(3);
    await game.acceptTriggerOrder();
    if (orderDecision(game)?.seat === P2) {
      await game.acceptTriggerOrder();
    }
    for (let i = 0; i < 2; i++) {
      await game.acting().passPriority();
      await game.acting().passPriority();
    }
    expect(game.chain()).toHaveLength(3);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.p1.xp()).toBe(0);
    expect(game.chain().every((i) => i.controller === P1)).toBe(true);
  });

  test("(b) net once everything resolves and P1 reaches its Main Phase: P1 +2 points (5), +2 XP, +1 card from the Grove (+1 more from the Draw Phase); P2 +2 cards, 0 points, 0 XP; the Map is still in play", async () => {
    const { game, p1Hand0, p2Hand0 } = await intoBeginning(3);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(5);
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.hand()).toHaveLength(p1Hand0 + 1 + 1); // Grove draw + rule 315.4.b draw
    expect(game.p2.points()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.zoneOf("map")).toBe("base");
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) P1 on 6 ─────────────────────────────────────────────────────────────────────────

  test("(c) P1 on 6: first hold → 7, second hold → 8 = Victory Score. Hold points ignore the Final-Point restriction (471.1.a.1), so P1 WINS — at the next Cleanup check (323.1), i.e. before a single hold/Map trigger has resolved", async () => {
    const { game, p1Hand0, p2Hand0 } = await intoBeginning(6);
    expect(game.p1.points()).toBe(8); // not 7 + a card: that substitution is Conquer-only (471.1.b)
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    // The game ended inside P1's Beginning Phase with every trigger still unresolved.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand0);
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    expect(game.decision()).toBeNull(); // nobody is asked to order / respond to anything any more
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand0);
  });

  test("(c) contrast — on 3 the same two holds end nothing: 5 < 8, play continues into P1's Main Phase", async () => {
    const { game } = await intoBeginning(3);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (d) Temporary ───────────────────────────────────────────────────────────────────────

  test("(d) [Temporary] is keyed to ITS CONTROLLER's Beginning Phase (816.1.b/c): P2's Map survives all of P1's turn (and triggered twice during it) …", async () => {
    const { game, p2Hand0 } = await intoBeginning(3);
    expect(game.zoneOf("map")).toBe("base"); // alive during P1's Beginning Phase, with two of its triggers pending
    expect(game.chain().filter((i) => i.cardId === "map")).toHaveLength(2);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("map")).toBe("base");
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
  });

  test("(d) … and is killed only at the start of P2's own next Beginning Phase", async () => {
    const { game } = await intoBeginning(3);
    await game.settle(); // P1's main phase
    expect(game.zoneOf("map")).toBe("base");
    await game.advanceTurn(); // P1 ends → P2's turn begins: Temporary kills the Map before scoring
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("map")).toBe("trash");
  });
});
