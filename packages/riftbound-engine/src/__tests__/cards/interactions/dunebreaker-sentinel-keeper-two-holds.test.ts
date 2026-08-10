/**
 * Interaction: Dunebreaker (sfd-027-221) · Unit · Fury · 7 · 7 Might
 *     "If you have two or fewer cards in your hand, I enter ready. When I hold, draw 2."
 *   × Blue Sentinel (unl-087-219) · Unit · Mind · 4 · 4 Might · [Shield 2]
 *     "Your hold effects for holding here trigger an additional time.
 *      When I hold, [Add] [rainbow] at the start of your next Main Phase."
 *   × Keeper of the Hammer (unl-203-219) · Legend (Poppy) · Body/Order
 *     "When you hold, gain 1 XP.  Spend 3 XP, [Exhaust]: Draw 1."
 *
 * Question (1v1, Victory 8, P1 on 2, legend Keeper of the Hammer). As P1's turn begins P1 controls BOTH
 * battlefields: A with a lone Dunebreaker, B with a lone Blue Sentinel. P2 controls nothing relevant.
 *   (a) How many score events in the Scoring Step, which tuples? Does the Sentinel's doubler add a POINT at B?
 *   (b) Trigger instances: Dunebreaker's draw (doubled by the Sentinel at the OTHER battlefield? fires for B's
 *       hold at all?), Sentinel's Add, Keeper's XP (per hold? doubled at B?) — and who orders what?
 *   (c) Net once the chain is empty and P1 reaches Main Phase: cards drawn, XP, rainbow added.
 *   (d) Contrast: Dunebreaker AND Blue Sentinel both at B, a vanilla unit alone at A — recount.
 *
 * Rules: 315.2.b.2 (Turn Player Holds every battlefield it controls — one task), 469.2/470 (each battlefield
 * is a separate Score → two score events), 471.1 (exactly +1 per Hold; the Sentinel doubles hold EFFECTS,
 * never the Score), 471.2/471.2.b + 383.4.d.2.a (a unit's "When I hold" triggers only for the hold of the
 * battlefield where it stands), 383.4.d.2.b ("When you hold" on a legend fires once per Hold), Blue Sentinel's
 * "for holding HERE" scopes the doubling to B, 383.3.d/383.3.d.1 (all items are P1's → P1 alone is offered
 * the order; P2 is never asked), 429.2 (a triggered [Add] resolves as soon as it is finalized — it does not
 * linger on the chain), 316.x (the Add is delayed to the start of THIS turn's Main Phase), 315.4.b (Draw Phase).
 *
 * Expected: (a) (P1,A,hold,+1) and (P1,B,hold,+1): 2 → 4; scoredThisTurn[P1]=[A,B], conqueredThisTurn[P1]=[].
 * (b) Dunebreaker ×1 (A only, not doubled), Sentinel Add ×2 (B, doubled — resolve immediately), Keeper ×3
 * (A ×1 + B ×2). Lingering chain = 4 P1 items {dune, keeper, keeper, keeper}; P1 gets the one order offer over
 * all of them; P2 never sees an order decision. (c) +2 cards from Dunebreaker (+1 Draw Phase), XP 3, +2 rainbow
 * at Main, points 4. (d) A (vanilla): Keeper ×1. B: Dunebreaker ×2 (draw 4), Sentinel Add ×2, Keeper ×2 →
 * still 2 points, 4(+1) cards, 3 XP, 2 rainbow — only Dunebreaker's count changed.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DUNEBREAKER = "sfd-027-221";
const BLUE_SENTINEL = "unl-087-219";
const KEEPER_OF_THE_HAMMER = "unl-203-219";

/**
 * P2 is about to end turn 2. P1 (Keeper of the Hammer, 2 points, Victory 8) controls inert battlefields A and B.
 *   layout "split": Dunebreaker alone at A, Blue Sentinel alone at B.
 *   layout "stacked": a vanilla 3-Might unit alone at A, Dunebreaker + Blue Sentinel together at B.
 */
