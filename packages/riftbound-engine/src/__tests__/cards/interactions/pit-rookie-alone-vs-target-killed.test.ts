/**
 * Interaction: Pit Rookie (ogn-136-298) "When you play me, buff another friendly unit."
 *   × Cithria of Cloudfield (ogn-139-298) "When you play another unit, buff me."
 *   × Blast of Power (ogs-012-024) [Action] "Kill a unit at a battlefield."
 *
 * Question — three branches of the same "the chosen unit isn't there" story:
 *   (a) Pit Rookie played as P1's ONLY unit: is P1 prompted, and does the Rookie buff itself?
 *   (b) Both triggers on the Chain, the Rookie's aimed at Cithria, and Cithria is killed in
 *       response: does P1 re-choose? does the Rookie buff itself? does Cithria's own trigger
 *       still resolve?
 *   (c) The only other friendly unit already carries a buff.
 *
 * Answers:
 *   (a) 402.4 — an ability with no legal choice for a target is removed from the Chain at once;
 *       402.4.a it is not countered; there is no prompt, no self-buff, no enemy buff.
 *   (b) 355.15 / 402.4.b — choices are locked at finalization and are never re-offered; at
 *       resolution the chosen unit is in a non-board zone and so is an illegal target
 *       (359.3.e.2 / 359.3.e.4), the buff instruction is ignored (359.3.e.5), and the ability
 *       still counts as having triggered and resolved (359.3.e.10). The kill and any death
 *       triggers happen normally.
 *   (c) 426.1.b.1 / 426.1.c — an already-buffed unit is still a LEGAL choice, so 402.4 does not
 *       remove the trigger; it resolves, the unit is chosen, and no second buff counter is
 *       placed (and nothing "when you buff me" fires).
 *
 * PREMISE NOTE — Blast of Power is [Action] ("Play on your turn or in showdowns"), and rule 348
 * lets a player with Focus play only SPELLS and activate abilities during a showdown, so a unit
 * can never be played into a showdown. That makes "P1 plays Pit Rookie, P2 responds with Blast
 * of Power" impossible: P2 has no timing window in which an Action is legal while P1's main-
 * phase Chain is open. The first (b) test pins that bar down with Blast of Power itself; the
 * "chosen unit dies before resolution" branch is then driven with a genuine [Reaction] kill,
 * Flurry of Blades (ogn-133-298) "Deal 1 to all units at battlefields", which is lethal to
 * Cithria's 1 Might.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ROOKIE = "ogn-136-298";
const CITHRIA = "ogn-139-298";
const BLAST = "ogs-012-024";
const FLURRY = "ogn-133-298"; // [Reaction] Deal 1 to all units at battlefields

/**
 * Cithria (1 Might) stands at bf1 and is P1's only other unit, so the Rookie's trigger has
 * exactly one legal choice and is auto-bound onto her. The Rookie is played to P1's BASE so
 * that Flurry of Blades ("all units at battlefields") reaches only Cithria.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .resources(P2, { energy: 6, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CITHRIA, "cith")
    .hand(P1, ROOKIE, "rookie")
    .hand(P2, BLAST, "blast")
    .hand(P2, FLURRY, "flurry");
}

describe("Pit Rookie alone vs its chosen target killed in response", () => {
  test("(a) as your ONLY unit the trigger finds no legal choice and is removed unasked (402.4) — no prompt, no self-buff, no enemy buff", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 1 } })
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe") // enemy ⇒ excluded by "friendly"
      .hand(P1, ROOKIE, "rookie")
      .build();
    await game.p1.play("rookie", { to: "base" });
    expect(game.chain()).toEqual([]); // removed immediately, not countered (402.4.a)
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("rookie").isBuffed).toBe(false); // "another" excludes itself
    expect(game.state("rookie").might).toBe(2);
    expect(game.state("foe").isBuffed).toBe(false);
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("(b) both play triggers are P1's and P1 orders them; the Rookie's single legal choice is locked onto Cithria at finalization (402.2)", async () => {
    const game = await board().build();
    await game.p1.play("rookie", { to: "base" });
    expect(game.decision()?.kind).toBe("order"); // 383.3.d — P1 orders their simultaneous triggers
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rookie", targets: ["cith"], triggered: true }),
      expect.objectContaining({ cardId: "cith", triggered: true }),
    ]);
  });

  test("(b) Blast of Power is an [Action]: P2 cannot answer the open Chain with it at all (348 — only spells and abilities are playable with Focus, and Actions need your own turn)", async () => {
    const game = await board().build();
    await game.p1.play("rookie", { to: "base" });
    await game.p1.order([]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.energy()).toBeGreaterThanOrEqual(6); // affordability is not the obstacle
    expect(game.p2.can("cast", "blast")).toBe(false);
    await expect(game.p2.cast("blast", { targets: "cith" })).rejects.toThrow();
    // the [Reaction] spell in the same hand IS legal in that same window
    expect(game.p2.can("cast", "flurry")).toBe(true);
  });

  test("(b) with the chosen unit killed in response: no re-choose, the Rookie does NOT buff itself, and both triggers still resolve (359.3.e.2/.4/.5/.10, 355.15)", async () => {
    const game = await board().build();
    await game.p1.play("rookie", { to: "base" });
    await game.p1.order([]);
    await game.p1.passPriority();
    await game.p2.cast("flurry"); // resolves on top of both triggers; 1 damage kills 1-Might Cithria
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action"); // never a second target prompt
    expect(game.zoneOf("cith")).toBe("trash"); // the kill happens normally
    expect(game.state("rookie").isBuffed).toBe(false);
    expect(game.state("rookie").might).toBe(2);
    expect(game.chain()).toEqual([]); // both triggered abilities resolved (359.3.e.10)
    expect(game.violations()).toEqual([]);
  });

  test("(b) undisturbed, the two triggers stack onto the same unit and Cithria still ends with exactly ONE buff (426.1.b.1)", async () => {
    const game = await board().build();
    await game.p1.play("rookie", { to: "base" });
    await game.p1.order([]);
    await game.settle();
    expect(game.state("cith").isBuffed).toBe(true);
    expect(game.state("cith").might).toBe(2); // 1 printed + a single +1 buff
    expect(game.state("rookie").isBuffed).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("(c) an already-buffed unit is still a LEGAL choice: the trigger is NOT removed, it resolves, and no second buff is added (426.1.b.1 / 426.1.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 1 } })
      .unit(P1, "base", { might: 3, name: "Veteran" }, "ally", { buffed: true })
      .hand(P1, ROOKIE, "rookie")
      .build();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").might).toBe(4); // 3 printed + the buff it already carries
    await game.p1.play("rookie", { to: "base" });
    // 402.4 does not fire — a legal choice exists, so the ability goes on the Chain.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rookie", targets: ["ally"], triggered: true }),
    ]);
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").might).toBe(4); // unchanged — no second buff counter
    expect(game.state("rookie").isBuffed).toBe(false); // nothing is added in compensation
    expect(game.chain()).toEqual([]); // no "when you buff me" style follow-up fired (426.1.c)
    expect(game.violations()).toEqual([]);
  });
});
