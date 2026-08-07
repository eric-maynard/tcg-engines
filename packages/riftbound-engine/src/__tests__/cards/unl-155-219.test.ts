/**
 * Heroic Charge — unl-155-219 · Spell · Order · 3 energy · [Action]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a friendly unit +1 [Might] this turn and [Stun] an enemy unit at its location.
 *   (A stunned unit doesn't deal combat damage this turn.)
 *
 * Rules: 806 (Action: your own open Main Phase, or whenever you hold Focus in a showdown — even on the
 * opponent's turn), 355.5/355.8 (both units are targets chosen at play time; valid choices are needed
 * for ALL targets), 359.3.f-ish "its" = information referenced from the first target (the enemy must
 * share the FRIENDLY unit's location, not the spell's), 423.1.b (stunned units contribute no Might to
 * combat damage), 423.1.a.2 (stun ends in end-of-turn cleanup), 465 (combat damage), 466 (attackers
 * recalled when defenders survive).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. The whole point is a combat trick: cast in the showdown, the +1 and the stun together turn a
 *      losing 2-into-3 attack into a clean conquer (exactly lethal), while 2-into-4 is one short — the
 *      stunned defender survives, deals nothing, and the attacker is merely recalled.
 *   2. Works on DEFENSE too: on the opponent's turn, once the attacker passes Focus, the defender's
 *      controller may cast it (Action timing inside a showdown).
 *   3. "at ITS location" keys off the chosen friendly unit: enemies at another battlefield or in a base
 *      are not legal second choices; a friendly unit with no enemy at its location is not a legal FIRST
 *      choice (355.8), so with no co-located pair the spell is uncastable.
 *   4. NOT a Reaction: on the opponent's turn outside a showdown it cannot be played at all.
 *   5. "+1 this turn" expires at end of turn; cost is exactly 3 energy, no power.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-155-219";

/** P1 (3 energy, Heroic Charge in hand) has a ready 2-Might attacker in base; P2 defends bf1 with `defMight`. */
function attackBoard(defMight: number) {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Charger" }, "atk")
    .unit(P2, "bf1", { might: defMight, name: "Defender" }, "def")
    .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "else")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CARD, "hc");
}

type G = Awaited<ReturnType<ReturnType<typeof attackBoard>["build"]>>;
const targetPairs = (game: G) => (game.p1.option("cast", "hc")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];

