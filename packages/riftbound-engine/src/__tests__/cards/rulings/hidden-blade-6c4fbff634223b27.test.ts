/**
 * Ruling 6c4fbff634223b27 — Hidden Blade (OGN-213 → ogn-213-298)
 *   "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (ogn-077-298) "[Hidden] If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it."
 *
 * Q: If Hidden Blade's kill is replaced (e.g. by Zhonya's Hourglass), does the target's controller
 *    still draw 2?
 * A: Yes. "Its controller" links the draw to the targeted unit, not to the kill action; replacing the
 *    kill does not stop the linked draw. The unit is not killed; it was still a legal target when the
 *    Blade resolved, so its controller draws 2.
 * Rules: 359.3.e.14, 359.3.e.14.b, 369.1 / 370.1.a.1 (replacement — the replaced kill never happened).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";

/** P1's turn 3. P2's 3-might unit sits at bf1 (P2-controlled). P1 has exactly [2][order] + the Blade. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim", { damage: 1 })
    .hand(P1, HIDDEN_BLADE, "blade");
}

/** Zhonya's already face up in P2's base. */
const withZhonyasInPlay = () => board().gear(P2, ZHONYAS, "zh");
/** Zhonya's hidden facedown at bf1 (hidden on an earlier turn), flipped in response. */
const withZhonyasHidden = () => board().facedown(P2, "bf1", ZHONYAS, "zh");

describe("Ruling 6c4fbff634223b27 — Hidden Blade's draw survives a replaced kill", () => {
  test("control (no replacement): the unit at the battlefield is killed and Hidden Blade goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  // Expected: "Its controller draws 2" — the targeted unit's controller (P2) draws; the caster does not.
  // Actual: the engine hands the 2 cards to the caster (P1) and P2 draws nothing.
  test.failing("BUG: ruling 6c4fbff634223b27 — 'its controller' = the unit's controller P2 draws 2, not the caster (359.3.e.14); engine draws for P1", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
  });

  // Expected (369.1 / 370.1.a.1): with Zhonya's face up in P2's base, the kill is replaced — Hourglass
  // is killed instead (→ trash); the unit survives: healed to 0, exhausted, recalled to P2's base.
  // Actual: Zhonya's replacement does not intercept the spell's kill — the unit goes to the trash and
  // the Hourglass stays in base.
  test.failing("BUG: ruling 6c4fbff634223b27 — Zhonya's in play replaces the kill: Hourglass → trash, unit survives in base healed + exhausted", async () => {
    const game = await withZhonyasInPlay().build();
    expect(game.p2.gear()).toContain("zh");
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.decision()?.kind === "yes-no").toBe(false); // mandatory replacement, no opt-out
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("victim").isExhausted).toBe(true);
    expect(game.p2.trash()).not.toContain("victim");
    expect(game.zoneOf("blade")).toBe("trash");
  });

  // Expected (359.3.e.14.b): the draw references the unit's controller, not whether it died — the
  // replaced kill still lets P2 draw exactly 2; P1's only hand change is the Blade leaving.
  // Actual: the unit is killed outright (replacement not applied), so the premise of the ruling —
  // "the unit is not killed … the opponent draws 2" — does not hold.
  test.failing("BUG: ruling 6c4fbff634223b27 — kill replaced by Zhonya's in play, yet the unit's controller P2 STILL draws 2", async () => {
    const game = await withZhonyasInPlay().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("base"); // not killed (replaced)
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p2.deck()).toHaveLength(p2Deck - 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
  });

  // ── The ruling's example: "They respond with Zhonya's Hourglass" (flipped from facedown) ─────────

  test("example: with Hidden Blade on the chain P2 gets priority and may flip the hidden Hourglass for [0] before the Blade resolves", async () => {
    const game = await withZhonyasHidden().build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("reveal", "zh")).toBe(true);
    await game.p2.reveal("zh");
    expect(game.p2.energy()).toBe(0); // played ignoring its cost, P2 had 0 anyway
    while (game.chain().length > 1) {
      await game.acting().pass();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.state("zh").isHidden).toBe(false);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh"));
    expect(game.zoneOf("victim")).toBe("battlefield-bf1"); // still a legal target
  });

  // Expected: after the flip, Hidden Blade resolves → kill replaced → Hourglass to trash, unit recalled
  // to base healed + exhausted, and P2 draws 2. Actual: unit killed, Hourglass untouched.
  test.failing("BUG: ruling 6c4fbff634223b27 — example: Zhonya's flipped in response replaces the death; unit survives AND P2 draws 2", async () => {
    const game = await withZhonyasHidden().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.reveal("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("victim").isExhausted).toBe(true);
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });
});
