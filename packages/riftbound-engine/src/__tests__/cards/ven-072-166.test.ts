/**
 * Guttural Roar — ven-072-166 · Spell · Body · 2 energy · [Action]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a unit +2 [Might] this turn. If it's [Empowered], give it +4 [Might] this turn instead.
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. "instead" — an Empowered target gets exactly +4 (a replacement of the +2), never +2 then +4 = +6;
 *      a non-Empowered target gets exactly +2 even if it has an (unused) Empower ability.
 *   2. 806 Action timing — own turn in a Neutral Open State, or while holding Focus in ANY showdown
 *      (including the opponent's attack); NOT on the opponent's turn outside a showdown, not even while
 *      holding priority on a plain chain (that needs Reaction).
 *   3. "a unit" — friendly or enemy, base or battlefield; with no unit anywhere it is not castable.
 *   4. "this turn" — the bonus survives the showdown/combat it was cast in and expires at end of turn.
 *   5. In-combat arithmetic: +2 on a 3-Might defender against a 4-Might attacker turns a loss into a kill;
 *      two Roars stack to +4 on a plain unit.
 *   6. Parser: only the flat +2 branch exists — the Empowered +4 branch is silently dropped.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-072-166";
const ASCETIC = "ven-030-166"; // Serene Ascetic 3/3 — [Empower][3]; [Empowered] Deflect + Shield 3
const SLOW_BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Slow Bolt",
} as const;

describe("Guttural Roar (ven-072-166)", () => {
  test("costs 2 energy; gives a plain unit exactly +2 Might this turn and goes to the trash; 1 energy is not enough; no unit anywhere → not castable", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, CARD, "roar").build();
    await game.p1.cast("roar", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("roar")).toBe("chain");
    await game.settle();
    expect(game.state("ally")).toMatchObject({ baseMight: 3, might: 5 });
    expect(game.zoneOf("roar")).toBe("trash");
    expect((await scenario().resources(P1, { energy: 1, power: { body: 3 } }).unit(P1, "base", { might: 3 }, "a").hand(P1, CARD, "r").build()).p1.can("cast", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "r").build()).p1.can("cast", "r")).toBe(false);
  });

  test("'this turn': the +2 is gone after the turn passes", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, CARD, "roar").build();
    await game.p1.cast("roar", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally").might).toBe(3);
  });

  test("'a unit' includes ENEMY units and units at battlefields: both are offered and an enemy at bf1 really gets +2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "ally")
      .unit(P2, "bf1", { might: 4 }, "foe")
      .hand(P1, CARD, "roar")
      .build();
    const targets = (game.p1.option("cast", "roar")?.fields.find((f) => f.arg === "targets")?.options ?? []).map((o) => (Array.isArray(o) ? o[0] : o));
    expect(new Set(targets)).toEqual(new Set(["ally", "foe"]));
    await game.p1.cast("roar", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(6);
    expect(game.state("ally").might).toBe(3);
  });

  test("a NON-Empowered Serene Ascetic (it merely has an Empower ability) gets exactly +2 (3 → 5)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", ASCETIC, "asc").hand(P1, CARD, "roar").build();
    expect(game.state("asc").isEmpowered).toBe(false);
    await game.p1.cast("roar", { targets: "asc" });
    await game.settle();
    expect(game.state("asc").might).toBe(5);
  });

  test("an [Empowered] target gets +4 INSTEAD — Empowered Serene Ascetic goes 3 → 7 (not 5, not 9)", async () => {
    // Expected: 3 + 4 = 7. Actual: the parsed effect is a flat modify-might +2 with no Empowered branch → 5.
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", ASCETIC, "asc", { empowered: true }).hand(P1, CARD, "roar").build();
    expect(game.state("asc")).toMatchObject({ isEmpowered: true, might: 3 });
    await game.p1.cast("roar", { targets: "asc" });
    await game.settle();
    expect(game.state("asc").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("asc").might).toBe(3); // still "this turn"
  });

  test("Empower first, Roar second in the same turn — the status is read when Roar resolves: [3] to Empower, then Roar → 7", async () => {
    // Expected: after the Empower ability resolves she is Empowered, so the later Roar gives +4. Actual: +2 (→ 5).
    const game = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", ASCETIC, "asc").hand(P1, CARD, "roar").build();
    await game.p1.activate("asc");
    await game.settle();
    expect(game.state("asc").isEmpowered).toBe(true);
    await game.p1.cast("roar", { targets: "asc" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("asc").might).toBe(7);
  });

  test("[Action] on the opponent's turn: not in P2's Neutral Open State, and not while merely holding PRIORITY on P2's chain (that would need Reaction)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 3 }, "ally")
      .hand(P1, CARD, "roar")
      .hand(P2, SLOW_BOLT, "bolt")
      .build();
    expect(game.p1.can("cast", "roar")).toBe(false);
    await game.p2.cast("bolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "roar")).toBe(false);
    expect((await game.p1.try((p) => p.cast("roar", { targets: "ally" }))).ok).toBe(false);
    await game.settle();
    expect(game.state("ally")).toMatchObject({ damage: 1, might: 3 });
    expect(game.zoneOf("roar")).toBe("hand");
  });

  test("[Action] in the OPPONENT's attack showdown: once Focus passes P1 roars the 3-Might defender to 5 — the 4-Might raider is now one short and dies, P1 keeps bf1; the +2 outlives the combat but not the turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "roar")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("cast", "roar")).toBe(false); // P2 has Focus first
    await game.p2.passFocus();
    await game.p1.cast("roar", { targets: "holder" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("holder")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 5 ≥ 4
    expect(game.state("holder")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" }); // 4 < 5, healed; bonus persists this turn
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn();
    expect(game.state("holder").might).toBe(3);
  });

  test("[Action] in your OWN attack showdown: a 2-Might attacker roared to 4 kills the 3-Might defender and conquers instead of dying", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Def" }, "def")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "roar")
      .build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("roar", { targets: "scout" }); // attacker holds Focus
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf1"); // 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("two Roars stack on a plain unit: 3 → 5 → 7 this turn, back to 3 next turn", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, CARD, "r1").hand(P1, CARD, "r2").build();
    await game.p1.cast("r1", { targets: "ally" });
    await game.settle();
    await game.p1.cast("r2", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(7);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["r1", "r2"]));
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
  });

  test("registry payload — an Action spell whose effect branches on the target being Empowered (+4) vs not (+2), both 'this turn'; today it is a flat modify-might +2", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 2, name: "Guttural Roar", timing: "action" });
    const abilities = (def?.abilities ?? []) as { type?: string; timing?: string; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ timing: "action", type: "spell" });
    const text = JSON.stringify(abilities[0]?.effect);
    expect(text).toContain("empowered");
    expect(text).toMatch(/"amount":4/);
    expect(text).toMatch(/"amount":2/);
    expect(text).toContain('"duration":"turn"');
  });
});
