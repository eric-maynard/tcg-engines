/**
 * Interaction: Shen, Leader of the Kinkou Order (ven-138-166) · Champion Unit · Order · 6+[order]×2 · 7 Might
 *     "[Shield] When I hold, if there is exactly one other unit you control here, you score 1 point."
 *   × Sprite (ogn-274-298) · 3-Might unit token · [Temporary] ("Kill me at the start of your Beginning Phase,
 *     before scoring.")
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · [Reaction]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Rules: 383.2.a.1 (an "if" right after the condition is part of the TRIGGER CONDITION — sampled when the hold
 * is processed, never re-checked on resolution), 383.2.c, 383.4.d.2.a (Hold Effects are queued when the unit
 * is present as its controller Holds and gains the point), 816 / 315.2.a (Temporary is a start-of-Beginning-
 * Phase trigger: it opens a chain in the Beginning Step, BEFORE the Scoring Step 315.2.b), 337.4 (once the
 * item is finalized its controller gets priority → Reactions may be played), 320.1 (no priority inside the
 * scoring task itself), 467 (Hold = +1).
 *
 * Question:
 *   (a) FALSE→TRUE through the earlier window. P1 starts the turn controlling bfA with Shen, X, Y and a Sprite.
 *       Left alone the Sprite dies and Shen holds with TWO others → no trigger. May P1 answer the Sprite's
 *       Temporary trigger with Retreat on Y so that exactly one other unit (X) is there when the hold is
 *       processed? Is there any such window inside the Scoring Step when there is no Sprite?
 *   (b) TRUE→FALSE. bfA = Shen + X (+ the dying Sprite). Shen's hold trigger goes on the chain; P1 responds with
 *       Retreat on X. Does Shen, now alone, still score the extra point?
 *
 * Expected:
 *   (a) Yes. Beginning Step: Temporary item on the chain → P1 has priority, taps a rune, plays Retreat on Y;
 *       LIFO: Retreat resolves (Y → hand, P1 channels 1 rune exhausted), then the Sprite is killed. Scoring Step:
 *       hold +1, units here = Shen + X → condition TRUE → Shen's item is queued and resolves → +1 (total 2).
 *       Without the Sprite there is no priority before the hold: X and Y are both there → nothing is queued,
 *       P1's first decision of the turn is the main phase with the single hold point already scored.
 *   (b) Shen + X at hold → item finalized (snapshot true). Retreat on X in response (X → hand, channel 1). The
 *       item resolves without re-checking → +1 although Shen is alone: total 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHEN_LEADER = "ven-138-166";
const SPRITE = "ogn-274-298";
const RETREAT = "ogn-104-298";

interface BoardOpts {
  readonly y: boolean;
  readonly sprite: boolean;
}

/**
 * P2 is about to end turn 2. bfA: P1's — Shen + Acolyte X (+ Acolyte Y) (+ a Sprite token). bfB: P2's with a
 * bystander. P1 has one ready Mind rune (to pay Retreat's 1 during the Beginning Phase — pools are empty then)
 * and Retreat in hand. P1 starts at 0 points (well clear of final-point rules).
 */
function board(o: BoardOpts) {
  let s = scenario()
    .turn(2)
    .active(P2)
    .points(P1, 0)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", SHEN_LEADER, "shen")
    .unit(P1, "bfA", { might: 2, name: "Acolyte X" }, "x")
    .unit(P2, "bfB", { might: 2, name: "Bystander" }, "theirs")
    .rune(P1, "mind", { alias: "r1" })
    .hand(P1, RETREAT, "retreat");
  if (o.y) {
    s = s.unit(P1, "bfA", { might: 2, name: "Acolyte Y" }, "y");
  }
  if (o.sprite) {
    s = s.unit(P1, "bfA", SPRITE, "sprite");
  }
  return s;
}

const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);
const spriteState = (game: Game) => (game.has("sprite") ? game.zoneOf("sprite") : "gone");

/** (a) P2 ends the turn; inside the Sprite's Temporary chain P1 taps r1 and Retreats `target`. */
async function retreatInTemporaryWindow(target: "x" | "y", o: BoardOpts = { sprite: true, y: true }): Promise<Game> {
  const game = await board(o).build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(chainIds(game)).toEqual(["sprite*"]);
  await game.p1.tapRune("r1");
  await game.p1.cast("retreat", { targets: target });
  return game;
}