function board(layout: "split" | "stacked" = "split") {
  const s = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 2)
    .points(P2, 0)
    .legend(P1, KEEPER_OF_THE_HAMMER, "keeper")
    .battlefield("A", { controller: P1 })
    .battlefield("B", { controller: P1 })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
  return layout === "split"
    ? s.unit(P1, "A", DUNEBREAKER, "dune").unit(P1, "B", BLUE_SENTINEL, "sentinel")
    : s.unit(P1, "A", { might: 3, name: "Vanilla" }, "vanilla").unit(P1, "B", DUNEBREAKER, "dune").unit(P1, "B", BLUE_SENTINEL, "sentinel");
}

/** P2 ends its turn → P1's Beginning Phase has scored and raised its hold triggers; nothing resolved yet. */
async function intoBeginning(layout: "split" | "stacked" = "split"): Promise<{ game: Game; p1Hand0: number }> {
  const game = await board(layout).build();
  const p1Hand0 = game.p1.hand().length;
  expect(game.p1.points()).toBe(2);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  return { game, p1Hand0 };
}

const orderDecision = (game: Game) => {
  const d = game.decision();
  return d?.kind === "order" ? (d as Extract<Decision, { kind: "order" }>) : undefined;
};

/**
 * Drain the Beginning Phase by hand: accept any order offer as listed, pass every priority, and record every
 * (kind, seat) decision seen until P1's open Main Phase.
 */
async function drainRecording(game: Game): Promise<{ kind: string; seat: string }[]> {
  const seen: { kind: string; seat: string }[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push({ kind: d.kind, seat: d.seat });
    if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return seen;
}

describe("(a) the Scoring Step — two Holds, exactly one point each", () => {
  test("two score events (P1,A,hold,+1) and (P1,B,hold,+1): 2 → 4, booked before any trigger resolves; both are Holds, not Conquers (315.2.b.2, 469.2, 470)", async () => {
    const { game } = await intoBeginning();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]);
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
  });

  test("Blue Sentinel doubles hold EFFECTS, never the Score: B is still worth exactly +1 — P1 ends on 4, not 5 (470/471.1)", async () => {
    const { game } = await intoBeginning();
    await game.settle();
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });
});

