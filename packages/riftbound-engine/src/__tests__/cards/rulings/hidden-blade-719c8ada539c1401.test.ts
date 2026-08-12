/**
 * Ruling 719c8ada539c1401 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Action · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) · [2] · Reaction — "Move up to 2 friendly units to base." (stands in for the
 *     legend ability in the question, which likewise saves the unit by sending it back to base)
 *
 * Q: If the targeted unit is sent back to base in response (so it is not killed), does its controller still draw 2?
 * A (riftjudge): Yes. The unit does not have to die for the draw to happen — it is still on the board when Hidden
 *    Blade resolves, so "its controller" is still readable and that player draws 2.
 *
 * RULING-CONFLICT — the engine does NOT follow that answer (adjudicated 2026-08-12, item 99cac87aa3a4). The CR
 * settles it against the ruling using Hidden Blade as its own example: 355.10.d ("'Kill a unit. Its controller
 * draws 2' targets the unit, but not its controller") makes the draw a linked instruction rather than an
 * independent one, and 359.3.e.5's Hidden Blade example says that once the chosen unit is no longer at the
 * appropriate battlefield "any instructions related to that unit are ignored" (359.3.e.7, and 359.3.e.12 makes
 * "its controller" read null). Nobody draws.
 * Rules: 355.10.d, 359.3.e.5 / .e.7 / .e.10 / .e.12, 191.1 (controller), 449 (an effect may move the unit out from
 *        under the kill).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";

/** P1's turn with exactly [2][order] and Hidden Blade; P2 holds bf1 with a 3-Might Runner and has Flash + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

describe("Ruling 719c8ada539c1401 — Hidden Blade's draw when the target is saved from the kill", () => {
  test("baseline: unanswered, Hidden Blade kills the Runner and its CONTROLLER (P2, not the caster) draws 2", async () => {
    const game = await board().build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 2);
    expect(game.p2.deck()).toHaveLength(deck - 2);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("premise: P2 answers with Flash — the Runner is back in base before Hidden Blade resolves, so the kill finds nothing and the unit lives", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "runner" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "runner" });
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 719c8ada539c1401 says the saved unit's controller still draws 2. The CR says the
  // opposite, using THIS CARD as its own worked example. "Kill a unit at a battlefield. Its controller draws 2"
  // targets only the unit (355.10.d names this exact sentence: "'Kill a unit. Its controller draws 2' targets the
  // unit, but not its controller"), so the draw is not an independent instruction — it is an instruction *related
  // to* the target. 359.3.e.5's own Hidden Blade example: once the chosen unit is no longer at the appropriate
  // battlefield "any instructions related to that unit are ignored"; 359.3.e.7 drops an instruction all of whose
  // targets went invalid, and 359.3.e.12 makes every lookup through an illegal target return null — so "its
  // controller" reads null and nobody draws. (Contrast the Void Seeker example in the same rule: "Deal 4 to a unit
  // … Draw 1" still draws, because "Draw 1" names no referent back to the target.)
  // ADJUDICATED 2026-08-12 (CONFLICTS-ADJUDICATED-2026-08-12.md, item 99cac87aa3a4): this facet PREVIOUSLY asserted
  // the opposite (draw 2 anyway). Do not flip it back — 33 sibling Hidden Blade ruling facets pin no-kill ⇒ no-draw.
  test("rule 359.3.e.5/.7/.12 — the saved unit is not killed and its controller draws NOTHING: the draw is linked to the illegal target", async () => {
    const game = await board().build();
    const deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "runner" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("base"); // it did not die …
    expect(game.p2.deck()).toHaveLength(deck); // … and the linked draw is ignored with it
    expect(game.zoneOf("blade")).toBe("trash"); // the spell still resolved and was still played (359.3.e.10)
    expect(game.violations()).toEqual([]);
  });
});
