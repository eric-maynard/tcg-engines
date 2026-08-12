/**
 * Ruling 90bd44e1de658726 — (general Hide vs Play; exercised with)
 *   Trifarian Gloryseeker (OGN-217 → ogn-217-298) · 2 Might · "[Legion] — When you play me, buff me."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · "[Hidden] … [Action] Kill a unit at a battlefield."
 *
 * Q: Does hiding a card enable [Legion] — hide one card, then play a Legion card for its effect?
 * A: No. Hiding is a Discretionary Action, not playing, so it does not satisfy "you have played another card
 *    this turn". Playing an ordinary card first does.
 * Rules: 811.1.c.1 (Hide is not a subset of Play), 812.1.b.1 / 812.1.c (Legion = another CARD finalized by you
 *        this turn), 408.2 (Discretionary Actions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GLORYSEEKER = "ogn-217-298";
const HIDDEN_BLADE = "ogn-213-298";

/** A cheap vanilla unit that exists only to be the "another card played this turn". */
const RECRUIT = { cardType: "unit", energyCost: 1, might: 1, name: "Recruit" } as const;

/** P1's turn, plenty of resources, holding bf1 so a Hide is legal there. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 3, rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, GLORYSEEKER, "seeker")
    .hand(P1, RECRUIT, "recruit");
}

describe("Ruling 90bd44e1de658726 — hiding a card does not turn on [Legion]", () => {
  test("with nothing played this turn the Gloryseeker's Legion ability is off: played first, it gets no buff", async () => {
    const game = await board().build();
    await game.p1.play("seeker");
    await game.settle();
    expect(game.state("seeker").isBuffed).toBe(false);
    expect(game.state("seeker").might).toBe(2);
  });

  test("HIDING a card first changes nothing — the Gloryseeker still gets no buff", async () => {
    const game = await board().build();
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    await game.p1.play("seeker");
    await game.settle();
    expect(game.state("seeker").isBuffed).toBe(false);
    expect(game.state("seeker").might).toBe(2);
  });

  test("PLAYING a card first does turn it on: the Gloryseeker enters buffed (3 Might)", async () => {
    const game = await board().build();
    await game.p1.play("recruit");
    await game.settle();
    await game.p1.play("seeker");
    await game.settle();
    expect(game.state("seeker").isBuffed).toBe(true);
    expect(game.state("seeker").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("hide THEN play a real card: the real play is what satisfies Legion — the hide was never counted", async () => {
    const game = await board().build();
    await game.p1.hide("blade", "bf1");
    await game.p1.play("recruit");
    await game.settle();
    await game.p1.play("seeker");
    await game.settle();
    expect(game.state("seeker").isBuffed).toBe(true);
  });
});
