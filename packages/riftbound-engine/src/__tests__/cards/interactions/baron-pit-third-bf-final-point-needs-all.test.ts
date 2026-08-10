/**
 * Interaction: Baron Nashor (unl-147-219) · Unit · Chaos · 10 + [chaos]×3 · 12 Might
 *     "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you
 *      do, I enter there. (It has "Units can move here from anywhere.") I can't be chosen by enemy spells
 *      and abilities. Other friendly units have +2 [Might]."
 *   × Baron Pit (unl-t01) · Battlefield token · "Units can move here from anywhere."
 *   × Tryndamere, Barbarian (ogn-034-298) · Champion Unit · Fury · 7 · 8 Might
 *     "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score
 *      1 point."
 *
 * Rules: 485.4 (Duel Battlefield Count 2), 172 (the Mode sets the STARTING number of battlefields), 187.9
 * (the Baron Pit token is a battlefield), 471.1.b / 471.1.b.1 (at Victory−1 a CONQUER point needs "every
 * Battlefield" scored this turn — else draw 1), 471.1.a.1 (non-Conquer points are unrestricted), 469.1 /
 * 469.2 (Conquer / Hold), 470 (once per battlefield per turn), 348.2.a / 348.2.a.1 (sole player left at a
 * Non-Combat Showdown establishes control → Conquer), 190.3.a (a unit becoming present at a battlefield you
 * don't control → Contested), 315.2.b (Hold in the Scoring Step), 323.1 (≥ Victory Score and more than any
 * opponent → win).
 *
 * Q: In a 1v1 Duel (2 battlefields) Baron Nashor puts a THIRD battlefield on the board. Does 471.1.b.1's
 *    "every Battlefield" mean every battlefield ON THE BOARD (3) or the Mode constant (2)?
 *   NO-side  P2 played Baron on an earlier turn (P2's Baron sits at the Pit, P2 controls it). P1 at 6 holds
 *            bfA (→7), then conquers bfB. → The Pit is on the board and unscored → P1 DRAWS 1, stays at 7,
 *            no win. Score triggers at bfB still fire: Tryndamere's non-Conquer point then makes it 8 → win.
 *   YES-side No Pit yet. P1 at 5 holds bfA (→6), conquers bfB (→7), then plays Baron → the Pit appears,
 *            Baron enters it, Contested, Non-Combat Showdown, all pass → P1 CONQUERS the Pit; scored this
 *            turn = {A, B, Pit} = every battlefield → Final Point → 8 → P1 wins.
 *   Control  No Pit at all: P1 at 6, hold A (→7), conquer B → 2 of 2 → 8 → win.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const BARON_PIT = "unl-t01";
const TRYNDAMERE = "ogn-034-298";
const BARON_COST = { energy: 10, power: { chaos: 3 } };

/**
 * End of P2's turn 2 (P2 active, nothing pending), Victory Score 8. P1 controls bfA (2-Might guard), P2
 * controls bfB (1-Might defender). P1 has a ready attacker in base: a vanilla 5-Might unit, or Tryndamere.
 * `advanceTurn()` then starts P1's turn 3, whose Scoring Step HOLDS bfA.
 */
function board(o: { p1Points: number; attacker?: "vanilla" | "tryndamere" }) {
  const b = scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, o.p1Points)
    .points(P2, 2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 2, name: "A Guard" }, "aGuard")
    .unit(P2, "bfB", { might: 1, name: "B Defender" }, "bDef");
  return o.attacker === "tryndamere" ? b.unit(P1, "base", TRYNDAMERE, "att") : b.unit(P1, "base", { might: 5, name: "Attacker" }, "att");
}

/** NO-side: same board, plus P2 holding Baron Nashor with exactly his cost — P2 plays him before passing the turn. */
function boardWithP2Baron(o: { p1Points: number; attacker?: "vanilla" | "tryndamere" }) {
  return board(o).resources(P2, BARON_COST).hand(P2, BARON_NASHOR, "baron");
}

/** The battlefield id that is neither A nor B (the Baron Pit token), or undefined when there is none. */
function pitOf(game: Game): string | undefined {
  return game.battlefields().find((b) => b !== "bfA" && b !== "bfB");
}

