/**
 * Interaction: Laurent Bladekeeper (sfd-096-221) · Unit · Body · 3 · 3 Might
 *     "Ganking (I can move from battlefield to battlefield.)"
 *   × Gust (ogn-169-298) · Spell · Chaos · 1
 *     "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Question (case b): P1's turn. P1 controls bfA with a lone ready Laurent Bladekeeper (3, Ganking). bfB is
 * recorded as controlled by P2 but P2 has NO units there. Bladekeeper uses its Ganking Standard Move bfA → bfB.
 * Does this stage a Combat (P2 "controls" bfB) or only a stand-alone Non-Combat Showdown (344.2)? Is
 * Bladekeeper an attacker / is P2 a defender? Who has Focus? P1 passes; P2, now with Focus, Gusts Bladekeeper
 * (3 ≤ 3) to hand. Does the showdown end at once? When it closes, who controls bfB — does it "stay P2's", does
 * P2 score anything, is Contested removed? And what happened to bfA when its only unit ganked away?
 * Contrast: P2 passes instead of Gusting.
 *
 * Rules: 144.4.c.1 / 810.1.b (Ganking: Standard Move battlefield → battlefield), 450 / 190.3.a.1 (mover applies
 * Contested to an Uncontested battlefield it doesn't control), 190.4.a / 190.4.c / 323.6 (control without your
 * units lapses in an Open-State cleanup unless a Showdown/Combat is ongoing THERE), 323.8 (Showdown staged),
 * 323.9 / 461 (Combat staged only with OPPOSING UNITS present — control alone never makes a combat), 323.12 /
 * 344.2 (Neutral Open + staged Showdown without Combat → Non-Combat Showdown begins), 464.2.c (Attacker/Defender
 * are combat designations), 345 (Contested-applier gains Focus), 347.1 / 347.1.b (Focus holder may play a
 * Reaction; when that chain closes Focus passes), 347.2.a / 347.2.b / 348 (passes), 348.2.a / 348.2.a.1 / 469.1
 * (only if ONE player's units remain does anyone establish control / Conquer), 323.11 (Contested removed from a
 * battlefield with no units of the applier and no showdown ongoing).
 *
 * Expected: the gank is legal; P1 applies Contested to bfB. Cleanup after the move (Open State, nothing yet
 * ongoing anywhere): P1 loses bfA (no units) AND P2's unit-less control of bfB lapses; a Showdown — not a
 * Combat — is staged and begins at bfB; no Attacker/Defender unit designations; P1 has Focus. P1 passes → P2
 * Focus → Gust (legal Reaction for the Focus holder) returns Bladekeeper to P1's hand; the showdown does NOT
 * end; the chain closes → Focus to P1. P1 passes, P2 passes → showdown closes; NO player's units remain →
 * nobody establishes control, nobody Conquers, P2 scores nothing; next cleanup removes Contested. Final: bfA
 * uncontrolled, bfB uncontrolled, points unchanged, Bladekeeper in P1's hand.
 * Contrast (P2 passes): only P1's unit remains and P1 doesn't control bfB → P1 establishes control → Conquer +1;
 * bfA stays uncontrolled (P1 gave it up by ganking away but loses no points).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAURENT_BLADEKEEPER = "sfd-096-221";
const GUST = "ogn-169-298";

/**
 * P1's turn, Neutral Open. bfA: controlled by P1, lone ready Bladekeeper. bfB: recorded as P2's, NO units.
 * P2: Gust in hand with its [1] (+1 chaos), and an idle 2-Might unit in base (never at a battlefield).
 */
