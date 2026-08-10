/**
 * Interaction: Kai'Sa, Evolutionary (ogn-112-298) · Unit · Mind · 6 · 6 Might
 *     "[Ganking] (I can move from battlefield to battlefield.)
 *      When I conquer, you may play a spell from your trash with Energy cost less than your points
 *      without paying its Energy cost. Then recycle it."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2+[chaos] · [Action]
 *     "Move a friendly unit and ready it."
 *
 * Board: P1's turn, Neutral Open, P1 on 3 points. P1 controls bfA with a lone ready Kai'Sa; bfB is
 * empty and uncontrolled. P2 has a ready vanilla unit R in base and Ride the Wind in hand.
 * Line: P1 makes the Ganking Standard Move Kai'Sa bfA → bfB.
 *
 * Questions:
 *  (a) One Move → one outstanding Cleanup (319.8; a Standard Move never uses the chain, 446.3.c).
 *      In that SAME Cleanup: task 4 (323.6) strips P1's control of the now-empty bfA (Open State, no
 *      Showdown/Combat there), task 6 stages a Showdown at bfB (323.8, Kai'Sa applied Contested —
 *      450 / 190.3.a.1), task 9 begins it (323.12, Neutral Open) with P1 gaining Focus (344/345).
 *      So bfA must already be uncontrolled at the instant the bfB Showdown opens.
 *  (b) P1 passes; P2 (Focus) plays Ride the Wind moving R base → bfA. R applies Contested to the
 *      uncontrolled bfA (450) and a Showdown is Staged there (323.8) — but 323.12 needs a NEUTRAL Open
 *      State and the bfB Showdown is still in progress (310.3), so it does NOT begin yet. The played
 *      card's chain closing passes Focus on at bfB (346 / 347.1.b) and resets the pass sequence.
 *  (c) Both pass at bfB → only P1's unit → P1 conquers bfB (348.2.a), 3 → 4. Back in Neutral Open the
 *      Cleanup (319.1) finds the Showdown still Staged at bfA (323.8.a) → it begins NOW, and P2 — who
 *      applied Contested — gains Focus although it is P1's turn (345). Both pass → P2 conquers bfA
 *      on P1's turn (+1). Never two Showdowns in progress at once, never a Combat anywhere.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-112-298";
const RIDE_THE_WIND = "ogn-173-298";

function board() {
  return scenario()
    .points(P1, 3)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", KAISA, "kaisa")
    .unit(P2, "base", { might: 2, name: "Runner R" }, "r")
    .resources(P2, { energy: 2, power: { chaos: 1 } }) // exactly Ride the Wind
    .hand(P2, RIDE_THE_WIND, "rtw");
}

const activeShowdowns = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** Assert the "never two showdowns / never a combat" invariant at the current instant. */
function expectAtMostOneNonCombatShowdown(game: Game): void {
  const sds = activeShowdowns(game);
  expect(sds.length).toBeLessThanOrEqual(1);
  for (const s of sds) {
    expect(s.isCombatShowdown).toBe(false);
  }
}

/** (a) done: Kai'Sa ganked bfA → bfB; the bfB showdown is open with P1 holding Focus. */
async function afterGank(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("gank", "kaisa")).toBe(true);
  await game.p1.gank("kaisa", "bfB");
  expectAtMostOneNonCombatShowdown(game);
  return game;
}

