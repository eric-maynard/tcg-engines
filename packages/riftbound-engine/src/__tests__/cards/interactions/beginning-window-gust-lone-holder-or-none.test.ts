/**
 * Interaction: is there a Reaction window in the Beginning Phase BEFORE the hold is scored?
 *
 *   × Gust (ogn-169-298, Spell, chaos, 1 energy) "[Reaction] Return a unit at a battlefield
 *     with 3 [Might] or less to its owner's hand."
 *   × Loose Cannon (ogn-251-298, Legend) "At start of your Beginning Phase, draw 1 if you have
 *     one or fewer cards in your hand."
 *   × Keeper of the Hammer (unl-203-219, Legend) "When you hold, gain 1 XP. …"
 *
 * Rules: 315.1.b (Awaken: the Turn Player readies everything — a Task, no chain), 315.2.a.1
 * (start-of-Beginning-Phase effects), 383.2.a.1 (Loose Cannon's "if" is part of the EFFECT, so
 * the trigger always goes on the chain), 383.3.c (triggered abilities open a chain → priority),
 * 323.6 / 190.4.a / 190.4.c (a controlled battlefield with none of your units lapses at the next
 * Cleanup in an Open State), 315.2.b.2 / 469.2 (Scoring Step: the Turn Player holds what they
 * still control), 471.2.b (hold abilities trigger when a battlefield is held).
 *
 * Board: P1 controls bf1 with a LONE, EXHAUSTED 2-Might unit H and has 5 cards in hand. P2 (the
 * turn player, about to end turn) holds Gust and one ready chaos rune to pay for it.
 *   Case A — P1's legend is Loose Cannon: its start-of-Beginning-Phase trigger opens a chain, P2
 *   gets priority and Gusts H; H leaves before the Scoring Step, bf1 lapses at the Cleanup, and
 *   P1 scores NOTHING. Loose Cannon still resolves and draws nothing (5 cards).
 *   Case B — P1's legend is Keeper of the Hammer: nothing triggers before the Scoring Step, so
 *   P2 never has priority until the HOLD trigger is on the chain — by then the point is scored.
 *   Gusting H then still lets the XP resolve; bf1 only lapses at the next Cleanup.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const LOOSE_CANNON = "ogn-251-298";
const KEEPER_OF_THE_HAMMER = "unl-203-219";

const P1_HAND = 5;

function board(legend: string) {
  let b = scenario()
    .turn(2)
    .active(P2)
    .legend(P1, legend, "legend")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "H", { exhausted: true })
    .hand(P2, GUST, "gust")
    .rune(P2, "chaos", { alias: "p2rune" });
  for (let i = 0; i < P1_HAND; i++) {
    b = b.hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: `Filler ${i}` }, `filler${i}`);
  }
  return b;
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

function gustTargets(game: Built): string[] {
  const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Case A — Loose Cannon: the start-of-Beginning-Phase trigger opens a window BEFORE the Scoring Step", () => {
  test("P2 ends turn → Awaken readied H with no chain; the Beginning Step put Loose Cannon on the chain although P1 holds 5 cards (383.2.a.1); P1 has priority first and has not scored yet", async () => {
    const game = await board(LOOSE_CANNON).build();
    expect(game.p1.hand()).toHaveLength(P1_HAND);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.state("H").isExhausted).toBe(false); // 315.1.b
    expect(game.zoneOf("H")).toBe("battlefield-bf1");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "legend", controller: P1, name: "Loose Cannon", triggered: true });
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "action" ? d.context : undefined).toBe("chain");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // P2 has nothing to do until P1 passes.
    expect(game.p2.legal()).toEqual([]);
  });

  test("after P1 passes, P2 holds priority on that chain: it may tap its rune and Gust is castable with H (2 Might, at a battlefield) as the offered target", async () => {
    const game = await board(LOOSE_CANNON).build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("tapRune", "p2rune")).toBe(true);
    await game.p2.tapRune("p2rune");
    expect(game.p2.energy()).toBe(1);
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toEqual(["H"]);
    await game.p2.cast("gust", { targets: "H" });
    expect(game.chain().map((c) => c.name)).toEqual(["Loose Cannon", "Gust"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "gust", controller: P2, targets: ["H"], triggered: false });
  });

  test("LIFO: Gust resolves first (H → P1's hand), then Loose Cannon resolves and draws NOTHING (P1 has more than one card); P1 reaches its main phase with 5 + H + the Draw-Phase card = 7 in hand", async () => {
    const game = await board(LOOSE_CANNON).build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.tapRune("p2rune");
    await game.p2.cast("gust", { targets: "H" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.hand()).toContain("H");
    expect(game.p1.hand()).toHaveLength(P1_HAND + 1 + 1);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Scoring Step: with H gone the empty bf1 lapsed at the Cleanup (323.6 / 190.4.c) BEFORE the hold — P1 scores no point and no longer controls bf1", async () => {
    const game = await board(LOOSE_CANNON).build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.tapRune("p2rune");
    await game.p2.cast("gust", { targets: "H" });
    await game.settle();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("control run (P2 lets the trigger resolve without Gusting): Loose Cannon draws nothing, H stays, P1 holds bf1 for exactly 1 point", async () => {
    const game = await board(LOOSE_CANNON).build();
    await game.p2.endTurn();
    await game.settle(); // both pass → Loose Cannon resolves → scoring → channel → draw → main
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("H")).toBe("battlefield-bf1");
    expect(game.state("H").isExhausted).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(P1_HAND + 1); // only the Draw-Phase card
    expect(game.zoneOf("gust")).toBe("hand");
  });
});

describe("Case B — Keeper of the Hammer: no chain before the Scoring Step, so P2's first window comes AFTER the point", () => {
  test("P2 ends turn → the very first decision anyone receives is the chain opened by Keeper's HOLD trigger, and by then P1 already has the point (H having been exhausted is irrelevant — Awaken readied it, and holding only needs control)", async () => {
    const game = await board(KEEPER_OF_THE_HAMMER).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.kind === "action" ? d.context : undefined).toBe("chain");
    expect(d?.seat).toBe(P1);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "legend", controller: P1, name: "Keeper of the Hammer", triggered: true });
    // 315.2.b.2 / 469.2: the hold already happened — score event {bf1, +1}.
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0); // the XP trigger is still on the chain
    expect(game.state("H").isExhausted).toBe(false);
    expect(game.zoneOf("H")).toBe("battlefield-bf1");
    // P2 had no priority in Awaken / the Beginning Step and still has none until P1 passes.
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "gust")).toBe(false);
  });

  test("NOW P2 gets priority and may Gust H — but the point is already banked: after the chain resolves P1 has 1 point AND 1 XP, H is in P1's hand, Gust in P2's trash", async () => {
    const game = await board(KEEPER_OF_THE_HAMMER).build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.tapRune("p2rune");
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toEqual(["H"]);
    await game.p2.cast("gust", { targets: "H" });
    expect(game.chain().map((c) => c.name)).toEqual(["Keeper of the Hammer", "Gust"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(P1_HAND + 1 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("Gusting H after the hold only makes bf1 lapse at the next Cleanup: by P1's main phase bf1 is uncontrolled, yet the score stays 1–0", async () => {
    const game = await board(KEEPER_OF_THE_HAMMER).build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.tapRune("p2rune");
    await game.p2.cast("gust", { targets: "H" });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("control run (no Gust): P1 +1 point, +1 XP, keeps H ready at bf1 and keeps control", async () => {
    const game = await board(KEEPER_OF_THE_HAMMER).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("H")).toBe("battlefield-bf1");
    expect(game.state("H").isExhausted).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("gust")).toBe("hand");
  });
});