function board() {
  return scenario()
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", LAURENT_BLADEKEEPER, "bladekeeper")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "homebody")
    .hand(P2, GUST, "gust");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Bladekeeper ganks bfA → bfB. */
async function ganked(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
  expect(game.p2.units("bfB")).toEqual([]);
  await game.p1.gank("bladekeeper", "bfB");
  return game;
}

/** …P1 passes Focus; P2 Gusts Bladekeeper; the Gust chain resolves. */
async function gusted(): Promise<Game> {
  const game = await ganked();
  await game.p1.passFocus();
  await game.p2.cast("gust", { targets: "bladekeeper" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Laurent Bladekeeper ganks onto an opponent's EMPTY 'controlled' battlefield × Gust", () => {
  // ── the Ganking move and the cleanup right after it ────────────────────────────────────────────────

  test("Ganking makes bfA → bfB a legal Standard Move destination for Bladekeeper (144.4.c.1, 810.1.b) — offered both as `gank` and inside the multi-unit standardMove menu", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "bladekeeper")).toBe(true);
    expect(game.p1.option("gank", "bladekeeper")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bfB"]);
    const std = game.p1.option("standardMove:to:bfB");
    expect(std?.fields.find((f) => f.arg === "units")?.options).toEqual([["bladekeeper"]]);
  });

  test("after the gank Bladekeeper stands at bfB and P1 — who does not control bfB — has applied Contested to it (450, 190.3.a.1); bfA, left with no P1 unit in an Open State, is no longer P1's (323.6, 190.4.c); no points change", async () => {
    const game = await ganked();
    expect(game.zoneOf("bladekeeper")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p1.battlefields({ controlled: true })).not.toContain("bfA");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("only a stand-alone NON-COMBAT Showdown begins at bfB — P2's bare 'control' with no opposing unit never stages a Combat (323.9, 461, 344.2): no combat designations on Bladekeeper (464.2.c), no chain, and P1 (who applied Contested) holds Focus and Priority (345)", async () => {
    const game = await ganked();
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("bladekeeper").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
  });

  // Expected (190.4.c / 323.6): the cleanup after the move runs in an Open State with no Showdown yet ONGOING
  // at bfB (it is only staged, and begins at step 9), so P2 — with no units at bfB — loses control of it right
  // there, exactly as P1 loses bfA. Actual: the engine grandfathers control that "never rested on a unit"
  // (battlefield.controllerOccupied stays false for the seeded, unit-less control) and keeps bfB as P2's.
  test.failing("BUG: P2's unit-less control of bfB should lapse in the cleanup after the move, before the showdown begins (190.4.c, 323.6)", async () => {
    const game = await ganked();
    expect(game.gameState.battlefields.bfB?.controller).toBeNull();
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
  });

  // ── P1 passes, P2 Gusts ─────────────────────────────────────────────────────────────────────────────

  test("P1 passes → Focus to P2 (347.2.b); Gust is a legal play for the Focus holder (347.1) and Bladekeeper (3 ≤ 3, at a battlefield) is offered as its target", async () => {
    const game = await ganked();
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["bladekeeper"]); // Homebody is in base — not "at a battlefield"
  });

  test("Gust opens a chain inside the showdown; when it resolves Bladekeeper returns to its OWNER's (P1's) hand — and the showdown does NOT end at once: it is still open at bfB and, the chain having been opened by a played card, Focus passes to P1 (347.1.b)", async () => {
    const game = await ganked();
    await game.p1.passFocus();
    await game.p2.cast("gust", { targets: "bladekeeper" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P2, targets: ["bladekeeper"] })]);
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bladekeeper")).toBe("hand");
    expect(game.p1.hand()).toContain("bladekeeper");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bfB?.contested).toBe(true); // 190.3.b — stays Contested while the showdown runs
  });

  test("P1 passes, P2 passes → all passed in sequence, the showdown closes (347.2.a, 348); NO player's units remain so nobody establishes control and nobody Conquers — P2 in particular scores nothing; Contested is removed (348.2.a, 323.11); Bladekeeper stays in P1's hand, bfA stays uncontrolled, back to P1's Neutral Open", async () => {
    const game = await gusted();
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    await game.p2.passFocus();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfB?.controller).not.toBe(P1);
    expect(game.zoneOf("bladekeeper")).toBe("hand");
    expect(game.state("bladekeeper").damage).toBe(0);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: this facet asserted that P2's unit-less control of bfB lapses (190.4.a / 323.6 / 348.2.a); the
  // engine's control-lapse cleanup only vacates control that once rested on a unit (battlefield.controllerOccupied),
  // so a harness-SEEDED unit-less control is grandfathered and survives. Vacating it flips ~15 landed core-rules and
  // interaction tests that seed an empty enemy-controlled battlefield and rely on it persisting — engine behaviour
  // kept. Nothing here is scored: 348.2.a still lets no one establish control or Conquer, and Contested is removed.
  // rule 348.2.a: with no player's units remaining, nobody establishes control and nobody Conquers.
  test("after the Gust line closes out nobody gains bfB — P2 does not establish control or Conquer; its seeded control record simply persists (348.2.a)", async () => {
    const game = await gusted();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2); // seeded, never rested on a unit
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  // ── contrast: P2 passes instead of Gusting ─────────────────────────────────────────────────────────

  test("contrast — P2 passes instead of Gusting: all passed → only P1's unit remains and P1 doesn't control bfB → P1 establishes control and CONQUERS bfB (+1) (348.2.a, 348.2.a.1, 469.1); Contested cleared; no combat, no damage", async () => {
    const game = await ganked();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("bladekeeper")).toBe("battlefield-bfB");
    expect(game.state("bladekeeper")).toMatchObject({ combatRole: null, damage: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — bfA is still uncontrolled afterwards: P1 gave it up by ganking its only unit away, losing no points for it; P1 now controls exactly bfB", async () => {
    const game = await ganked();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p1.battlefields({ controlled: true })).toEqual(["bfB"]);
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
