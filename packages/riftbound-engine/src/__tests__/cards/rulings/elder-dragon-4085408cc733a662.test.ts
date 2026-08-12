/**
 * Ruling 4085408cc733a662 — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · [12][body][body][body][body] · 10 Might
 *   "Any amount of your damage is enough to kill enemy units.
 *    When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *
 * Q: An enemy unit already has damage on it. If I play Elder Dragon and then bounce him, does it still die?
 * A: Yes. The passive is a static lethal-damage modifier: the moment Elder Dragon enters, any already-damaged
 *    enemy unit is at lethal and is killed by the Cleanup that runs right away — before priority is offered on
 *    the "when you play me" trigger. Bouncing Elder Dragon afterwards does not undo the death.
 *    Your OWN damaged units are untouched.
 * Rules: 142.4.c (lethal-damage modifier — the rules' own Elder Dragon example), 319/323 (a Cleanup kills
 *        units at or above lethal), 383.3 (the play trigger is finalized before anyone gets priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";

/**
 * ADJUDICATED 2026-08-12 (CONFLICTS-ADJUDICATED-2026-08-12.md, item bceae31f8e7b) — this is NOT a ruling conflict.
 * Rule 142.4.c is the discriminator and the engine already implements it: "This alters the Lethal Damage value for
 * enemy units that have damage marked BY YOU." So pre-existing damage makes an enemy lethal at Elder Dragon's entry
 * only when the Dragon's own controller marked it. That reconciles all three rulings at once:
 *   • 4085408cc733a662 ("my opponent's already-damaged unit dies when I play Elder Dragon") — damage marked by the
 *     Dragon's controller, so it is at lethal the instant the passive turns on and the Cleanup reaps it, before the
 *     play trigger even asks for its pick.
 *   • d0b7f94188fac000 / e936e0fd5ae150ce (6 facets: a pre-damaged unit is still alive to be healed by Janna in
 *     response) — the damage there was not marked by the Dragon's controller, so nothing happens at entry.
 * The earlier repro seeded {damage: 1} with no attribution, which is neither case; both facets below now seed the
 * attribution explicitly. These facets PREVIOUSLY asserted the engine was wrong — do not flip them back.
 */
const dragonBoard = (damagedBy: string | undefined = P1) =>
  scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .unit(P2, "base", { might: 5, name: "Wounded Ogre" }, "wounded", { damage: 1, lastDamagedBy: damagedBy })
    .unit(P2, "base", { might: 5, name: "Fresh Ogre" }, "fresh")
    .hand(P1, ELDER_DRAGON, "dragon");

describe("Ruling 4085408cc733a662 — a damaged enemy unit dies the instant Elder Dragon enters", () => {
  test("ruling 4085408cc733a662 — an enemy carrying damage YOU marked is lethal the moment the passive turns on: it is in the trash before the play trigger asks anything", async () => {
    const game = await dragonBoard().build();
    expect(game.state("wounded").damage).toBe(1);

    await game.p1.play("dragon");

    // No settle() yet: the kill has already happened, ahead of the play trigger's own choice.
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.zoneOf("fresh")).toBe("base"); // undamaged ⇒ unaffected by the passive
    expect(game.decision()).toMatchObject({ kind: "pick", timing: "FIN" });
  });

  test("ruling 4085408cc733a662 — bouncing Elder Dragon after entry does not resurrect the already-killed enemy", async () => {
    const game = await dragonBoard().build();
    await game.p1.play("dragon");
    expect(game.zoneOf("wounded")).toBe("trash");

    await game.p1.pick("fresh"); // the play trigger's damage, aimed elsewhere
    await game.settle();
    await game.p1.do("sendToHand", { cardId: game.card("dragon") });

    expect(game.zoneOf("wounded")).toBe("trash"); // still dead
  });

  test("rule 142.4.c — damage the DRAGON'S CONTROLLER did not mark is untouched: the same board with the Ogre damaged by its own side survives entry", async () => {
    const game = await dragonBoard(P2).build();
    await game.p1.play("dragon");
    expect(game.zoneOf("wounded")).toBe("base");
    expect(game.state("wounded").damage).toBe(1);
    // …which is exactly why rulings d0b7f94188fac000 / e936e0fd5ae150ce have a live unit for Janna to heal.
  });

  test("the passive DOES make 1 damage lethal once damage is dealt — the play trigger's 1 kills a 5-Might enemy", async () => {
    const game = await dragonBoard().build();
    await game.p1.play("dragon");

    await game.p1.pick("fresh"); // deal 1 to a full-health 5-Might enemy
    await game.settle();

    expect(game.zoneOf("fresh")).toBe("trash");
    expect(game.locationOf("dragon")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("your OWN damaged unit is never touched — the passive names enemy units only", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { body: 4 } })
      .unit(P1, "base", { might: 5, name: "My Ogre" }, "mine", { damage: 1 })
      .unit(P2, "base", { might: 5, name: "Fresh Ogre" }, "fresh")
      .hand(P1, ELDER_DRAGON, "dragon")
      .build();

    await game.p1.play("dragon");
    expect(game.decision()?.kind).toBe("pick");
    // only enemy units are even offered to the trigger
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key)).toEqual(["fresh"]);
    await game.p1.pick("fresh");
    await game.settle();

    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine").damage).toBe(1);
  });
});
