/**
 * Interaction: Shakedown (ogn-033-298) cast by a player with an EMPTY Main Deck × Vanguard Sergeant (ogn-219-298)
 *              — the victim's controller elects the draw and Burns Out the CASTER.
 *
 *   Shakedown — Spell (Reaction) · Fury · 2 + [fury]
 *     "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *   Vanguard Sergeant — Unit · Order · 4 · 4 Might.
 *
 * Rules: 413.4 / 431.1.a (draw more than the deck holds → draw what you can, Burn Out, draw the rest), 431.2.b–d
 * (Burn Out: recycle trash → deck, the burning-out player chooses an opponent to gain 1, then finish the draw),
 * 431.3 / 431.3.a (empty trash → deck stays empty → the retry burns out AGAIN), 431.3.b (points after the first
 * cannot be prevented), 431.3.c / 431.3.c.1 (such a point reaching the Victory Score with more than any opponent
 * wins IMMEDIATELY, no Cleanup), 431.5 (Burn Out is a replacement effect), 321 / 323.1 (win check: ≥ Victory
 * Score AND more than any opponent — 7-7 is nothing), 319.5 / 323.5 (lethal damage → dies at the next Cleanup),
 * 472 (drawn cards go to hand).
 *
 * Question. Victory 8. P2 (on 7, P2's turn) casts Shakedown on P1's Sergeant; P2's Main Deck is EMPTY. P1 is on 6.
 *  (a) P2's trash also empty; P1 elects "have you draw 2": how many Burn Outs, who gets the points, does 7-7
 *      matter, who wins and when, any damage to the Sergeant, where is Shakedown at game end?
 *  (b) P2's trash = [T1, T2]: outcome of electing the draw.
 *  (c) P1 declines: 6 damage, no draw, no Burn Out.
 *  (d) WHEN does P1 elect — at finalization or at resolution (can P1 see P2's empty deck first)?
 *
 * Expected. (d) at RESOLUTION, by the target's controller, with P2's public deck/trash counts visible.
 * (a) Burn Out #1 → P1 7 (tie, no win), retry → Burn Out #2 → P1 8 > 7 → P1 wins immediately mid-spell; exactly
 * two; Sergeant undamaged; Shakedown still the resolving item (never reaches P2's trash); P2 drew nothing.
 * (b) one Burn Out: recycle T1,T2, P1 6→7, P2 draws both (deck 0); Sergeant undamaged; Shakedown → P2's trash;
 * 7-7 → game continues. (c) Sergeant takes 6 (lethal) and dies; no draw, no Burn Out; 6-7.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHAKEDOWN = "ogn-033-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla stock for decks / P2's trash

/**
 * P2's turn 2, Open state. Victory 8; P1 6, P2 7. P2: exactly Shakedown's cost, Main Deck EMPTY, trash = `p2Trash`
 * (aliases t1, t2, …). P1: Vanguard Sergeant at bf1 and a small real deck. No deck auto-fill.
 */
function board(p2Trash: readonly string[] = []) {
  let s = scenario()
    .turn(2)
    .active(P2)
    .fillDecks(false)
    .victoryScore(8)
    .points(P1, 6)
    .points(P2, 7)
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sarge")
    .deck(P1, [FILLER, FILLER, FILLER])
    .hand(P2, SHAKEDOWN, "sd");
  p2Trash.forEach((def, i) => {
    s = s.trash(P2, def, `t${i + 1}`);
  });
  return s;
}

/** P2 casts Shakedown on the Sergeant and everyone passes → the "unless" election is pending. */
async function castAndResolve(p2Trash: readonly string[] = []): Promise<Game> {
  const game = await board(p2Trash).build();
  expect(game.p2.deck()).toEqual([]);
  await game.p2.cast("sd", { targets: "sarge" });
  await game.settle();
  return game;
}

/** Answer the pending election: `true` = "have the caster draw 2", `false` = "deal 6 to it". */
async function elect(game: Game, letDraw: boolean): Promise<void> {
  const d = game.decision();
  expect(d?.seat).toBe(P1);
  if (d?.kind === "yes-no") {
    await (letDraw ? game.p1.yes() : game.p1.no());
  } else if (d?.kind === "pick") {
    const opt = d.options.find((o) => /draw/i.test(o.label) === letDraw);
    expect(opt).toBeDefined();
    await game.p1.pick(opt?.key as string);
  } else {
    throw new Error(`expected P1's election prompt, got ${d?.kind} for ${d?.seat}`);
  }
  await game.settle();
}

