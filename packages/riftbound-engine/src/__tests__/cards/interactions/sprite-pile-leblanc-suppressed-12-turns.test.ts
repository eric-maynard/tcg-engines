/**
 * Interaction: Trevor Snoozebottom (unl-048-219) · Unit · Calm · [3] · 3 Might
 *     "[Shield] … When I hold, play a ready 3 [Might] Sprite unit token with [Temporary] here."
 *   × LeBlanc, Everywhere at Once (unl-090-219) · Champion Unit · Mind · [4] · 4 Might
 *     "[Backline] … Your [Temporary] effects at my battlefield don't trigger."
 *   × Petal Pixie (unl-076-219) · Unit · Mind · [2] · 2 Might
 *     "I have +1 [Might] for each of your units with [Temporary] at my battlefield."
 *   × Sprite token (unl-t07) · 3 Might · [Temporary]
 *
 * Rules: 816.1 / 816.1.b / 816.1.c ([Temporary] is a TRIGGERED ability — "at the start of this permanent's
 * controller's Beginning Phase, BEFORE scoring, kill this"; its condition is that phase start), 383.3.d
 * (simultaneous same-controller triggers: that player orders them onto the chain), 337.1 / 337.3 (each is
 * finalized through the pending-item loop), 469.2 + 470 + 471.2.c (Hold scores once per battlefield per turn and
 * a hold trigger fires once per hold), 319.6 (one Cleanup reaps everything that died), 323.6 (control lapses in
 * an Open State once nothing of yours is there), 186.1 (a token that leaves the board ceases to exist).
 *
 * Question — Trevor holds the same battlefield for 12 straight P1 turns, with LeBlanc and Petal Pixie standing
 * beside him.
 *   (a) Do the Sprites really accumulate past 8 units at that battlefield while LeBlanc lives, and does Petal
 *       Pixie's Might track exactly 2+N every turn without drifting or double-counting?
 *   (b) LeBlanc dies — at the start of the next Beginning Phase do all 12 stored [Temporary] triggers fire
 *       simultaneously, before scoring?
 *   (c) Does each Sprite keep a distinct object id across the whole run, and does Trevor's hold trigger fire
 *       exactly once per turn no matter how big the pile gets?
 *
 * Answer: (a) yes — LeBlanc's static suppresses the trigger only at HER battlefield, so nothing kills the Sprites
 * there and the pile grows by exactly one per turn, reaching 12 Sprites (15 units) with no cap; Pixie reads 2+N
 * at every checkpoint. The same board carries the NO side: a second Trevor at bf2, with no LeBlanc, mints one
 * Sprite per turn that dies on schedule at the next Beginning Phase, so bf2 never holds more than one.
 * (b) yes — with the suppression lifted every surviving Sprite's condition is met at the same instant, P1 orders
 * them onto the chain (383.3.d) and they all resolve BEFORE the scoring step (816.1.b), dying in one Cleanup
 * (319.6). Two things that does NOT do here: it does not cost P1 the Hold (Trevor and Petal Pixie are not
 * Temporary, so bf1 still has units of P1's and control never lapses, 323.6), and it does not end the engine —
 * the very same phase's scoring step holds bf1 again and Trevor mints a fresh Sprite, so Pixie lands on 3, not 2.
 * The Hold is only lost where the battlefield's whole garrison was Temporary — pinned separately below.
 * (c) 24 distinct token ids are minted across the run (12 that live at bf1, 12 that live and die at bf2) with no
 * reuse, Trevor's trigger fires exactly once per turn at each battlefield, and no invariant fires.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TREVOR = "unl-048-219";
const LEBLANC = "unl-090-219";
const PETAL_PIXIE = "unl-076-219";
const SPRITE_TOKEN = "unl-t07";

const P1_TURNS = 12;
const LONG = 120_000; // the 12-turn simulation is deliberately slow

/** P2's free [Action] "Kill a unit." — the lever that removes LeBlanc on turn 12. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Execute",
  rulesText: "Kill a unit.",
  timing: "action",
} as const;

interface TurnRow {
  readonly p1Turn: number;
  readonly turnNumber: number;
  readonly bf1Units: readonly string[];
  readonly bf1Sprites: readonly string[];
  readonly bf2Units: readonly string[];
  readonly bf2Sprites: readonly string[];
  readonly pixieMight: number;
  readonly points: number;
}

interface Run {
  readonly game: Game;
  readonly rows: readonly TurnRow[];
  /** Every token id ever seen on the board, in first-sighting order. */
  readonly tokenIds: readonly string[];
  /** After LeBlanc is killed on P2's turn, still before P1's next Beginning Phase. */
  readonly afterLeblancDies: { bf1Sprites: readonly string[]; pixieMight: number; points: number };
  /** In P1's next Beginning Phase, with every Temporary item on the chain and nothing dead yet. */
  readonly atMassDeath: {
    phase: string;
    chainCardIds: readonly string[];
    allTriggeredByP1: boolean;
    bf1SpritesAlive: number;
    points: number;
  };
  /** After the phase completes. */
  readonly afterMassDeath: {
    bf1Units: readonly string[];
    goneSprites: number;
    pixieMight: number;
    points: number;
    bf1Controller: string | null;
  };
}

