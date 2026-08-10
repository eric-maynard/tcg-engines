/**
 * Ruling 72ea84b5ded7b0fb — Vex, Apathetic (UNL-150 → unl-150-219) · "[Deflect] When an opponent plays a unit while I'm at a
 *   battlefield, [Stun] it. They can't move it this turn."   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might · "I can't be
 *   chosen by enemy spells and abilities."   (Baron Nashor unl-147-219 cited as the analogous case.)
 *
 * Q: Opponent's Vex is at a battlefield they control; I play Ruin Runner. Does Vex stun it?
 * A: Yes. Vex's trigger identifies "the unit just played" automatically — nobody chooses it, so it is not a target and Ruin
 *    Runner's "can't be chosen" protection does not apply. Ruin Runner is stunned and can't be moved this turn.
 * Rules: 355.10.d (automatically determined objects are not chosen), 355.9.b ("can't be chosen"), 350 (Stun).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const RUIN_RUNNER = "sfd-105-221";

/** P1's turn. P2 controls bf1 with Vex there; P1 holds Ruin Runner with exactly its 6 + [body]. */
function board(vexAt: "bf1" | "base") {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 6, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, vexAt, VEX, "vex")
    .hand(P1, RUIN_RUNNER, "rr");
}

describe("Ruling 72ea84b5ded7b0fb — Vex, Apathetic stuns a freshly played Ruin Runner despite 'can't be chosen'", () => {
  test("P1 plays Ruin Runner while P2's Vex is at bf1: Vex's trigger goes on the chain with NO choose prompt for P2, and Ruin Runner ends up stunned + unable to move this turn", async () => {
    const game = await board("bf1").build();
    await game.p1.play("rr");
    expect(game.zoneOf("rr")).toBe("base");
    expect(game.state("rr").keywords).toContain("Untargetable"); // its protection is live …
    // … yet the trigger was created (nothing for P2 to choose / no Deflect-style tax question).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("rr").isStunned).toBe(true);
    expect(game.state("rr").grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
    const r = await game.p1.try((p) => p.move("rr", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("rr")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("the restriction is 'this turn': on P1's next turn Ruin Runner is no longer stunned and may move", async () => {
    const game = await board("bf1").build();
    await game.p1.play("rr");
    await game.settle();
    expect(game.state("rr").isStunned).toBe(true);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.state("rr").isStunned).toBe(false);
    expect(game.state("rr").grantedKeywords.map((k) => k.keyword)).not.toContain("NoMove");
    await game.p1.move("rr", "bf2");
    expect(game.locationOf("rr")).toBe("bf2");
  });

  test("control: with Vex in P2's base (not at a battlefield) nothing triggers and Ruin Runner is not stunned", async () => {
    const game = await board("base").build();
    await game.p1.play("rr");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("rr").isStunned).toBe(false);
    expect(game.state("rr").grantedKeywords.map((k) => k.keyword)).not.toContain("NoMove");
  });
});
