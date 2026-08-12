/**
 * Ruling 4dd78be3d1dcc5d5 — Teemo, Scout (ogn-197-298) · Unit/Champion · Chaos · [2] · 1 Might
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *    When you play me, give me +3 [Might] this turn."
 *
 * Q: Can you hide Teemo directly from the Champion Zone, or must you first move it to hand?
 * A: Directly from the Champion Zone. (Older rules only allowed hiding from hand, which forced players to
 *    pay Energy to fetch the champion into hand first; the current rules allow the direct hide.)
 * Rules: 811.1 ([Hidden]: hide for [rainbow] at a battlefield you control), 419.1.a (the Champion Zone is
 *        played from like the hand), 128 (zone privacy).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";

function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .champion(P1, TEEMO_SCOUT, "teemo");
}

describe("Ruling 4dd78be3d1dcc5d5 — hiding a champion straight out of the Champion Zone", () => {
  test("Teemo starts in the Champion Zone and hiding him there is legal — no trip through hand", async () => {
    const game = await board().build();
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(game.p1.champion()).toBe("teemo");
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.hand()).not.toContain("teemo");
  });

  test("the hide costs exactly [rainbow] — no Energy is spent fetching him to hand first", async () => {
    const game = await board().build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.hide("teemo", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("once hidden he behaves like any hidden card: not playable the turn he was hidden, playable from the next turn for [0]", async () => {
    const game = await board().build();
    await game.p1.hide("teemo", "bf1");
    expect(game.p1.can("reveal", "teemo")).toBe(false);
    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's next turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.locationOf("teemo")).toBe("bf1");
    expect(game.state("teemo").might).toBe(4); // 1 + the play trigger's +3 this turn
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("no battlefield you control ⇒ nothing to hide behind: the hide is refused and Teemo stays in the Champion Zone", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
      .champion(P1, TEEMO_SCOUT, "teemo")
      .build();
    const r = await game.p1.try((p) => p.hide("teemo", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(game.violations()).toEqual([]);
  });
});
