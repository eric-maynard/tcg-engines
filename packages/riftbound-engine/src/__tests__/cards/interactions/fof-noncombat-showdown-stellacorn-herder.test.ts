/**
 * Interaction: Fight or Flight (ogn-168-298) · Spell · Chaos · 2 · [Hidden] [Action]
 *     "Move a unit from a battlefield to its base."
 *   × Stellacorn Herder (sfd-048-221) · Unit · Calm · 4 · 3 Might
 *     "When I move, draw 1."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2+[chaos] · [Action]
 *     "Move a friendly unit and ready it."
 *
 * Question: P1's turn, Neutral Open; bfC is empty and uncontrolled. P1 Standard-Moves Herder
 * base → bfC. Herder's draw trigger resolves and a Non-Combat Showdown opens with P1 holding Focus;
 * P1 passes. P2, now with Focus, plays Fight or Flight on Herder.
 *   (a) Legal for P2, who has no unit in that showdown?
 *   (b) Herder goes back to base: does "When I move" fire AGAIN for a forced enemy-effect move?
 *       Is Herder still exhausted?
 *   (c) Does the showdown end immediately? Does P1 still conquer/score bfC when it closes? bfC's
 *       status afterwards?
 *   (d) After Fight or Flight's chain closes Focus returns to P1 — may P1 Ride-the-Wind a different
 *       friendly unit base → bfC inside this same showdown and still conquer when everyone passes?
 *       Does that arrival start a second showdown?
 *   (e) Contrast: P2 simply passes.
 *
 * Rules: 144.2 (exhaust = the Standard Move's cost), 342 / 347.1 (Focus holder may play a legally
 * timed card — Actions are showdown-legal), 347.1.b (chain closes → Focus passes on), 347.2.a / 348
 * (showdown ends only when all pass in sequence), 348.2.a / 348.2.a.1 (only-one-player's-units-remain
 * → control → Conquer), 446.1 / 449 (an effect relocation is a Move), 456.1 (only Recalls skip move
 * triggers), 190.3.a.1 / 190.3.b (already Contested + showdown ongoing → arrival stages nothing new),
 * 190.3.b.1 / 323.11 (Contested removed in Cleanup when nobody's units remain), 345.
 *
 * Expected: (a) yes; Herder is the legal target. (b) fires again — P1 draws a 2nd card; Herder stays
 * exhausted. (c) showdown continues with Focus back on P1; when all pass nobody's units remain → no
 * control, no point; bfC ends uncontested and uncontrolled. (d) yes: runner arrives readied, same
 * showdown, Focus → P2; all pass → P1 conquers bfC, scores 1. (e) P1 conquers, scores 1, drew exactly 1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HERDER = "sfd-048-221";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const RIDE_THE_WIND = "ogn-173-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. bfC uncontrolled and empty. P1: Herder (ready) + an EXHAUSTED vanilla Runner in base,
 * Ride the Wind in hand with exactly 2+[chaos]. P2: a vanilla unit at home (never at bfC), Fight or
 * Flight in hand with exactly 2 energy.
 */
function board() {
  return scenario()
    .battlefield("bfC", { controller: null })
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", HERDER, "herder")
    .unit(P1, "base", { might: 2, name: "P1 Runner" }, "runner", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2home")
    .hand(P2, FIGHT_OR_FLIGHT, "fof")
    .hand(P1, RIDE_THE_WIND, "ride");
}

function showdowns(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/** Herder moved to bfC, its draw trigger resolved, showdown open, P1 passed Focus → P2 holds Focus. */
async function p2HasFocus(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.hand()).toEqual(["ride"]);
  await game.p1.move("herder", "bfC");
  expect(game.state("herder").isExhausted).toBe(true); // 144.2 — the move's cost
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // draw 1 resolves
  expect(game.p1.hand()).toHaveLength(2);
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 }); // 345
  expect(showdowns(game)).toHaveLength(1);
  expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", isCombatShowdown: false, focusPlayer: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
  return game;
}