/** (b) done: P1 passed Focus, P2 cast Ride the Wind on R → bfA, both passed priority, it resolved. */
async function afterRideTheWind(): Promise<Game> {
  const game = await afterGank();
  await game.p1.passFocus();
  expectAtMostOneNonCombatShowdown(game);
  await game.p2.cast("rtw", { targets: "r" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfA");
  }
  expectAtMostOneNonCombatShowdown(game);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expectAtMostOneNonCombatShowdown(game);
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

/** (c) first half: both pass at bfB → it closes; Kai'Sa's optional conquer trigger is declined. */
async function afterBfBCloses(): Promise<Game> {
  const game = await afterRideTheWind();
  await game.p1.passFocus();
  expectAtMostOneNonCombatShowdown(game);
  await game.p2.passFocus();
  expectAtMostOneNonCombatShowdown(game);
  // Kai'Sa: "When I conquer, you MAY play a spell from your trash…" — nothing to play; decline.
  if (game.decision()?.kind === "yes-no") {
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
  }
  expectAtMostOneNonCombatShowdown(game);
  return game;
}

describe("Kai'Sa ganks away from her own battlefield; Ride the Wind stages a second showdown behind her", () => {
  // ── (a) the one Cleanup after the Ganking move ────────────────────────────────────────────────

  test("(a) the Ganking Standard Move puts nothing on the chain and exhausts Kai'Sa; she is at bfB (446.3.c, 810, standard-move cost)", async () => {
    const game = await afterGank();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("kaisa")).toBe("bfB");
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.cardsAt("battlefield-bfA")).toEqual([]);
  });

  test("(a) at the instant the bfB Showdown opens (its very first Focus decision, nobody has passed) bfA is ALREADY uncontrolled — task 4 (323.6 / 190.4.c) ran in the same Cleanup as tasks 6/9", async () => {
    const game = await afterGank();
    // The showdown has only just begun: P1 holds Focus, no passes recorded yet.
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false, passedPlayers: [] });
    // …and bfA has already lapsed.
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
  });

  test("(a) Kai'Sa applied Contested to the uncontrolled bfB for P1; the Showdown there is NON-combat (no opposing units → task 7 stages no Combat) and P1, the applier, has Focus (450, 323.8, 323.12, 344.2, 345)", async () => {
    const game = await afterGank();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.p1.points()).toBe(3); // nothing scored yet — the showdown must close first
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Ride the Wind into the vacated bfA during the bfB showdown ─────────────────────────────

  test("(b) after P1 passes, P2 holds Focus at bfB and Ride the Wind ([Action]) is legal for P2; R is its only legal target and bfA is an offered destination (342, 347.1)", async () => {
    const game = await afterGank();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfB", focusPlayer: P2, passedPlayers: [P1] });
    expect(game.p2.can("cast", "rtw")).toBe(true);
    const offered = (game.p2.option("cast", "rtw")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["r"]);
    await game.p2.cast("rtw", { targets: "r" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P2);
      expect(d.options.map((o) => o.key)).toContain("battlefield-bfA");
      await game.p2.pick("battlefield-bfA");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2 })]);
    expect(game.locationOf("r")).toBe("base"); // not moved until it resolves
    expectAtMostOneNonCombatShowdown(game);
  });

  test("(b) Ride the Wind resolves: R is at bfA READY, and P2 has applied Contested to the uncontrolled, previously-uncontested bfA (450 / 190.3.a.1)", async () => {
    const game = await afterRideTheWind();
    expect(game.locationOf("r")).toBe("bfA");
    expect(game.state("r").isReady).toBe(true);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  });

  test("(b) the Showdown staged at bfA does NOT begin while the bfB Showdown is in progress — 323.12 needs a NEUTRAL Open State (310.3): still exactly one showdown, at bfB", async () => {
    const game = await afterRideTheWind();
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: false });
    expect((game.gameState.interaction?.showdownStack ?? []).some((s) => s.battlefieldId === "bfA")).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("(b) the played card's chain closing passes Focus on at bfB: P1 now holds Focus and the pass sequence is reset (346, 347.1.b, 348)", async () => {
    const game = await afterRideTheWind();
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfB", focusPlayer: P1, passedPlayers: [] });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  // ── (c) bfB closes for P1, THEN bfA opens for P2 on P1's turn ─────────────────────────────────

  test("(c) both pass at bfB → only P1's Kai'Sa remains → P1 establishes control = Conquer, 3 → 4 (348.2.a / 348.2.a.1); Kai'Sa's 'When I conquer, you may…' is a declinable P1 prompt", async () => {
    const game = await afterRideTheWind();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfB"]);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.seat).toBe(P1);
      expect(d.prompt).toMatch(/Kai'Sa/);
      await game.p1.no();
    }
    expect(game.p1.trash()).toEqual([]); // no spell was (or could be) replayed
    expectAtMostOneNonCombatShowdown(game);
  });

  test("(c) once bfB has closed and the state is Neutral Open again, the Cleanup begins the STILL-STAGED bfA Showdown (323.8.a: Contested + P2's unit present) — P2, who applied Contested, gains Focus although it is P1's turn (319.1, 323.12, 345)", async () => {
    const game = await afterBfBCloses();
    expect(game.turnPlayer()).toBe(P1);
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: false, passedPlayers: [] });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([]);
  });

  test("(c) both pass at bfA → only P2's R remains → P2 establishes control and CONQUERS bfA on P1's turn, scoring 1; final: bfB P1, bfA P2, P1 4 pts, P2 1 pt, back to P1's Neutral Open main phase (348.2.a, 469.1)", async () => {
    const game = await afterBfBCloses();
    await game.p2.passFocus();
    expectAtMostOneNonCombatShowdown(game);
    await game.p1.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P2]).toEqual(["bfA"]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.locationOf("kaisa")).toBe("bfB");
    expect(game.locationOf("r")).toBe("bfA");
    expect(game.violations()).toEqual([]);
  });

  // ── contrast / invariants ─────────────────────────────────────────────────────────────────────

  test("contrast: at no step of the whole line are two Showdowns in progress at once, no Showdown is ever a Combat Showdown, and no unit ever takes damage (no battlefield ever had opposing units)", async () => {
    const game = await board().build();
    const check = () => {
      expectAtMostOneNonCombatShowdown(game);
      expect(game.state("kaisa").damage).toBe(0);
      expect(game.state("r").damage).toBe(0);
    };
    check();
    await game.p1.gank("kaisa", "bfB");
    check();
    await game.p1.passFocus();
    check();
    await game.p2.cast("rtw", { targets: "r" });
    check();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bfA");
    }
    check();
    await game.p2.passPriority();
    check();
    await game.p1.passPriority();
    check();
    await game.p1.passFocus();
    check();
    await game.p2.passFocus();
    check();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    check();
    await game.p2.passFocus();
    check();
    await game.p1.passFocus();
    check();
    await game.settle();
    check();
    // Kai'Sa and R never shared a battlefield.
    expect(game.cardsAt("battlefield-bfA")).toEqual(["r"]);
    expect(game.cardsAt("battlefield-bfB")).toEqual(["kaisa"]);
    expect(game.zoneOf("kaisa")).toBe("battlefield-bfB");
    expect(game.zoneOf("r")).toBe("battlefield-bfA");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P2 simply passes at bfB instead of playing Ride the Wind, P1 conquers bfB (4 pts), bfA stays uncontrolled and no second showdown ever opens; P2 scores nothing", async () => {
    const game = await afterGank();
    await game.p1.passFocus();
    await game.p2.passFocus();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toContain("rtw");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });
});
