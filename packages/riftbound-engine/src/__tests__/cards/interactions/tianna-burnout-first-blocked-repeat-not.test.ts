/**
 * Interaction: Tianna Crownguard (sfd-060-221) · Unit · Calm · 4 Might
 *     "[Deflect] While I'm at a battlefield, opponents can't gain points."
 *   × Death Mark (ven-144-166) · Spell · Fury/Chaos · [2][rainbow]
 *     "[Burn 3]. Play a 0 [Might] Shadow Clone unit token. [Flow] …"
 *
 * Question (1v1, Victory Score 8, P2 on 7, P1's turn, P1 casts Death Mark):
 *   (a) P1's Main Deck has 1 card, trash has 5, Tianna AT a battlefield: walk the Burn 3 — when
 *       does the Burn Out happen, who gets picked, does P2 get an 8th point through Tianna? Would
 *       it be stopped by the Final-Point rule; immediate win or at a cleanup?
 *   (b) Same but Tianna is in P1's BASE.
 *   (c) Main Deck AND trash both empty (Death Mark itself is on the chain): does Tianna save P1
 *       from the repeated burn-out; if P2 wins, immediately or at a cleanup?
 *   (d) Is the Shadow Clone still played in (a)/(b)? In (c)?
 *
 * Rules: 440.4 / 431.1.b / 431.2.a (burn as many as possible, Burn Out, burn the rest), 431.2.b
 * (recycle trash into deck), 431.2.c (choose an opponent to gain 1 — forced in 1v1), 431.2.d
 * (finish the burn), 471.1.a.1 + 194.1.d (a burn-out point is a plain gain, not a Conquer → the
 * Final-Point restriction does not apply), Tianna's static (only while at a battlefield), 431.3 /
 * 431.3.a (empty deck + empty trash → burn out again and again), 431.3.b (points from every burn
 * out AFTER the first in one sequence cannot be prevented by any means — beats Tianna), 431.3.c /
 * 431.3.c.1 (such a point reaching the Victory Score wins IMMEDIATELY), 472 + 323.1 + 321 (a first /
 * single burn-out point only wins at the next Cleanup, which cannot occur until the resolving spell
 * has finished).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIANNA = "sfd-060-221";
const DEATH_MARK = "ven-144-166";
const FILLER = "ogn-175-298"; // vanilla 3-Might unit — deck / trash stock

const clones = (game: Game) => [...game.p1.base(), ...game.p1.units("bf1")].filter((c) => c.startsWith("token-shadow-clone-"));

/**
 * Victory 8, P2 on 7, P1's turn with Death Mark + its cost. bf1 is P1's. Tianna at `where`
 * (a vanilla guard holds bf1 when she is in base so both boards have the same battlefields).
 * P1's deck = `deck` known fillers (top first d0…), trash = `trash` fillers (t0…). No auto-fill.
 * The Clone's destination prompt (base | bf1) is pre-answered "base".
 */
function board(where: "bf1" | "base", deck: number, trash: number) {
  let b = scenario()
    .fillDecks(false)
    .victoryScore(8)
    .points(P2, 7)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, where, TIANNA, "tianna")
    .hand(P1, DEATH_MARK, "dm")
    .script(P1, ["base"]);
  if (where === "base") {
    b = b.unit(P1, "bf1", { might: 2, name: "Guard" }, "guard");
  }
  for (let i = 0; i < deck; i++) {
    b = b.deckTop(P1, FILLER, `d${i}`);
  }
  for (let i = 0; i < trash; i++) {
    b = b.trash(P1, FILLER, `t${i}`);
  }
  return b;
}

async function castDeathMark(game: Game): Promise<void> {
  await game.p1.cast("dm");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["dm"]);
  expect(game.p2.points()).toBe(7); // nothing happens before resolution
  await game.settle();
}