/** …P2 cast Fight or Flight on Herder and it resolved (both passed); Herder's 2nd move trigger is pending. */
async function fofResolved(): Promise<Game> {
  const game = await p2HasFocus();
  await game.p2.cast("fof", { targets: "herder" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("fof")).toBe("trash");
  return game;
}

/** …and that 2nd draw trigger resolved too → Focus is back with P1 in the same showdown. */
async function focusBackToP1(): Promise<Game> {
  const game = await fofResolved();
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
  return game;
}

describe("Fight or Flight into a Non-Combat Showdown staged by Stellacorn Herder", () => {
  // ── (a) legality ─────────────────────────────────────────────────────────────────────────────

  test("(a) P2 — holding Focus with NO unit at bfC — is offered Fight or Flight ([Action] is showdown-legal); Herder is the legal target, base units are not (342, 347.1)", async () => {
    const game = await p2HasFocus();
    expect(game.p2.units("bfC")).toEqual([]);
    expect(game.p2.can("cast", "fof")).toBe(true);
    const offered = (game.p2.option("cast", "fof")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["herder"]);
    expect(offered).not.toContain("runner"); // in base — not "from a battlefield"
    expect(offered).not.toContain("p2home");
    await game.p2.cast("fof", { targets: "herder" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([["fof", P2]]);
  });

  // ── (b) the forced move home ─────────────────────────────────────────────────────────────────

  test("(b) Fight or Flight puts Herder back in ITS (P1's) base and 'When I move' fires AGAIN — an effect-move is still a Move (446.1, 449, 456.1): a P1-controlled trigger goes on the chain", async () => {
    const game = await fofResolved();
    expect(game.zoneOf("herder")).toBe("base");
    expect(game.p1.base()).toContain("herder");
    expect(game.p2.base()).not.toContain("herder");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", controller: P1, triggered: true })]);
  });

  test("(b) that second trigger draws P1 (Herder's controller) one more card — 2 drawn in total; P2 draws nothing", async () => {
    const game = await fofResolved();
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(3); // ride + 1st draw + 2nd draw
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("(b) Herder stays EXHAUSTED: the Standard Move's cost is never refunded and the effect-move neither exhausts nor readies (144.2)", async () => {
    const game = await focusBackToP1();
    expect(game.state("herder")).toMatchObject({ zone: "base", isExhausted: true, damage: 0 });
  });

  // ── (c) the showdown goes on, then closes empty ──────────────────────────────────────────────

  test("(c) the showdown does NOT end when Herder leaves: bfC stays Contested, the same single showdown is active and Focus is back with P1 after the chain closed (190.3.b, 347.1.b)", async () => {
    const game = await focusBackToP1();
    expect(game.cardsAt("battlefield-bfC")).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, controller: null });
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.p1.can("passFocus")).toBe(true);
  });

  test("(c) once both pass, NOBODY's units remain → no control is established, no conquer, no point for anyone; Contested is cleared and bfC stays uncontrolled (348.2.a, 323.11, 190.3.b.1)", async () => {
    const game = await focusBackToP1();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bfC?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(3); // Herder drew exactly twice
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    // and it stays uncontrolled into P2's turn
    await game.advanceTurn();
    expect(game.gameState.battlefields.bfC?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  // ── (d) YES-side: Ride the Wind a second unit in during the same showdown ────────────────────

  test("(d) with Focus back, P1 may play Ride the Wind ([Action]) on the exhausted Runner in base: it arrives at bfC READIED; no second showdown opens — the same one continues with Focus → P2 (190.3.a.1, 347.1.b)", async () => {
    const game = await focusBackToP1();
    expect(game.p1.can("cast", "ride")).toBe(true);
    const offered = (game.p1.option("cast", "ride")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("runner");
    await game.p1.cast("ride", { targets: "runner" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bfC"); // destination, if asked (only one battlefield exists)
    }
    expect(game.zoneOf("runner")).toBe("battlefield-bfC");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.chain()).toEqual([]); // the vanilla Runner has no move trigger
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P2 });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, controller: null });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    expect(game.p1.points()).toBe(0); // nothing scored yet
  });

  test("(d) …and when everyone then passes only P1's Runner remains → P1 establishes control = Conquer, scores 1; Herder is home, exhausted (348.2.a, 348.2.a.1)", async () => {
    const game = await focusBackToP1();
    await game.p1.cast("ride", { targets: "runner" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bfC");
    }
    await game.p2.passFocus();
    await game.p1.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bfC")).toEqual(["runner"]);
    expect(game.state("herder")).toMatchObject({ zone: "base", isExhausted: true });
    expect(game.p1.hand()).toHaveLength(2); // ride spent; two Herder draws
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (e) contrast: P2 just passes ─────────────────────────────────────────────────────────────

  test("(e) contrast: if P2 simply passes after P1, the showdown closes with Herder alone at bfC → P1 conquers and scores 1; Herder drew exactly 1; Fight or Flight stays in P2's hand", async () => {
    const game = await p2HasFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bfC")).toEqual(["herder"]);
    expect(game.state("herder").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(2); // ride + exactly one draw
    expect(game.p2.hand()).toContain("fof");
    expect(game.p2.energy()).toBe(2);
  });
});
