/**
 * Ruling 820016f57cf1b0c3 — Baron Nashor (UNL-147 → unl-147-219) · 12 Might · [10]+[chaos]×3 · "As you play me, add the Baron Pit battlefield
 *     token to the board if it's not there already. If you do, I enter there. …"
 *   × Baron Pit (UNL-T01 → unl-t01, battlefield token) "Units can move here from anywhere."
 *
 * Q: Opponent is at 7 and plays Baron Nashor — does conquering the new Baron Pit give the winning point, or do they draw?
 * A: The Final Point rule still applies. The 8th point via Conquer needs EVERY battlefield in play scored this turn — now three
 *    (both originals + the Pit). Scored all three this turn → win. Started the turn at 7 and only conquered the Pit → draw 1, stay at 7.
 * Rules: 466.1.b.2 (Final Point: conquer only scores the last point if all battlefields were scored this turn, else draw 1),
 *        464.1 (entering the empty Pit = Conquer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const pitId = (game: Game) => game.battlefields().find((b) => b !== "bf1" && b !== "bf2");

describe("Ruling 820016f57cf1b0c3 — Baron Pit is just a third battlefield the Final Point rule also demands", () => {
  test("DRAW example: P1 starts its turn already at 7 controlling nothing, plays Baron → Pit created and conquered, but bf1/bf2 were not scored this turn → no 8th point, P1 draws 1 and stays at 7", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .resources(P1, { energy: 10, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard One" }, "g1")
      .unit(P2, "bf2", { might: 2, name: "Guard Two" }, "g2")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .hand(P1, BARON_NASHOR, "baron")
      .build();
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2"]);
    await game.p1.play("baron", { to: "base" }); // the "As you play me" replacement diverts him into the Pit
    await game.settle();
    const pit = pitId(game);
    expect(pit).toBeDefined();
    expect(game.battlefields()).toHaveLength(3); // the Pit is a real third battlefield
    expect(game.locationOf("baron")).toBe(pit);
    expect(game.gameState.battlefields[pit as string]?.controller).toBe(P1);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual([pit]); // the conquer happened…
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).not.toContain("bf1");
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).not.toContain("bf2");
    expect(game.p1.points()).toBe(7); // …but no final point
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toEqual(["d1"]); // drew 1 instead
    expect(game.violations()).toEqual([]);
  });

  test("WIN example: P1 (5) HOLDS bf1 at the start of its turn (→6), conquers the open bf2 (→7), then plays Baron: the Pit is the third battlefield scored this turn → the conquer awards the 8th point and P1 wins", async () => {
    const game = await scenario()
      .victoryScore(8)
      .active(P2)
      .points(P1, 5)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .hand(P1, BARON_NASHOR, "baron")
      .build();
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase: Holder holds bf1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(6);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf1"]);
    await game.p1.move("scout", "bf2"); // empty & uncontrolled → conquer
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect([...(game.gameState.scoredThisTurn?.[P1] ?? [])].sort()).toEqual(["bf1", "bf2"]);
    expect(game.isOver()).toBe(false);
    await game.p1.do("addResources", { energy: 10, power: { chaos: 3 } });
    expect(game.p1.can("play", "baron")).toBe(true);
    await game.p1.play("baron", { to: "base" }); // the "As you play me" replacement diverts him into the Pit
    await game.settle();
    const pit = pitId(game);
    expect(pit).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit);
    expect([...(game.gameState.scoredThisTurn?.[P1] ?? [])].sort()).toEqual(["bf1", "bf2", pit as string].sort()); // all THREE
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast inside the win line: had P1 NOT taken bf2 first (only bf1 held + the Pit), Baron's conquer at 7 would again be a draw, not a win", async () => {
    const game = await scenario()
      .victoryScore(8)
      .active(P2)
      .points(P1, 6)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
      .hand(P1, BARON_NASHOR, "baron")
      .build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(7); // held bf1
    const handBefore = game.p1.hand().length;
    await game.p1.do("addResources", { energy: 10, power: { chaos: 3 } });
    await game.p1.play("baron", { to: "base" }); // the "As you play me" replacement diverts him into the Pit
    await game.settle();
    expect(pitId(game)).toBeDefined();
    expect(game.gameState.battlefields[pitId(game) as string]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // Baron left, drew 1
  });
});