const spritesOf = (game: Game, ids: readonly string[]) => ids.filter((id) => game.state(id).isToken);

/**
 * Turn 2, P2 to act. bf1 is P1's, garrisoned by Trevor + LeBlanc + Petal Pixie (the SUPPRESSED side). bf2 is
 * P1's, garrisoned by a second Trevor alone (the LIVE side — Temporary really kills there). Victory Score is
 * lifted out of the way and both decks are deep enough for 24 turns of drawing.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(99)
    .fillDecks({ main: 80, runes: 60 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", TREVOR, "trevor")
    .unit(P1, "bf1", LEBLANC, "lb")
    .unit(P1, "bf1", PETAL_PIXIE, "pixie")
    .unit(P1, "bf2", TREVOR, "trevor2")
    .hand(P2, EXECUTE, "exec");
}

let cached: Promise<Run> | undefined;

/** One 12-turn simulation, then LeBlanc dies and the pile comes due. Memoised — every read-only facet shares it. */
function run(): Promise<Run> {
  cached ??= (async (): Promise<Run> => {
    const game = await board().build();
    const rows: TurnRow[] = [];
    const tokenIds: string[] = [];
    const seen = new Set<string>();

    for (let k = 1; k <= P1_TURNS; k++) {
      await game.advanceTurn(); // → P1's Beginning Phase, then its open Main Phase
      const bf1Units = game.p1.units("bf1");
      const bf2Units = game.p1.units("bf2");
      for (const id of [...bf1Units, ...bf2Units]) {
        if (game.state(id).isToken && !seen.has(id)) {
          seen.add(id);
          tokenIds.push(id);
        }
      }
      rows.push({
        bf1Sprites: spritesOf(game, bf1Units),
        bf1Units,
        bf2Sprites: spritesOf(game, bf2Units),
        bf2Units,
        p1Turn: k,
        pixieMight: game.state("pixie").might,
        points: game.p1.points(),
        turnNumber: game.turnNumber(),
      });
      if (k < P1_TURNS) {
        await game.advanceTurn(); // → P2
      }
    }

    // Turn 12 done: P1 ends, P2 kills LeBlanc, P2 ends → P1's Beginning Phase with the whole pile due.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("exec", { targets: "lb" });
    await game.settle();
    expect(game.zoneOf("lb")).toBe("trash");
    const afterLeblancDies = {
      bf1Sprites: spritesOf(game, game.p1.units("bf1")),
      pixieMight: game.state("pixie").might,
      points: game.p1.points(),
    };

    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    const chain = game.chain();
    const atMassDeath = {
      allTriggeredByP1: chain.every((c) => c.triggered && c.controller === P1),
      bf1SpritesAlive: spritesOf(game, game.p1.units("bf1")).length,
      chainCardIds: chain.map((c) => c.cardId),
      phase: game.phase(),
      points: game.p1.points(),
    };

    await game.settle();
    const afterMassDeath = {
      bf1Controller: game.gameState.battlefields.bf1?.controller ?? null,
      bf1Units: game.p1.units("bf1"),
      goneSprites: afterLeblancDies.bf1Sprites.filter((id) => game.zoneOf(id) === "gone").length,
      pixieMight: game.state("pixie").might,
      points: game.p1.points(),
    };

    return { afterLeblancDies, afterMassDeath, atMassDeath, game, rows, tokenIds };
  })();
  return cached;
}

