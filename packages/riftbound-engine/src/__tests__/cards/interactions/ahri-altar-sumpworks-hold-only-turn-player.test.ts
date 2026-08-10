/**
 * Interaction: Ahri, Alluring (ogn-066-298) · Champion Unit · Calm · [5] · 4 Might · "When I hold, you score 1 point."
 *   × Altar to Unity (ogn-275-298) · Battlefield · "When you hold here, play a 1 [Might] Recruit unit token in your base."
 *   × Sumpworks Map (unl-085-219) · Gear · Mind · [2] · "[Reaction] [Temporary] When an opponent scores, draw 1."
 *
 * Question — 315.2.b: in the Scoring Step "the Turn Player Holds all Battlefields they Control". Board (Duel):
 * bfA = Altar to Unity controlled by P1 with one P1 unit; bfB controlled by P2 whose only unit there is Ahri;
 * P2 also has Sumpworks Map in base. P1 3 points, P2 3 points.
 *   (a) P1's turn begins: which battlefields are Held, by whom; totals; does Altar make a Recruit; does Ahri
 *       trigger; how many cards does Sumpworks Map draw P2?
 *   (b) Then P2's next turn begins (board unchanged): does P1's Altar do anything, how many points does P2
 *       gain, does the Map draw for P2's own scoring?
 * Shortcuts to exclude: a Scoring Step that iterates every controlled battlefield (both players hold every
 * turn), or one that treats the non-turn player as a "teammate/other" and disqualifies nothing / everything.
 *
 * Rules: 315.2.b / 315.2.b.2 (only the Turn Player holds, and only what THEY control), 315.2.b.3 + 469.1.a +
 * 485.2 (teammate carve-outs are vacuous in a Duel), 469.2 / 470 (a Hold is a Score, once per battlefield per
 * turn), 471.1 (+1 per score; the Final-Point limit is Conquer-only), 471.2.b (hold abilities trigger for the
 * holder), 194.1.c ("you score 1 point" is a score). Note 816.1.b: [Temporary] kills the Map at the start of
 * P2's OWN Beginning Phase, before scoring — so on P2's turn it is gone in any case.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI_ALLURING = "ogn-066-298";
const ALTAR_TO_UNITY = "ogn-275-298";
const SUMPWORKS_MAP = "unl-085-219";

/**
 * P2 is about to end turn 2. bfA "altar" = live Altar to Unity, controlled by P1 with Holder (2) on it.
 * bfB = inert battlefield controlled by P2 with Ahri, Alluring as its only unit. P2's Sumpworks Map in base.
 * 3–3. Decks auto-filled.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, 3)
    .points(P2, 3)
    .battlefield("altar", { controller: P1, def: ALTAR_TO_UNITY, inert: false, owner: P1 })
    .battlefield("bfB", { controller: P2, owner: P2 })
    .unit(P1, "altar", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bfB", AHRI_ALLURING, "ahri")
    .gear(P2, SUMPWORKS_MAP, "map");
}

const recruitsInBase = (game: Game, seat: "p1" | "p2"): string[] =>
  game[seat].base().filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");

/** P2 ends turn 2 → P1's Beginning Phase has scored and put its triggers on the chain; nothing resolved yet. */
async function p1Beginning(): Promise<{ game: Game; p1Hand0: number; p2Hand0: number }> {
  const game = await board().build();
  const p1Hand0 = game.p1.hand().length;
  const p2Hand0 = game.p2.hand().length;
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return { game, p1Hand0, p2Hand0 };
}

/** …then P1's whole turn passes with no actions and P2's turn 4 has settled into its main phase. */
async function p2TurnSettled(): Promise<{ game: Game; p1Hand1: number; p2Hand1: number; recruits1: string[] }> {
  const { game } = await p1Beginning();
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  const p1Hand1 = game.p1.hand().length;
  const p2Hand1 = game.p2.hand().length;
  const recruits1 = recruitsInBase(game, "p1");
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  return { game, p1Hand1, p2Hand1, recruits1 };
}

