/**
 * Ruling fb420063c2e736d8 — Qiyana, Victorious (OGN-155 → ogn-155-298) · 4 Might · [Deflect] · "When I conquer, draw 1 or channel 1 rune
 *     exhausted."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · 1 · "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Qiyana has 4 damage marked on her (and 5 Might). Does she die when Stupefy resolves on her?
 * A: Yes. Stupefy drops her to 4 Might with 4 damage marked; the Cleanup that follows the spell's resolution finds damage ≥ Might
 *    and she dies. (Damage only heals at end of combat / end of turn — irrelevant here, the Cleanup is immediate.)
 * Rules: 318–323 (Cleanup after a chain item resolves; lethal-damage check), 140.3 (damage persists until healed), 809 (Deflect cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const QIYANA = "ogn-155-298";
const STUPEFY = "ogn-095-298";

/**
 * P2's turn. P1's Qiyana holds bf1 BUFFED (4 + 1 = 5 Might) with 4 damage already marked this turn. P2: Stupefy + exactly [1] and one
 * [rainbow]-worth of power for Qiyana's Deflect; known deck top so the draw is visible.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", QIYANA, "qiyana", { buffed: true, damage: 4 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P2, STUPEFY, "stupefy")
    .deck(P2, ["ogn-175-298"], ["p2top"]);
}

describe("Ruling fb420063c2e736d8 — Stupefy on a 5-Might Qiyana carrying 4 damage kills her at the post-resolution Cleanup", () => {
  test("premise: Qiyana is 5 Might (buffed) with 4 damage marked and alive; Stupefy on her costs [1] + Deflect's [rainbow]", async () => {
    const game = await board().build();
    expect(game.state("qiyana")).toMatchObject({ damage: 4, isBuffed: true, might: 5, zone: "battlefield-bf1" });
    expect(game.state("qiyana").keywords).toContain("Deflect");
    await game.p2.cast("stupefy", { targets: "qiyana" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "stupefy", controller: P2, targets: ["qiyana"] })]);
    // Still alive while Stupefy merely sits on the chain.
    expect(game.zoneOf("qiyana")).toBe("battlefield-bf1");
  });

  test("Stupefy resolves: −1 Might → 4 Might with 4 damage ⇒ she dies in the Cleanup right after (P1's trash); P2 drew 1", async () => {
    const game = await board().build();
    await game.p2.cast("stupefy", { targets: "qiyana" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // resolves → cleanup
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("qiyana")).toBe("trash");
    expect(game.p1.trash()).toContain("qiyana");
    expect(game.p2.hand()).toEqual(["p2top"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Qiyana with only 3 damage survives Stupefy (4 Might > 3 damage) — it is the marked damage vs the NEW Might that matters", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", QIYANA, "qiyana", { buffed: true, damage: 3 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .hand(P2, STUPEFY, "stupefy")
      .build();
    await game.p2.cast("stupefy", { targets: "qiyana" });
    await game.settle();
    expect(game.state("qiyana")).toMatchObject({ damage: 3, might: 4, mightModifier: -1, zone: "battlefield-bf1" });
  });
});
