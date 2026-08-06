/**
 * Ruling 07bcfc25c33fc96b — Bone Skewer (UNL-139 → unl-139-219)
 *   "[Hidden] Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They
 *    play that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Teemo, Strategist (ogn-121-298) — a 2-Might unit with [Hidden].
 *
 * Q: If the unit chosen by Bone Skewer has [Hidden], can the opponent hide it instead of playing it?
 * A: No. Hide is a separate action, not a subset of Play. Bone Skewer instructs a limited Play, which
 *    follows the normal play process (the unit goes on the chain and is finalized) — the opponent gets
 *    no option to hide it facedown instead.
 * Rules: 811.1.c.1 (Hide is not a subset of Play), 419.1, 419.3, 419.3.b.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const TEEMO_STRATEGIST = "ogn-121-298"; // [Hidden] unit, 2 energy + [mind], 2 Might

/**
 * P1's turn with exactly [2][chaos] for Bone Skewer. P2 controls bf1 (so hiding there would otherwise be
 * legal for P2) and even holds a spare [rainbow] that a Hide would cost. P2's hand: Teemo (Hidden unit)
 * and a non-unit card.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 0, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, TEEMO_STRATEGIST, "teemo")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Blank Spell" }, "blank");
}

describe("Ruling 07bcfc25c33fc96b — Bone Skewer makes the opponent PLAY the chosen Hidden unit; hiding is not an option", () => {
  test("Bone Skewer is castable on P1's turn for [2][chaos]", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "skewer")).toBe(true);
    await game.p1.cast("skewer", { answers: ["bf1"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(["chain", "trash"]).toContain(game.zoneOf("skewer"));
  });

  // Expected: on resolution P1 chooses bf1, sees P2's hand and may choose a UNIT from it (Teemo offered,
  // the spell not); P2 then PLAYS Teemo to bf1 ignoring all costs — P2 is never offered a hide/facedown
  // alternative — and Teemo arrives stunned. P2's [rainbow] is untouched (nothing was paid, nothing hidden).
  // Actual: Bone Skewer is a stub (only its [Hidden] keyword is modelled): it resolves with no battlefield
  // choice, no hand reveal and no unit pick; Teemo stays in P2's hand.
  test.failing("BUG: ruling 07bcfc25c33fc96b — engine resolves Bone Skewer as a no-op; expected: P1 picks Teemo from P2's revealed hand, P2 PLAYS it to bf1 (not hidden facedown), stunned, for free (811.1.c.1, 419.3)", async () => {
    const game = await board().build();
    await game.p1.cast("skewer", { answers: ["bf1"] });
    // Drain priority; answer the battlefield choice if it is asked at resolution instead of at play time.
    let stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.seat === P1) {
      const d = game.decision();
      const keys = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
      if (keys.includes("bf1") && !keys.includes("teemo")) {
        await game.p1.pick("bf1");
        stop = await game.settle();
      }
    }
    // "You may choose a unit from it": P1 is offered Teemo (a unit) but not the spell.
    expect(stop.reason).toBe("unanswered");
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    const offered = pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("teemo");
    expect(offered).not.toContain("blank");
    await game.p1.pick("teemo");

    // P2 must PLAY it — no decision lets P2 hide it instead (811.1.c.1). If P2 is asked anything at all it
    // may only be play-related (e.g. nothing to choose here: destination is fixed to bf1).
    const after = await game.settle();
    const d2 = after.decision;
    if (d2 && d2.seat === P2 && d2.kind === "action") {
      expect(d2.options.some((o) => o.verb === "hide")).toBe(false);
    }
    expect(game.p2.can("hide", "teemo")).toBe(false);

    // Outcome: Teemo is face UP at bf1 (not in the facedown zone, not in hand), stunned, and P2 paid nothing.
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.state("teemo").isStunned).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.zoneOf("skewer")).toBe("trash");
  });
});