describe("315.2.b — only the Turn Player holds: Ahri (P2) × Altar to Unity (P1) × Sumpworks Map (P2)", () => {
  // ── (a) P1's Beginning Phase ───────────────────────────────────────────────────────────

  test("(a) P1's Scoring Step: P1 Holds ONLY bfA (the battlefield P1 controls) → 3→4; bfB is P2's and P2 is not the Turn Player → not held by anyone, P2 stays 3 (315.2.b.2, 469.2, 471.1)", async () => {
    const { game } = await p1Beginning();
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["altar"]);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(3);
  });

  test("(a) triggers raised: Altar's 'When you hold here' for its controller P1 and ONE Sumpworks Map 'an opponent scored' for P2 — Ahri's 'When I hold' does NOT trigger (471.2.b)", async () => {
    const { game } = await p1Beginning();
    const items = game.chain().map((c) => ({ cardId: c.cardId, controller: c.controller, triggered: c.triggered }));
    expect(items).toContainEqual({ cardId: "altar", controller: P1, triggered: true });
    expect(items).toContainEqual({ cardId: "map", controller: P2, triggered: true });
    expect(items.filter((i) => i.cardId === "map")).toHaveLength(1);
    expect(items.some((i) => i.cardId === "ahri")).toBe(false);
    expect(items).toHaveLength(2);
  });

  test("(a) after everything resolves: exactly one 1-Might Recruit token in P1's base, P2 drew exactly 1 off the Map, P1 drew only its Draw-Step card; totals P1 4 – P2 3", async () => {
    const { game, p1Hand0, p2Hand0 } = await p1Beginning();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const recruits = recruitsInBase(game, "p1");
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ cardType: "unit", controller: P1, might: 1 });
    expect(recruitsInBase(game, "p2")).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1); // Sumpworks Map: P1 (an opponent) scored once
    expect(game.p1.hand()).toHaveLength(p1Hand0 + 1); // rule draw only
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(3);
    expect(game.zoneOf("map")).toBe("base"); // Temporary only bites on P2's own Beginning Phase
    expect(game.violations()).toEqual([]);
  });

  // ── (b) P2's Beginning Phase ───────────────────────────────────────────────────────────

  test("(b) P2's Scoring Step: P2 Holds bfB (3→4) and Ahri's hold trigger scores 1 more → 5; bfA is P1's and P1 is not the Turn Player → nothing held there, P1 stays 4 (315.2.b.2, 194.1.c, 471.1)", async () => {
    const { game } = await p2TurnSettled();
    expect(game.gameState.scoredThisTurn[P2]).toContain("bfB");
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(game.p2.points()).toBe(5);
    expect(game.p1.points()).toBe(4);
    expect(game.isOver()).toBe(false);
  });

  test("(b) stepping through P2's Beginning Phase: the Map's [Temporary] kill resolves BEFORE scoring, then the Hold books 4 and Ahri's trigger (controller P2) is the chain item that takes P2 to 5 — no Altar trigger, no Map draw trigger", async () => {
    const { game } = await p1Beginning();
    await game.settle();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    // Start of Beginning Phase: only the Temporary kill is pending; nothing scored yet.
    expect(game.chain().map((c) => c.cardId)).toEqual(["map"]);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    expect(game.p2.points()).toBe(3);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Temporary resolves → Map dies → Scoring Step runs
    expect(game.zoneOf("map")).toBe("trash");
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["bfB"]);
    expect(game.p2.points()).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P2, triggered: true })]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ahri: "you score 1 point"
    expect(game.p2.points()).toBe(5);
    expect(game.chain()).toEqual([]); // her extra score raised no further trigger (no Altar, no Map)
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(b) P1's Altar does nothing on P2's turn (still exactly the one Recruit from (a)); P2 draws exactly its Draw-Step card — the Map draws 0 for P2's own scoring (P2 is not P2's opponent; and it is Temporary-dead by then); P1 draws nothing", async () => {
    const { game, p1Hand1, p2Hand1, recruits1 } = await p2TurnSettled();
    expect(recruitsInBase(game, "p1")).toEqual(recruits1);
    expect(recruits1).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(p2Hand1 + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand1);
    expect(game.zoneOf("map")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
