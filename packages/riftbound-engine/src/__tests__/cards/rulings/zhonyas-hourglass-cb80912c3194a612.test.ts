/**
 * Ruling cb80912c3194a612 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can a player un-hide Zhonya's from a battlefield to get it back to base, or is it stuck there once hidden?
 * A: Gear can't exist at a battlefield: when Zhonya's is played from facedown it is immediately recalled to its
 *    controller's base. Playing a hidden card is allowed any time you could play a Reaction — no friendly unit
 *    needs to be dying to flip it.
 * Rules: 811 (Hidden: play from facedown for [0] as a Reaction on a later turn), 145/457.1 (gear lives in base;
 *        loose gear at a battlefield is recalled during Cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
/** An unrelated P2 spell to open a chain on P2's turn (draw 1). */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Study (Draw 1.)",
  timing: "action",
} as const;

/** P1 holds bf1 with a Guard (3) and Zhonya's facedown there (hidden on an earlier turn). */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .hand(P2, STUDY, "study");
}

describe("Ruling cb80912c3194a612 — a hidden Zhonya's can be flipped whenever a Reaction could be played, and lands in base", () => {
  test("on P1's own turn, open state, nothing dying: revealing the facedown Zhonya's is legal, costs [0], and it ends up in P1's BASE (not at bf1)", async () => {
    const game = await board(P1).build();
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.p1.gear()).toContain("zhonya");
    expect(game.state("zhonya").isHidden).toBe(false);
    expect(game.p1.energy()).toBe(0); // nothing paid
    expect(game.locationOf("guard")).toBe("bf1"); // no unit died or moved
    expect(game.p1.facedown("bf1")).toEqual([]);
  });

  test("on the OPPONENT's turn, in response to an unrelated spell (Reaction timing): the flip is legal too and Zhonya's again lands in P1's base", async () => {
    const game = await board(P2).build();
    await game.p2.cast("study");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("study")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.p1.gear()).toContain("zhonya");
    expect(game.violations()).toEqual([]);
  });

  test("but 'whenever you could play a Reaction' still needs priority: in a Neutral Open state on the OPPONENT's turn (no chain, no showdown) only the turn player may act (rule 335), so P1 cannot flip it yet", async () => {
    const game = await board(P2).build();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("reveal", "zhonya")).toBe(false);
  });
});