describe("Heroic Charge (unl-155-219)", () => {
  test("registry payload: 3-cost order Action spell; one spell ability = sequence [ +1 Might (turn) to a friendly unit, stun an enemy unit ]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 3, name: "Heroic Charge", timing: "action" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const spell = def?.abilities?.[0] as { type: string; timing: string; effect: { type: string; effects: Record<string, unknown>[] } };
    expect(spell).toMatchObject({ timing: "action", type: "spell" });
    expect(spell.effect.type).toBe("sequence");
    expect(spell.effect.effects).toHaveLength(2);
    expect(spell.effect.effects[0]).toEqual({ amount: 1, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" });
    expect(spell.effect.effects[1]).toMatchObject({ target: { controller: "enemy", type: "unit" }, type: "stun" });
  });

  test("registry payload — the stun target's location is tied to the FRIENDLY target ('its location'), not the spell's own 'here'", async () => {
    // Expected: some relative-location descriptor (e.g. location: { sameAs: "target-0" }). Actual: `location: "here"`,
    // which only happens to coincide with the friendly unit inside that battlefield's showdown (see the targeting BUG below).
    const def = (await loadDefaultCardPool()).get(CARD);
    const stun = (def?.abilities?.[0] as { effect: { effects: { target: { location?: unknown } }[] } }).effect.effects[1];
    expect(stun.target.location).toBeDefined();
    expect(stun.target.location).not.toBe("here");
  });

  test("cost: exactly 3 energy, no power, spell to trash; with 2 energy it is not castable", async () => {
    const game = await attackBoard(3).build();
    await game.p1.move("atk", "bf1");
    await game.p1.cast("hc", { targets: ["atk", "def"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("hc")).toBe("chain");
    const poor = await attackBoard(3).resources(P1, { energy: 2 }).build();
    await poor.p1.move("atk", "bf1");
    expect(poor.p1.can("cast", "hc")).toBe(false);
  });

  test("Action timing: castable while P1 holds Focus in the showdown it just opened; the +1 Might lands on the friendly attacker (2 → 3) before combat", async () => {
    const game = await attackBoard(3).build();
    await game.p1.move("atk", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "hc")).toBe(true);
    await game.p1.cast("hc", { targets: ["atk", "def"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // spell resolves, showdown still open
    expect(game.zoneOf("hc")).toBe("trash");
    expect(game.state("atk").might).toBe(3);
    expect(game.locationOf("atk")).toBe("bf1");
  });

  test("exactly lethal — 2-Might attacker +1 vs a 3-Might defender that gets STUNNED: defender dies, attacker takes 0 (423.1.b) and conquers bf1 (+1 point)", async () => {
    const game = await attackBoard(3).build();
    await game.p1.move("atk", "bf1");
    await game.p1.cast("hc", { targets: ["atk", "def"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("def").isStunned).toBe(true);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.state("atk").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("one short — 2+1 into a stunned 4-Might defender: nobody dies, the attacker is recalled home undamaged (466), bf1 stays P2's, no points", async () => {
    const game = await attackBoard(4).build();
    await game.p1.move("atk", "bf1");
    await game.p1.cast("hc", { targets: ["atk", "def"] });
    await game.settle();
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.state("atk").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    // 423.1.a.2: the stun outlives combat but not the turn.
    expect(game.state("def").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.state("def").isStunned).toBe(false);
  });

  test("'an enemy unit at ITS location' — with the Charger on bf1 the only legal enemy is the Defender there (not the unit on bf2, not the one in P2's base)", async () => {
    // Expected pairs: exactly [atk, def]. Actual: [atk, def] / [atk, else] / [atk, home] are all offered.
    const game = await attackBoard(3).build();
    await game.p1.move("atk", "bf1");
    expect(targetPairs(game)).toEqual([["atk", "def"]]);
    const r = await game.p1.try((p) => p.cast("hc", { targets: ["atk", "else"] }));
    expect(r.ok).toBe(false);
  });

  test("355.8 — a friendly unit with NO enemy at its location is not a legal first choice; with no co-located friendly/enemy pair the spell cannot be cast at all", async () => {
    // Expected: Charger still in P1's base shares no location with any enemy → uncastable in the main phase.
    // Actual: castable, pairing the base-bound Charger with any enemy anywhere.
    const game = await attackBoard(3).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "hc")).toBe(false);
  });

  test("on DEFENSE — P2 attacks (3) into P1's 2-Might holder; only after P2 passes Focus may P1 cast it: holder → 3, attacker stunned → attacker dies, holder survives, bf1 stays P1's", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "hc")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    expect(game.p1.can("cast", "hc")).toBe(false); // no Focus yet
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "hc")).toBe(true);
    await game.p1.cast("hc", { targets: ["holder", "raider"] });
    await game.settle();
    expect(game.state("holder").might).toBe(3);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("NOT a Reaction: on the opponent's turn outside a showdown (P2's open main phase, or in response to P2's spell) it is never legal", async () => {
    const BOLT = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Test Bolt",
      rulesText: "[Action] Deal 1 to a unit.",
      timing: "action",
    };
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .unit(P2, "bf1", { might: 2 }, "intruder") // co-located pair exists, so only timing can forbid it
      .hand(P1, CARD, "hc")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(game.p1.can("cast", "hc")).toBe(false);
    await game.p2.cast("bolt", { targets: "holder" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "hc")).toBe(false);
  });

  test("'+1 [Might] this turn' expires: 3 during this turn, back to 2 after the turn passes", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .unit(P2, "bf1", { might: 1 }, "gnat", { exhausted: true })
      .hand(P1, CARD, "hc")
      .build();
    await game.p1.cast("hc", { targets: ["holder", "gnat"] });
    await game.settle();
    expect(game.state("holder").might).toBe(3);
    // bf1 is contested (both sides present): resolve it so the turn can end — holder 3 vs gnat 1.
    if (!game.p1.can("endTurn")) {
      await game.p1.choose(game.p1.legal().find((o) => o.verb === "startShowdown")!.key);
      await game.settle();
    }
    await game.advanceTurn();
    expect(game.state("holder").might).toBe(2);
    expect(game.state("holder").mightModifier).toBe(0);
  });
});