describe("Tianna Crownguard × Death Mark burn-out — the first burn-out point is preventable, the repeats are not", () => {
  // ── (a) deck 1 / trash 5, Tianna at a battlefield ─────────────────────────────────────────

  test("(a) Burn 3 with 1 card: burn d0, Burn Out (the 6-card trash is recycled into the deck), then burn 2 more → deck 4, trash = those 2 + Death Mark (440.4, 431.2)", async () => {
    const game = await board("bf1", 1, 5).build();
    await castDeathMark(game);
    expect(game.p1.deck()).toHaveLength(4);
    const trash = game.p1.trash();
    expect(trash).toContain("dm");
    expect(trash).toHaveLength(3);
    // The six recycled cards (d0 + t0…t4) are now split 4 in deck / 2 re-burned — none vanished, none duplicated.
    const pool = [...game.p1.deck(), ...trash.filter((c) => c !== "dm")].sort();
    expect(pool).toEqual(["d0", "t0", "t1", "t2", "t3", "t4"]);
    expect(game.p2.deck()).toHaveLength(0); // untouched (it was empty: fillDecks(false))
    expect(game.violations()).toEqual([]);
  });

  test("(a) in 1v1 the 'choose an opponent' of 431.2.c is forced to P2 — P1 is never prompted for it; the only prompt in the whole resolution is the Clone's destination", async () => {
    const game = await scenario()
      .fillDecks(false)
      .victoryScore(8)
      .points(P2, 7)
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TIANNA, "tianna")
      .deckTop(P1, FILLER, "d0")
      .trash(P1, FILLER, "t0")
      .hand(P1, DEATH_MARK, "dm")
      .build(); // no script: observe every prompt
    await game.p1.cast("dm");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("base");
    const after = await game.settle();
    expect(after.reason).toBe("open");
  });

  test("(a) Tianna is at a battlefield → 'opponents can't gain points': the (first and only) burn-out point is prevented, P2 stays on 7 and the game goes on with P1 still to act", async () => {
    const game = await board("bf1", 1, 5).build();
    await castDeathMark(game);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.points()).toBe(0);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.zoneOf("tianna")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (b) same, Tianna in base ──────────────────────────────────────────────────────────────

  test("(b) Tianna in BASE: her lock is off → P2 gains the burn-out point and reaches 8; being a plain gain (not a Conquer) the Final-Point restriction does not stop it (471.1.a.1, 194.1.d)", async () => {
    const game = await board("base", 1, 5).build();
    await castDeathMark(game);
    expect(game.zoneOf("tianna")).toBe("base");
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(0);
  });

  test("(b) P2 (8 ≥ Victory Score, more than P1) wins the game — during P1's own turn (472, 323.1)", async () => {
    const game = await board("base", 1, 5).build();
    await castDeathMark(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
  });

  // Expected: a FIRST burn-out point does not win on the spot (431.3.c only covers later ones); the
  // win comes at the next Cleanup, and no Cleanup can occur while Death Mark is still resolving (321)
  // — so Death Mark finishes (burn 2 more, play the Clone, card to trash) and THEN P2 wins (472).
  // Actual: the engine declares the win mid-resolution — Death Mark is left on the chain zone and its
  // Clone-destination choice is never offered.
  test("(b) the win is checked at the Cleanup AFTER Death Mark has fully resolved — Death Mark should be in P1's trash, not stranded mid-resolution (321, 472, 431.3.c a contrario)", async () => {
    const game = await board("base", 1, 5).build();
    await castDeathMark(game);
    expect(game.winner()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dm")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(4); // the remaining 2 were burned before the cleanup
  });

  // ── (c) deck 0 / trash 0 — repeated burn out ──────────────────────────────────────────────

  test("(c) empty deck AND empty trash, Tianna at a battlefield: Burn Out #1's point is prevented, but the burn must continue from a still-empty deck → Burn Out #2's point 'cannot be prevented by any means' (431.3.b) → P2 reaches exactly 8", async () => {
    const game = await board("bf1", 0, 0).build();
    await castDeathMark(game);
    expect(game.zoneOf("tianna")).toBe("battlefield-bf1");
    expect(game.p2.points()).toBe(8); // 7 + 0 (blocked) + 1 (unpreventable) — Tianna only delays by one iteration
    expect(game.p1.points()).toBe(0);
    expect(game.p1.deck()).toEqual([]);
  });

  test("(c) that post-first burn-out point reaching the Victory Score wins IMMEDIATELY, no cleanup needed (431.3.c, 431.3.c.1): game over, P2 wins, Death Mark never finishes (still not in the trash)", async () => {
    const game = await board("bf1", 0, 0).build();
    await castDeathMark(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.zoneOf("dm")).not.toBe("trash"); // the game ended in the middle of its resolution
    expect(game.p1.trash()).toEqual([]);
  });

  test("(c) contrast — Tianna in BASE with deck 0 / trash 0: Burn Out #1 takes P2 to 8 but a first burn-out point does not win on the spot; the still-empty deck burns out AGAIN → 9, and THAT point wins immediately (431.3, 431.3.c)", async () => {
    const game = await board("base", 0, 0).build();
    await castDeathMark(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(9);
  });

  // ── (d) the Shadow Clone ──────────────────────────────────────────────────────────────────

  test("(d/a) after the burn (detour included) completes, Death Mark's next instruction plays the 0-Might Shadow Clone token for P1", async () => {
    const game = await board("bf1", 1, 5).build();
    await castDeathMark(game);
    const [tok, ...more] = clones(game);
    expect(tok).toBeDefined();
    expect(more).toEqual([]);
    expect(game.state(tok!)).toMatchObject({ baseMight: 0, controller: P1, isToken: true, might: 0, name: "Shadow Clone" });
  });

  test("(d/b) with Tianna in base the Clone is still played (Death Mark keeps resolving after the point) — and P2 has won", async () => {
    const game = await board("base", 1, 5).build();
    await castDeathMark(game);
    expect(clones(game)).toHaveLength(1);
    expect(game.winner()).toBe(P2);
  });

  // Expected: in (c) P2 wins immediately during the Burn (431.3.c.1); the game is over, so Death
  // Mark's second instruction is never reached and no Shadow Clone ever exists.
  // Actual: the engine records the win but still executes "Play a Shadow Clone token" afterwards.
  test("(d/c) the game ends mid-resolution in (c), so the Shadow Clone is never played (431.3.c.1)", async () => {
    const game = await board("bf1", 0, 0).build();
    await castDeathMark(game);
    expect(game.winner()).toBe(P2);
    expect(clones(game)).toEqual([]);
  });
});
