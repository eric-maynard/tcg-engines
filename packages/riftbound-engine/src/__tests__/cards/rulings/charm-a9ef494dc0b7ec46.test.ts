/**
 * Ruling a9ef494dc0b7ec46 — Charm (OGN-043 → ogn-043-298) · [1][calm] · "Move an enemy unit."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos] · "Move a friendly unit and ready it."
 *
 * Q: I had units at a battlefield at the start of the turn; my unit gets moved off to base (battlefield now empty), then it is
 *    moved back to the same battlefield. Do I get a conquer point?
 * A: Not if you already scored that battlefield this turn (e.g. you held it at the start of your turn): a player scores each
 *    battlefield at most once per turn by either method, so re-taking it is not a scoring Conquer. Exception noted by the
 *    ruling: doing this on the OPPONENT's turn (e.g. Charm away, Ride the Wind back), where you have not scored it that turn,
 *    does score.
 *    [On your own turn the opponent has no timing window for Charm, so case 1 moves the unit away with a Standard Move — who
 *    moves it is immaterial to the once-per-turn rule.]
 * Rules: 469.1 (Conquer = gain control of a battlefield not yet scored this turn), 469.2 (Hold), 190.4 (control lapses when
 *        empty), 344 (showdown at an uncontrolled battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const RIDE_THE_WIND = "ogn-173-298";

const openShowdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

describe("Ruling a9ef494dc0b7ec46 — once a battlefield is scored this turn, leaving and re-taking it scores nothing", () => {
  test("own turn: P1 HOLDS bfA at the start of the turn (+1); the Runner walks to base, bfA's control lapses; Ride the Wind brings it back and P1 regains control — but the score stays 1", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .unit(P1, "bfA", { might: 3, name: "Runner" }, "runner")
      .unit(P2, "bfB", { might: 4, name: "Guard" }, "guard")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.advanceTurn(); // → P1's turn: hold bfA
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toContain("bfA");
    await game.p1.do("addResources", { energy: 2, power: { chaos: 1 } }); // [2][chaos] for Ride the Wind this turn

    await game.p1.move("runner", "base");
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.gameState.battlefields.bfA?.controller).toBe(null); // empty → control lapsed
    expect(game.p1.points()).toBe(1);

    await game.p1.cast("rtw", { targets: "runner" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bfA");
    }
    await game.settle(); // resolves; the showdown at the empty bfA is handed back once …
    await game.settle(); // … and passes through
    expect(game.locationOf("runner")).toBe("bfA");
    expect(game.state("runner").isReady).toBe(true);
    expect(openShowdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1); // control regained …
    expect(game.p1.points()).toBe(1); // … but no second score for bfA this turn
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("opponent's turn (the ruling's exception): P2 Charms the Runner off bfA into their Guard at bfB; during that showdown P1 Rides the Wind back to the now-uncontrolled bfA; when its staged showdown runs P1 conquers bfA and DOES score (+1) — bfA was not scored by P1 this turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .unit(P1, "bfA", { might: 3, name: "Runner" }, "runner")
      .unit(P2, "bfB", { might: 4, name: "Guard" }, "guard")
      .hand(P2, CHARM, "charm")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.p2.cast("charm", { targets: "runner" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bfB");
    }
    await game.p2.passPriority();
    await game.p1.passPriority(); // Charm resolves → combat showdown at bfB
    expect(game.locationOf("runner")).toBe("bfB");
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.gameState.battlefields.bfA?.controller).toBe(null); // P1 lost bfA
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.p1.can("cast", "rtw")).toBe(true); // [Action] — legal in the showdown
    await game.p1.cast("rtw", { targets: "runner" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bfA");
    }
    await game.acting().passPriority();
    await game.acting().passPriority(); // RTW resolves: Runner back at bfA, staged
    expect(game.locationOf("runner")).toBe("bfA");
    expect(game.p1.points()).toBe(0);
    for (let i = 0; i < 8 && openShowdown(game) !== undefined; i++) {
      await game.acting().passFocus();
    }
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
