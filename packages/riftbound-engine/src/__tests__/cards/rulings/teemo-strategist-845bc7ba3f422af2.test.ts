/**
 * Ruling 845bc7ba3f422af2 — Teemo, Strategist (OGN-121 → ogn-121-298) · Unit · [2][mind] · 2 Might
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *    When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for
 *    each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: Is there a window to play cards between combat starting and the Attack/Defend abilities triggering? And does
 *    Teemo's errata stop him triggering when he is played from hidden during a combat?
 * A: No window — combat opens and the attack/defend triggers are already queued; the first chance to act comes with
 *    them on the chain. And Teemo does still work from hidden: "When I defend" fires when a card GAINS the defending
 *    designation, which is exactly what happens when he is revealed into the running showdown.
 * Rules: 464.2.c.3/464.2.f.1 (designations and their triggers are part of the combat opening; priority comes after),
 *        811 ([Hidden] cards are revealed at Reaction speed), 450 (a unit arriving into a running showdown is designated).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const HIDDEN_BLADE = "ogn-213-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const CONSULT_THE_PAST = "ogn-083-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's top 5 Main Deck cards: three [Hidden], two not. */
const TOP5 = [HIDDEN_BLADE, FIGHT_OR_FLIGHT, CONSULT_THE_PAST, WATCHFUL_SENTRY, WATCHFUL_SENTRY];

describe("Ruling 845bc7ba3f422af2 — no window before the defend trigger; Teemo revealed from hidden still defends", () => {
  test("ruling: P2's attack opens the combat and Teemo's defend trigger is ALREADY on the chain at the first decision — no priority window sat between them", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deck(P1, TOP5)
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    // The FIRST thing anyone may act on already has the trigger on the chain.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", targets: ["raider"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("premise for the hidden case: a facedown Teemo at bf1 is not on the battlefield and has no combat role when P2 attacks the Holder", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deck(P1, TOP5)
      .build();
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    await game.p2.move("raider", "bf1");
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.state("teemo").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
  });

  test("ruling: revealed from hidden inside the showdown, Teemo gains the defending designation and his 'When I defend' fires — once", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deck(P1, TOP5)
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", targets: ["raider"], triggered: true })]);
    expect(game.chain()).toHaveLength(1); // the errata's point: it fires once, not twice
  });

  test("and it really resolves: the three [Hidden] cards among the top 5 put 3 damage on the Raider", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deck(P1, TOP5)
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("teemo");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider").damage).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