/** Settle until P's open main phase or game over (an auto-begun Non-Combat Showdown is handed back once — settle again). */
async function settleFully(game: Game): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    if (r.reason === "open" || r.reason === "game-over") {
      const d = game.decision();
      if (game.isOver() || (d?.kind === "action" && d.context === "main")) {
        return;
      }
    }
  }
}

/** P2 (turn player) plays Baron: the Pit appears, Baron enters there, the Non-Combat Showdown closes → P2 controls the Pit. */
async function p2PlaysBaron(game: Game): Promise<string> {
  await game.p2.play("baron", { to: "base" }); // the only asked choice; the entry replacement sends him to the Pit
  await settleFully(game);
  const pit = pitOf(game);
  expect(pit).toBeDefined();
  return pit as string;
}

/** P1's attacker goes base → bfB and the combat there resolves completely (incl. any score trigger). */
async function conquerB(game: Game): Promise<void> {
  await game.p1.move("att", "bfB");
  await settleFully(game);
}

describe("Baron Pit as a THIRD battlefield × the Final Point (471.1.b.1 'every Battlefield')", () => {
  // ── NO-side: the Pit is on the board (P2's), P1 scores only A and B ─────────────────────────────
  describe("NO-side — P2's Baron already sits at the Pit; P1 at 6 holds A then conquers B", () => {
    test("setup: P2 plays Baron Nashor → a third battlefield, the Baron Pit TOKEN, is on the board with Baron at it; the auto-begun Non-Combat Showdown closes and P2 conquers it (2 → 3)", async () => {
      const game = await boardWithP2Baron({ p1Points: 6 }).build();
      expect(game.battlefields().sort()).toEqual(["bfA", "bfB"]);
      const pit = await p2PlaysBaron(game);
      expect(game.battlefields()).toHaveLength(3);
      expect(game.state(pit)).toMatchObject({ cardType: "battlefield", defId: BARON_PIT, name: "Baron Pit" });
      expect(game.locationOf("baron")).toBe(pit);
      expect(game.gameState.battlefields[pit]).toMatchObject({ contested: false, controller: P2 });
      expect(game.p2.points()).toBe(3);
      expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    });

    test("P1's turn begins: the Scoring Step HOLDS bfA → 6 → 7 (a Hold, and below Victory−1 anyway: unrestricted); bfA is 'scored this turn'", async () => {
      const game = await boardWithP2Baron({ p1Points: 6 }).build();
      await p2PlaysBaron(game);
      await game.advanceTurn();
      expect(game.turnPlayer()).toBe(P1);
      expect(game.p1.points()).toBe(7);
      expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfA"]);
      expect(game.isOver()).toBe(false);
    });

    test("P1 conquers bfB at 7 = Victory−1: scored this turn = {A, B} but the Pit is a battlefield on the board and is NOT scored → P1 DRAWS 1 instead of the point, stays at 7, game continues (471.1.b.1, 187.9)", async () => {
      const game = await boardWithP2Baron({ p1Points: 6 }).build();
      const pit = await p2PlaysBaron(game);
      await game.advanceTurn();
      const hand0 = game.p1.hand().length;
      expect(game.state("bDef").might).toBe(3); // Baron: "Other friendly units have +2 [Might]"
      await conquerB(game);
      expect(game.zoneOf("bDef")).toBe("trash");
      expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
      expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bfA", "bfB"]);
      expect(game.gameState.scoredThisTurn?.[P1]).not.toContain(pit);
      expect(game.p1.points()).toBe(7);
      expect(game.p1.hand()).toHaveLength(hand0 + 1);
      expect(game.isOver()).toBe(false);
      expect(game.winner()).toBeUndefined();
      expect(game.gameState.battlefields[pit]?.controller).toBe(P2);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.violations()).toEqual([]);
    });

    test("score triggers at bfB still fire: with Tryndamere (8 into the 3-Might defender = 5 excess) the conquer is a draw, then his 'you score 1 point' — not a Conquer, so unrestricted (471.1.a.1) — makes it 8 and P1 wins", async () => {
      const game = await boardWithP2Baron({ attacker: "tryndamere", p1Points: 6 }).build();
      await p2PlaysBaron(game);
      await game.advanceTurn();
      expect(game.p1.points()).toBe(7);
      const hand0 = game.p1.hand().length;
      await conquerB(game);
      expect(game.zoneOf("bDef")).toBe("trash");
      expect(game.p1.hand()).toHaveLength(hand0 + 1); // the 471.1.b.1 draw happened first …
      expect(game.p1.points()).toBe(8); // … then the trigger's point
      expect(game.isOver()).toBe(true);
      expect(game.winner()).toBe(P1);
    });
  });

  // ── YES-side: P1 creates the Pit itself as the third score of the turn ─────────────────────────
  describe("YES-side — no Pit yet; P1 at 5 holds A, conquers B, then plays Baron and conquers the Pit", () => {
    test("hold A: 5 → 6; conquer B (well below Victory−1): 6 → 7, no draw; only two battlefields exist so far", async () => {
      const game = await board({ p1Points: 5 }).hand(P1, BARON_NASHOR, "baron").build();
      await game.advanceTurn();
      expect(game.p1.points()).toBe(6);
      const hand0 = game.p1.hand().length;
      await conquerB(game);
      expect(game.p1.points()).toBe(7);
      expect(game.p1.hand()).toHaveLength(hand0);
      expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bfA", "bfB"]);
      expect(game.battlefields().sort()).toEqual(["bfA", "bfB"]);
      expect(game.isOver()).toBe(false);
    });

    test("P1 plays Baron: the Pit token is created, Baron ENTERS THERE (not base), P1's unit at a battlefield P1 doesn't control → Contested by P1 and a Non-Combat Showdown opens with P1's Focus (190.3.a, 323.8/323.12)", async () => {
      const game = await board({ p1Points: 5 }).hand(P1, BARON_NASHOR, "baron").build();
      await game.advanceTurn();
      await conquerB(game);
      await game.p1.do("addResources", BARON_COST); // pools emptied at P2's end of turn; top up to exactly Baron's cost
      await game.p1.play("baron", { to: "base" });
      expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
      const pit = pitOf(game);
      expect(pit).toBeDefined();
      expect(game.state(pit as string)).toMatchObject({ cardType: "battlefield", defId: BARON_PIT });
      expect(game.locationOf("baron")).toBe(pit);
      expect(game.gameState.battlefields[pit as string]).toMatchObject({ contested: true, contestedBy: P1, controller: null });
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
      expect(game.p1.points()).toBe(7);
    });

    test("all pass → P1 establishes control of the Pit = a CONQUER (348.2.a.1) at 7 = Victory−1; scored this turn = {A, B, Pit} = EVERY battlefield on the board → Final Point granted → 8 → P1 WINS (471.1.b.1, 323.1)", async () => {
      const game = await board({ p1Points: 5 }).hand(P1, BARON_NASHOR, "baron").build();
      await game.advanceTurn();
      await conquerB(game);
      const hand0 = game.p1.hand().length;
      await game.p1.do("addResources", BARON_COST);
      await game.p1.play("baron", { to: "base" });
      await settleFully(game);
      const pit = pitOf(game) as string;
      expect(game.gameState.battlefields[pit]).toMatchObject({ contested: false, controller: P1 });
      expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bfA", "bfB", pit].sort());
      expect(game.p1.points()).toBe(8);
      expect(game.p1.hand()).toHaveLength(hand0 - 1); // Baron left the hand; NO 471.1.b.1 draw
      expect(game.isOver()).toBe(true);
      expect(game.winner()).toBe(P1);
      expect(game.violations()).toEqual([]);
    });
  });

  // ── Control: plain two-battlefield duel ─────────────────────────────────────────────────────────
  test("control — no Pit anywhere: P1 at 6 holds A (→7) and conquers B → 2 of 2 battlefields scored → Final Point → 8, P1 wins, no draw", async () => {
    const game = await board({ p1Points: 6 }).build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(7);
    const hand0 = game.p1.hand().length;
    await conquerB(game);
    expect(game.battlefields().sort()).toEqual(["bfA", "bfB"]);
    expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bfA", "bfB"]);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
