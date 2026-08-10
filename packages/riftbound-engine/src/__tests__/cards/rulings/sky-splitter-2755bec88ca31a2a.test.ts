/**
 * Ruling 2755bec88ca31a2a — Sky Splitter (OGN-014 → ogn-014-298) [Action] · 8 + [fury] "This spell's Energy cost is reduced
 *   by the highest Might among units you control. Deal 5 to a unit at a battlefield."
 *   × Defy (OGN-045 → ogn-045-298) [Reaction] · 1 + [calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Anivia, Primal (ogn-148-298) — an 8-Might unit (reduces Sky Splitter to 0).  (Eager Apprentice is name-dropped only.)
 *
 * Q: Sky Splitter is reduced to 0 by Anivia's Might. Can Defy counter it now that it "costs" less than 4?
 * A: No. Defy checks the PRINTED cost (8). Reductions are only a discount when paying; they don't change the card's cost
 *    for effects that look at cost.
 * Rules: 128 (cost is the printed characteristic), 356.4 (reductions apply during payment only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKY_SPLITTER = "ogn-014-298";
const DEFY = "ogn-045-298";
const ANIVIA = "ogn-148-298";
const CLEAVE = "ogn-004-298"; // printed 1 — a spell Defy CAN counter

/** P1's turn: Anivia (8) in base, only [fury] in the pool (0 energy); P2's 6-Might Target at bf1; P2 holds Defy with 1 + [calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ANIVIA, "anivia")
    .unit(P2, "bf1", { might: 6, name: "Target" }, "target")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DEFY, "defy");
}

function defyTargets(game: Game): string[] {
  const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Ruling 2755bec88ca31a2a — Defy reads Sky Splitter's printed 8, not its Anivia-discounted 0", () => {
  test("premise: with the 8-Might Anivia, Sky Splitter is castable for 0 energy + [fury]", async () => {
    const game = await board().build();
    expect(game.state("anivia").might).toBe(8);
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "target" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } }); // 8 − 8 = 0 energy paid
    expect(game.chain().map((c) => c.cardId)).toEqual(["sky"]);
  });

  test("P2 gets priority but Defy can NOT target Sky Splitter (printed cost 8 > 4): no legal Defy cast / Sky Splitter absent from its targets", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "target" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(defyTargets(game)).not.toContain("sky");
    expect(game.p2.can("cast", "defy")).toBe(false);
    const forced = await game.p2.try((p) => p.cast("defy", { targets: "sky" }));
    expect(forced.ok).toBe(false);
  });

  test("so Sky Splitter resolves: 5 damage to the Target; Defy stays in P2's hand with its resources unspent", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.state("target").damage).toBe(5);
    expect(game.p2.hand()).toContain("defy");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a printed-1 spell (Cleave) IS a legal Defy target and gets countered", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "anivia" });
    await game.p1.passPriority();
    expect(defyTargets(game)).toContain("cleave");
    await game.p2.cast("defy", { targets: "cleave" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("anivia").grantedKeywords).toEqual([]); // countered — no Assault
  });
});