describe("(b) trigger instances and ordering — split layout (Dunebreaker@A, Sentinel@B)", () => {
  test("lingering chain = Dunebreaker ×1 + Keeper of the Hammer ×3 (A ×1, B ×2 doubled), all P1's; the Sentinel's two [Add]s resolved on finalization and do not linger (429.2)", async () => {
    const { game, p1Hand0 } = await intoBeginning();
    const items = game.chain();
    expect(items.every((i) => i.triggered && i.controller === P1)).toBe(true);
    const count = (cardId: string) => items.filter((i) => i.cardId === cardId).length;
    expect(count("dune")).toBe(1); // A's hold only — not doubled by the Sentinel at B, does not fire for B
    expect(count("keeper")).toBe(3); // once per Hold, doubled at B
    expect(count("sentinel")).toBe(0);
    expect(items).toHaveLength(4);
    // Nothing has resolved yet (the delayed Adds add nothing until Main Phase either).
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand0);
    expect(game.p1.power()).toBe(0);
  });

  test("383.3.d: P1 alone is offered ONE order decision spanning all four of its simultaneous hold triggers {dune, keeper, keeper, keeper}", async () => {
    const { game } = await intoBeginning();
    const d = orderDecision(game);
    expect(d).toBeDefined();
    expect(d?.seat).toBe(P1);
    expect((d?.items ?? []).map((i) => i.card).sort()).toEqual(["dune", "keeper", "keeper", "keeper"]);
  });

  test("P2 is never asked to order anything — the only decisions P2 ever sees in the Beginning Phase are priority passes", async () => {
    const { game } = await intoBeginning();
    const seen = await drainRecording(game);
    expect(seen.filter((s) => s.kind === "order")).toEqual([{ kind: "order", seat: P1 }]);
    expect(seen.filter((s) => s.seat === P2).every((s) => s.kind === "action")).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("after the order offer P1 (controller of the newest item / turn player) holds priority first, then P2 may respond (337.4)", async () => {
    const { game } = await intoBeginning();
    await game.acceptTriggerOrder();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });
});

describe("(c) net after the chain empties and P1 reaches Main Phase — split layout", () => {
  test("P1: +2 cards from Dunebreaker (+1 Draw Phase), XP 0 → 3, +2 rainbow from the two delayed Adds, points 4", async () => {
    const { game, p1Hand0 } = await intoBeginning();
    // Delayed Add: nothing in the pool during the Beginning Phase.
    expect(game.phase()).toBe("beginning");
    expect(game.p1.power()).toBe(0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand0 + 2 + 1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.p1.points()).toBe(4);
    expect(game.p2.xp()).toBe(0);
    expect(game.p2.power()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("both battlefields stay P1's (each still has its holder standing there)", async () => {
    const { game } = await intoBeginning();
    await game.settle();
    expect(game.locationOf("dune")).toBe("A");
    expect(game.locationOf("sentinel")).toBe("B");
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
  });
});

describe("(d) contrast — vanilla alone at A, Dunebreaker + Blue Sentinel together at B", () => {
  test("still exactly two score events and +2 points (2 → 4): stacking the doubler with Dunebreaker adds no point", async () => {
    const { game } = await intoBeginning("stacked");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);
    expect(game.p1.points()).toBe(4);
    await game.settle();
    expect(game.p1.points()).toBe(4);
  });

  test("lingering chain = Keeper ×3 (A ×1 + B ×2) + Dunebreaker ×2 (now at B → doubled); the vanilla unit triggers nothing; the Sentinel's Adds again do not linger", async () => {
    const { game } = await intoBeginning("stacked");
    const items = game.chain();
    expect(items.every((i) => i.triggered && i.controller === P1)).toBe(true);
    const count = (cardId: string) => items.filter((i) => i.cardId === cardId).length;
    expect(count("keeper")).toBe(3);
    expect(count("dune")).toBe(2);
    expect(count("vanilla")).toBe(0);
    expect(count("sentinel")).toBe(0);
    expect(items).toHaveLength(5);
    const d = orderDecision(game);
    expect(d?.seat).toBe(P1);
    expect((d?.items ?? []).map((i) => i.card).sort()).toEqual(["dune", "dune", "keeper", "keeper", "keeper"]);
  });

  test("net at Main Phase: 4 cards from Dunebreaker (+1 Draw Phase), XP 3, 2 rainbow, points 4 — only Dunebreaker's count changed vs. the split layout", async () => {
    const split = await intoBeginning("split");
    await split.game.settle();
    const stacked = await intoBeginning("stacked");
    await stacked.game.settle();
    expect(stacked.game.phase()).toBe("main");
    expect(stacked.game.p1.hand()).toHaveLength(stacked.p1Hand0 + 4 + 1);
    expect(stacked.game.p1.xp()).toBe(3);
    expect(stacked.game.p1.power("rainbow")).toBe(2);
    expect(stacked.game.p1.points()).toBe(4);
    // Side by side: same points / XP / rainbow, two more cards.
    expect(stacked.game.p1.points()).toBe(split.game.p1.points());
    expect(stacked.game.p1.xp()).toBe(split.game.p1.xp());
    expect(stacked.game.p1.power("rainbow")).toBe(split.game.p1.power("rainbow"));
    expect(stacked.game.p1.hand().length - stacked.p1Hand0).toBe(split.game.p1.hand().length - split.p1Hand0 + 2);
    expect(stacked.game.violations()).toEqual([]);
  });
});
