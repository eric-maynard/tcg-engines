/**
 * Ruling 719c8ada539c1401 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Action · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) — the "Seth legend ability" the question names:
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *      exhaust it, and recall it instead." (a DIE REPLACEMENT, 371.2)
 *   × Flash (OGS-011 → ogs-011-024) · [2] · Reaction — "Move up to 2 friendly units to base." (the contrasting
 *     case: the unit LEAVES the battlefield before the Blade resolves, so there is nothing legal left to kill)
 *
 * Q: If the targeted unit is saved by the legend ability instead of dying, does its controller still draw 2?
 * A (riftjudge): Yes. The unit does not have to die for the draw to happen.
 *
 * ENGINE: agrees. The kill was attempted against a still-legal target and merely REPLACED, so the linked
 * instruction still executes — CR 359.3.e.14.b in as many words, using Hidden Blade as its own worked example:
 * "The later linked instruction doesn't reference an action directly, so it will execute even if the kill action
 * of the earlier linked action is replaced by some other event." The discriminator is "was a kill attempted
 * against a still-legal target and then replaced?", NOT "did the unit survive?": a unit that is bounced,
 * banished or moved off the battlefield before resolution makes the FIRST instruction mistarget, and
 * 359.3.e.14.a then ignores the linked draw with it (that rule's own example is this card being moved to base).
 *
 * PRODUCT-OWNER ADJUDICATION 2026-08-13 (DESIGN.md § "Community rulings vs the CR"): "follow the judge rulings.
 * hidden blade, you still draw if the death is replaced but not if the unit is like bounced". The earlier pass
 * (CONFLICTS-ADJUDICATED-2026-08-12.md, item 99cac87aa3a4) recorded this file as a RULING-CONFLICT on the
 * strength of 359.3.e.5 alone; that reading missed 359.3.e.14.b and substituted Flash (a real move to base) for
 * the legend ability in the question, which is a different fact pattern with a different answer. There is no
 * conflict here: the ruling, the CR and the product owner all say the same thing.
 * Rules: 359.3.e.14 (linked instructions), .e.14.a (earlier instruction ignored ⇒ later ignored), .e.14.b
 *        (earlier action REPLACED ⇒ later still executes), 355.10.d, 371.2 (optional die replacement), 191.1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";
const THE_BOSS = "ogn-269-298";

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

/** Same board, but the Runner is buffed and P2's legend is The Boss with the [rainbow] to pay for the save. */
function bossBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner", { buffed: true })
    .legend(P2, THE_BOSS, "boss")
    .hand(P1, HIDDEN_BLADE, "blade");
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

  // The ruling's OWN fact pattern: the legend ability saves the unit instead of letting it die. The kill was
  // attempted against a legal target and replaced (371.2), so the linked draw still executes (359.3.e.14.b).
  // ADJUDICATED 2026-08-13 by the product owner ("you still draw if the death is replaced"). This file
  // PREVIOUSLY carried a RULING-CONFLICT saying the engine deliberately did NOT draw when the unit was saved;
  // that annotation was wrong on this fact pattern — do not put it back.
  test("ruling 719c8ada539c1401 — The Boss replaces the death (Runner healed, exhausted, recalled to base) and its controller P2 STILL draws 2 (359.3.e.14.b)", async () => {
    const game = await bossBoard().build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "runner" });
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "boss" } });
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("runner")).toBe("base"); // saved, not killed …
    expect(game.state("runner")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.p2.hand()).toHaveLength(hand + 2); // … and the linked draw still happens
    expect(game.p2.deck()).toHaveLength(deck - 2);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
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

  // The OTHER branch of the same rule, and the one the product owner drew the line at ("but not if the unit is
  // like bounced"): Flash moves the Runner off the battlefield, so the FIRST instruction has no legal target and
  // is ignored — 359.3.e.14.a then ignores the linked draw with it. Its example is literally this card: "If the
  // chosen unit changes zones or moves to base in reaction to Hidden Blade, the spell will mistarget … the second
  // instruction will not execute and the unit's controller will not draw 2." Not a conflict with the ruling
  // above: that ruling answers the REPLACEMENT case, which is asserted as passing right before this.
  test("rule 359.3.e.14.a — the Flashed unit is gone from the battlefield: nothing is killed and NOBODY draws", async () => {
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