describe("(a) FALSE→TRUE — Retreat in the Sprite's Temporary window fixes the count before the hold is processed", () => {
  test("Beginning Step: the Sprite's Temporary trigger is P1's triggered item on the chain BEFORE any scoring (P1 still 0 points) and P1 — its controller — holds priority (816, 315.2.a, 337.4)", async () => {
    const game = await board({ sprite: true, y: true }).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(spriteState(game)).toBe("battlefield-bfA"); // not dead yet — it is a trigger, not an instant kill
  });

  test("in that window Retreat (Reaction) is playable once P1 taps the ready rune: offered with every friendly unit at bfA as a target; casting it on Y stacks it ABOVE the Sprite item", async () => {
    const game = await board({ sprite: true, y: true }).build();
    await game.p2.endTurn();
    expect(game.p1.can("cast", "retreat")).toBe(false); // pool is empty at turn start
    await game.p1.tapRune("r1");
    expect(game.p1.can("cast", "retreat")).toBe(true);
    const targets = game.p1.option("cast", "retreat")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect([...new Set(targets.flat() as string[])].sort()).toEqual(["shen", "sprite", "x", "y"]);
    await game.p1.cast("retreat", { targets: "y" });
    expect(chainIds(game)).toEqual(["sprite*", "retreat"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("LIFO: both pass → Retreat resolves first (Y → P1's hand, P1 channels 1 rune EXHAUSTED) while the Sprite is still on bfA under its pending kill", async () => {
    const game = await retreatInTemporaryWindow("y");
    expect(game.p1.runes()).toEqual(["r1"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("y")).toBe("hand");
    expect(game.p1.hand()).toContain("y");
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2); // r1 + the channeled one
    expect(game.p1.runes({ ready: true })).toEqual([]); // r1 was tapped, the new rune came in exhausted
    expect(spriteState(game)).toBe("battlefield-bfA");
    expect(chainIds(game)).toEqual(["sprite*"]);
    expect(game.p1.points()).toBe(0);
    expect(game.phase()).toBe("beginning");
  });

  test("then the Temporary item resolves: the Sprite is killed (token → ceases to exist) — and only NOW the Scoring Step runs: hold +1 with units here = Shen + X → Shen's Hold Effect IS queued as P1's triggered item (383.4.d.2.a)", async () => {
    const game = await retreatInTemporaryWindow("y");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(spriteState(game)).toBe("gone");
    expect(game.p1.units("bfA").sort()).toEqual(["shen", "x"]);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shen", controller: P1, triggered: true, type: "ability" })]);
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("Shen's item resolves → +1 more: P1 enters the main phase on 2 points, controlling bfA with Shen + X, Y in hand, no violations", async () => {
    const game = await retreatInTemporaryWindow("y");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.units("bfA").sort()).toEqual(["shen", "x"]);
    expect(game.zoneOf("y")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — same board, P1 just passes in the Temporary window: Sprite dies, Shen holds with TWO others (X, Y) → 'exactly one other' is FALSE → nothing is queued, only the hold point (1)", async () => {
    const game = await board({ sprite: true, y: true }).build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(spriteState(game)).toBe("gone");
    expect(game.chain().some((c) => c.cardId === "shen")).toBe(false);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bfA").sort()).toEqual(["shen", "x", "y"]);
  });

  test("contrast — Retreating X instead of Y changes nothing about the count (Shen + Y = exactly one other) → also 2 points", async () => {
    const game = await retreatInTemporaryWindow("x");
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.zoneOf("x")).toBe("hand");
  });

  test("WITHOUT a Sprite there is NO window before the hold: P2 ends the turn and P1's very first decision is its open MAIN phase with the single hold point already scored — Shen + X + Y was sampled → no Shen item ever, Retreat was never castable 'in response to scoring' (320.1)", async () => {
    const game = await board({ sprite: false, y: true }).build();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("retreat")).toBe("hand");
    expect(game.p1.units("bfA").sort()).toEqual(["shen", "x", "y"]);
    // Retreat now (main phase) is legal but far too late for this turn's hold.
    await game.p1.tapRune("r1");
    await game.p1.cast("retreat", { targets: "y" });
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });

  test("control — without a Sprite but with only X beside Shen, the hold itself queues Shen's item with no help needed → 2", async () => {
    const game = await board({ sprite: false, y: false }).build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(chainIds(game)).toEqual(["shen*"]);
    await game.settle();
    expect(game.p1.points()).toBe(2);
  });
});

describe("(b) TRUE→FALSE — Retreat on X in response to Shen's finalized hold trigger does not un-score it (383.2.a.1)", () => {
  /** bfA = Shen + X + Sprite. P2 ends; everybody passes on the Temporary item; the hold queues Shen's item. */
  async function shenItemOnChain(): Promise<Game> {
    const game = await board({ sprite: true, y: false }).build();
    await game.p2.endTurn();
    expect(chainIds(game)).toEqual(["sprite*"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(spriteState(game)).toBe("gone");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shen", controller: P1, triggered: true })]);
    return game;
  }

  test("at hold processing bfA = Shen + X (the Sprite already died 'before scoring') → the item is finalized on the chain and P1 has priority with Retreat castable (after tapping r1)", async () => {
    const game = await shenItemOnChain();
    expect(game.p1.units("bfA").sort()).toEqual(["shen", "x"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.tapRune("r1");
    expect(game.p1.can("cast", "retreat")).toBe(true);
    await game.p1.cast("retreat", { targets: "x" });
    expect(chainIds(game)).toEqual(["shen*", "retreat"]);
  });

  test("Retreat resolves first: X → hand, P1 channels 1 rune exhausted; Shen is now ALONE at bfA with his item still on the chain (othersHere at resolution = 0)", async () => {
    const game = await shenItemOnChain();
    await game.p1.tapRune("r1");
    await game.p1.cast("retreat", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.units("bfA")).toEqual(["shen"]);
    expect(chainIds(game)).toEqual(["shen*"]);
    expect(game.p1.points()).toBe(1);
  });

  test("the item then resolves WITHOUT re-checking the intervening 'if': P1 scores the point anyway → 2 (hold 1 + Shen 1); main phase, Shen alone on bfA, still P1's, no violations", async () => {
    const game = await shenItemOnChain();
    await game.p1.tapRune("r1");
    await game.p1.cast("retreat", { targets: "x" });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.p1.units("bfA")).toEqual(["shen"]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Retreating X EARLY (in the Temporary window, before the hold) leaves Shen alone when the hold is processed → condition FALSE → no item, 1 point: timing is everything", async () => {
    const game = await retreatInTemporaryWindow("x", { sprite: true, y: false });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Retreat
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sprite dies → scoring
    expect(game.p1.units("bfA")).toEqual(["shen"]);
    expect(game.chain().some((c) => c.cardId === "shen")).toBe(false);
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });
});
