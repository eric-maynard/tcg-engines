/**
 * Ruling ad3e95e3ead2ef8a — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · "[Deflect] When an opponent plays a unit while
 *     I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Master Yi, Unstoppable (UNL-059 → unl-059-219) · 12 Might · "[Level 3]/[6]/[11] I cost … less. [Level 16][>] I can't be
 *     chosen by enemy spells and abilities."   with the Wuju Master legend (unl-191-219: "[Level 6] Your units have +1
 *     [Might]. [Level 11] Your units enter ready.") at 16 XP.
 *
 * Q: Would a Level-16 Master Yi (can't be chosen) played under Wuju Master still be stunned and kept from moving by an
 *    enemy Vex at a battlefield?
 * A: Yes. Vex's trigger identifies "the unit just played" automatically — nobody chooses it — so Yi's protection from
 *    being chosen does not apply: he is Stunned and can't move this turn (even though he entered ready).
 * Rules: 355.10.d (programmatically determined objects are not chosen), 355.9.b / 757 ("can't be chosen"), 350 (Stun).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const MASTER_YI = "unl-059-219";
const WUJU_MASTER = "unl-191-219";

/** P1's turn 5 at 16 XP with Wuju Master; exactly Yi's Level-11 cost ([12]-[6] = [6], no calm). P2's Vex at P2's bf1; bf2 open. */
function board(vexAt: "bf1" | "base") {
  return scenario()
    .turn(5)
    .xp(P1, 16)
    .legend(P1, WUJU_MASTER, "wuju")
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, vexAt, VEX, "vex")
    .unit(P2, "bf1", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, MASTER_YI, "yi");
}

describe("Ruling ad3e95e3ead2ef8a — Vex, Apathetic stuns a Level-16 'can't be chosen' Master Yi all the same", () => {
  test("setup: at 16 XP Yi carries his 'can't be chosen by enemy spells and abilities' protection and costs only [6]", async () => {
    const game = await board("bf1").build();
    expect(game.p1.xp()).toBe(16);
    expect(game.p1.can("play", "yi")).toBe(true);
    await game.p1.play("yi", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("yi").keywords).toContain("Untargetable");
    expect(game.state("yi").isReady).toBe(true); // Wuju Master L11: enters ready
    expect(game.state("yi").might).toBe(13); // Wuju Master L6: +1
  });

  test("playing Yi while Vex is at a battlefield: Vex's trigger goes on the chain with NO choose prompt for anyone (it is not targeting him) …", async () => {
    const game = await board("bf1").build();
    await game.p1.play("yi", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    const d = game.decision();
    expect(d?.kind).toBe("action"); // straight to priority — nobody was asked to pick Yi, no Deflect-style question
  });

  test("… and it resolves through his protection: Yi is STUNNED and can't move this turn — ready, 13 Might, yet no move is legal", async () => {
    const game = await board("bf1").build();
    await game.p1.play("yi", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("yi").isStunned).toBe(true);
    expect(game.state("yi").grantedKeywords).toContainEqual({ duration: "turn", keyword: "NoMove", value: undefined });
    expect(game.state("yi").isReady).toBe(true);
    expect(game.p1.legal().some((o) => o.verb === "move" || o.verb === "gank")).toBe(false);
    expect((await game.p1.try((p) => p.move("yi", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("yi", "bf1"))).ok).toBe(false);
    expect(game.locationOf("yi")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("'this turn' only: next turn of P1's, Yi is unstunned and free to move", async () => {
    const game = await board("bf1").build();
    await game.p1.play("yi", { to: "base" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("yi").isStunned).toBe(false);
    expect(game.state("yi").grantedKeywords.map((k) => k.keyword)).not.toContain("NoMove");
    await game.p1.move("yi", "bf2");
    expect(game.locationOf("yi")).toBe("bf2");
  });

  test("control: Vex in P2's base (not at a battlefield) — nothing triggers; the ready Yi may move at once", async () => {
    const game = await board("base").build();
    await game.p1.play("yi", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("yi").isStunned).toBe(false);
    await game.p1.move("yi", "bf2");
    expect(game.locationOf("yi")).toBe("bf2");
  });
});