describe("Shakedown from an empty deck — the victim's controller elects the draw and burns the caster out", () => {
  // ── (d) when / by whom the election is made ───────────────────────────────────────────────

  test("(d) nothing is asked at finalization: right after the cast it is simply P2's own priority on the pending Shakedown (P2 pool spent: 2 + [fury])", async () => {
    const game = await board().build();
    await game.p2.cast("sd", { targets: "sarge" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sd", controller: P2, targets: ["sarge"] })]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(d) the election is made AS SHAKEDOWN RESOLVES, by the target's controller P1 — with P2's empty deck and trash publicly countable first", async () => {
    const game = await castAndResolve();
    const d = game.decision();
    expect(d).toMatchObject({ seat: P1, timing: "RES" });
    expect(d?.source?.cardId).toBe("sd");
    expect(["pick", "yes-no"]).toContain(d?.kind as string);
    const seen = game.p1.listZones({ all: true });
    expect(seen.find((z) => z.zone === "mainDeck" && z.owner === P2)?.count ?? 0).toBe(0);
    expect(seen.find((z) => z.zone === "trash" && z.owner === P2)?.count ?? 0).toBe(0);
    expect(game.state("sarge").damage).toBe(0); // nothing has happened yet
    expect([game.p1.points(), game.p2.points()]).toEqual([6, 7]);
  });

  // ── (a) empty deck AND empty trash: the double Burn Out wins it for P1 ────────────────────

  test("(a) P1 elects the draw: P2 burns out twice (empty trash → deck stays empty → retry burns out again) — P1 6→7→8 and WINS IMMEDIATELY, mid-spell, on P2's own turn (431.3, 431.3.c.1)", async () => {
    const game = await castAndResolve();
    await elect(game, true);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("(a) exactly TWO Burn Outs — the first point only ties 7-7 (no win: 323.1 needs MORE than any opponent), the second reaches 8 > 7; the loop stops there, no overshoot to 9", async () => {
    const game = await castAndResolve();
    await elect(game, true);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.points()).not.toBe(9);
    // In a Duel the "chosen opponent" is forced: every Burn Out point went to P1, none to P2.
    expect(game.p2.points()).toBe(7);
  });

  test("(a) the Sergeant takes NO damage (the draw branch replaced 'deal 6'), P2 drew nothing (deck and hand still empty), and Shakedown is still the resolving item — never in P2's trash", async () => {
    const game = await castAndResolve();
    await elect(game, true);
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(0);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).not.toContain("sd");
    expect(game.zoneOf("sd")).toBe("chain");
  });

  // ── (b) empty deck, trash of two: one Burn Out, draw completes, 7-7 ───────────────────────

  test("(b) trash [T1, T2]: ONE Burn Out — trash recycled into the deck, P1 6→7, then P2 draws both (hand = {T1, T2}, deck 0); not an immediate win", async () => {
    const game = await castAndResolve([FILLER, FILLER]);
    expect(game.p2.trash().toSorted()).toEqual(["t1", "t2"]);
    await elect(game, true);
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand().toSorted()).toEqual(["t1", "t2"]);
    expect(game.p2.deck()).toEqual([]);
  });

  test("(b) the Sergeant is undamaged, Shakedown finishes resolving into P2's trash (now the only card there), and at 7-7 the game simply continues in P2's Main Phase", async () => {
    const game = await castAndResolve([FILLER, FILLER]);
    await elect(game, true);
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.p2.trash()).toEqual(["sd"]);
    expect(game.winner()).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) P1 declines ───────────────────────────────────────────────────────────────────────

  test("(c) P1 declines: the 4-Might Sergeant is dealt 6 (lethal) and dies at the next Cleanup; no draw, no Burn Out, scores stay 6-7", async () => {
    const game = await castAndResolve();
    await elect(game, false);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()).toEqual([]);
    expect([game.p1.points(), game.p2.points()]).toEqual([6, 7]);
    expect(game.isOver()).toBe(false);
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(c) with a non-empty trash declining is the same: 6 damage, nothing recycled or drawn, trash still [T1, T2] + Shakedown", async () => {
    const game = await castAndResolve([FILLER, FILLER]);
    await elect(game, false);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash().toSorted()).toEqual(["sd", "t1", "t2"]);
    expect([game.p1.points(), game.p2.points()]).toEqual([6, 7]);
  });
});
