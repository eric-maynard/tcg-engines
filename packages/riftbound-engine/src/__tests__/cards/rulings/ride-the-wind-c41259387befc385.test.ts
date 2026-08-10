/**
 * Ruling c41259387befc385 — Ride the Wind (OGN-173 → ogn-173-298) · Spell [2] · Action · "Move a friendly unit and ready it."
 *   × Vex, Apathetic (UNL-150 → unl-150-219) "When an opponent plays a unit while I'm at a battlefield, [Stun] it.
 *     They can't move it this turn."
 *
 * Q: Can I Ride the Wind a unit I just played to a battlefield when the opponent's Vex sits at the other battlefield?
 * A: No. Playing the unit triggers Vex; while her trigger is on the chain the turn is Closed, so the [Action] Ride the
 *    Wind cannot be played in response. Vex resolves → the unit is stunned and its player can't move it this turn.
 * Rules: 331.1 (Closed State — no Action spells), 383 (triggers go on the chain), 350.1 movement restriction.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const VEX = "unl-150-219";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", VEX, "vex")
    .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" }, "recruit")
    .hand(P1, RIDE_THE_WIND, "ride");
}

describe("Ruling c41259387befc385 — Ride the Wind cannot dodge Vex, Apathetic's on-play stun", () => {
  test("playing the unit puts Vex's trigger on the chain (Closed State): Ride the Wind is NOT playable in response", async () => {
    const game = await board().build();
    await game.p1.play("recruit");
    expect(game.locationOf("recruit")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    // Whoever holds priority, P1 has no legal cast of the Action-speed Ride the Wind while the chain exists.
    expect(game.p1.can("cast", "ride")).toBe(false);
    const r = await game.p1.try((p) => p.cast("ride", { targets: "recruit" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ride")).toBe("hand");
  });

  test("Vex resolves: the played unit is stunned and rooted; Ride the Wind afterwards cannot move it this turn", async () => {
    const game = await board().build();
    await game.p1.play("recruit");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("recruit").isStunned).toBe(true);
    expect(game.state("recruit").keywords).toContain("NoMove");
    // Now the state is Open again; Ride the Wind is castable in principle, but it cannot move the rooted unit.
    const r = await game.p1.try((p) => p.cast("ride", { targets: "recruit" }));
    if (r.ok) {
      await game.settle();
    }
    expect(game.locationOf("recruit")).toBe("base");
    expect((await game.p1.try((p) => p.move("recruit", "bf1"))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: with Vex in P2's base the unit is not stunned and Ride the Wind moves + readies it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "base", VEX, "vex")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" }, "recruit")
      .hand(P1, RIDE_THE_WIND, "ride")
      .build();
    await game.p1.play("recruit");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("recruit").isStunned).toBe(false);
    await game.p1.cast("ride", { targets: "recruit", answers: ["bf1", "battlefield-bf1"] });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("bf1");
      await game.settle();
    }
    expect(game.locationOf("recruit")).toBe("bf1");
    expect(game.state("recruit").isReady).toBe(true);
  });
});