describe("Trevor's Sprite pile under LeBlanc's suppression — 12 turns, then the bill", () => {
  // ── (a) the pile grows, uncapped, and Pixie tracks it exactly ────────────────────────────────────

  test("(a) LeBlanc suppresses [Temporary] only at HER battlefield: bf1 gains exactly one Sprite per P1 turn and none of them ever dies — 12 Sprites (15 units) after 12 turns, no cap at 8", async () => {
    const { rows } = await run();
    expect(rows).toHaveLength(P1_TURNS);
    for (const r of rows) {
      expect(r.bf1Sprites).toHaveLength(r.p1Turn); // one per hold, never fewer (nothing was killed)
      expect(r.bf1Units).toHaveLength(r.p1Turn + 3); // + Trevor, LeBlanc, Petal Pixie
    }
    expect(rows.filter((r) => r.bf1Units.length > 8).map((r) => r.p1Turn)[0]).toBe(6); // passes 8 units on turn 6
    expect(rows.at(-1)?.bf1Sprites).toHaveLength(12);
    expect(rows.at(-1)?.bf1Units).toHaveLength(15);
  }, LONG);

  test("(a) Petal Pixie's characteristic-defining static reads 2+N at EVERY checkpoint — no drift, no double count", async () => {
    const { rows } = await run();
    expect(rows.map((r) => r.pixieMight)).toEqual(rows.map((r) => 2 + r.bf1Sprites.length));
    expect(rows.map((r) => r.pixieMight)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  }, LONG);

  test("(a) the NO side on the same board: bf2 has no LeBlanc, so its Sprite dies each Beginning Phase and a fresh one is minted — bf2 never holds more than Trevor + 1", async () => {
    const { rows } = await run();
    for (const r of rows) {
      expect(r.bf2Sprites).toHaveLength(1);
      expect(r.bf2Units).toHaveLength(2); // Trevor #2 + exactly one live Sprite
    }
  }, LONG);

  test("(a) both battlefields keep scoring their Hold every turn while this happens: 2 points a turn, 24 after 12 turns (469.2 / 470)", async () => {
    const { rows } = await run();
    expect(rows.map((r) => r.points)).toEqual(rows.map((r) => 2 * r.p1Turn));
    expect(rows.at(-1)?.points).toBe(24);
    expect(rows.at(-1)?.turnNumber).toBe(2 * P1_TURNS + 1); // P1's 12th turn is game turn 25
  }, LONG);

  // ── (b) LeBlanc dies and the whole pile comes due at once ────────────────────────────────────────

  test("(b) killing LeBlanc mid-turn changes nothing retroactively: the 12 Sprites are all still standing and Pixie still reads 14 until the next Beginning Phase (383.2.c — the condition is a point in time)", async () => {
    const { afterLeblancDies } = await run();
    expect(afterLeblancDies.bf1Sprites).toHaveLength(12);
    expect(afterLeblancDies.pixieMight).toBe(14);
    expect(afterLeblancDies.points).toBe(24);
  }, LONG);

  test("(b) at the next Beginning Phase all 12 suppressed [Temporary] triggers fire SIMULTANEOUSLY as P1's items, before scoring — nothing has died yet and no point has been scored (816.1.b / 383.3.d / 337.1)", async () => {
    const { atMassDeath } = await run();
    expect(atMassDeath.phase).toBe("beginning");
    expect(atMassDeath.chainCardIds).toHaveLength(13); // the 12 at bf1 + bf2's own Sprite
    expect(atMassDeath.allTriggeredByP1).toBe(true);
    expect(atMassDeath.bf1SpritesAlive).toBe(12);
    expect(atMassDeath.points).toBe(24); // "(before scoring)"
  }, LONG);

  test("(b) they all resolve and die in one Cleanup (319.6): all 12 Sprites cease to exist (186.1), and because P1 still holds bf1 the SAME phase's scoring step mints a fresh one — Pixie lands on 2+1 = 3, not 14", async () => {
    const { afterMassDeath, game } = await run();
    expect(afterMassDeath.goneSprites).toBe(12); // every one of the old pile is gone
    expect(afterMassDeath.bf1Units).toHaveLength(3); // Trevor + Pixie + the brand-new Sprite
    expect(afterMassDeath.bf1Units).toEqual(expect.arrayContaining(["pixie", "trevor"]));
    expect(spritesOf(game, afterMassDeath.bf1Units)).toHaveLength(1);
    expect(afterMassDeath.pixieMight).toBe(3);
  }, LONG);

  test("(b) …but it does NOT cost P1 the Hold here: Trevor and Pixie are not Temporary, so bf1 still has units of P1's, control never lapses (323.6) and the turn still scores 2 (24 → 26)", async () => {
    const { afterMassDeath } = await run();
    expect(afterMassDeath.bf1Controller).toBe(P1);
    expect(afterMassDeath.points).toBe(26);
  }, LONG);

  test("(b) the Hold IS lost where the whole garrison was Temporary: a battlefield holding only LeBlanc + Sprites empties at the same moment, control lapses and no point is scored there", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(99)
      .battlefield("bf3", { controller: P1 })
      .unit(P1, "bf3", LEBLANC, "lb")
      .unit(P1, "bf3", SPRITE_TOKEN, "s1")
      .unit(P1, "bf3", SPRITE_TOKEN, "s2")
      .unit(P1, "bf3", SPRITE_TOKEN, "s3")
      .hand(P2, EXECUTE, "exec")
      .build();
    await game.p2.cast("exec", { targets: "lb" });
    await game.settle();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["s1", "s2", "s3"]);
    await game.settle();
    expect(["s1", "s2", "s3"].map((id) => game.zoneOf(id))).toEqual(["gone", "gone", "gone"]);
    expect(game.p1.units("bf3")).toEqual([]);
    expect(game.gameState.battlefields.bf3?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) identity and counters ────────────────────────────────────────────────────────────────────

  test("(c) every token minted over the run has a distinct object id — 24 of them (12 kept at bf1, 12 born-and-killed at bf2), no id ever reused after an earlier Sprite ceased to exist", async () => {
    const { tokenIds } = await run();
    expect(tokenIds).toHaveLength(2 * P1_TURNS);
    expect(new Set(tokenIds).size).toBe(tokenIds.length);
  }, LONG);

  test("(c) Trevor's hold trigger fires exactly ONCE per turn per battlefield no matter how big the pile gets (470 / 471.2.c) — the bf1 count is the turn index, never 2N or N²", async () => {
    const { rows } = await run();
    const bf1Counts = rows.map((r) => r.bf1Sprites.length);
    expect(bf1Counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (let i = 1; i < bf1Counts.length; i++) {
      expect((bf1Counts[i] as number) - (bf1Counts[i - 1] as number)).toBe(1);
    }
  }, LONG);

  test("(c) the invariants stay silent for the whole 12-turn run and the mass death — including card conservation across 24 tokens that ceased to exist", async () => {
    const { game } = await run();
    expect(game.violations()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
  }, LONG);
});
