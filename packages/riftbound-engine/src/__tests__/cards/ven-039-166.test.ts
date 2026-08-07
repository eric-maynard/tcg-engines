/**
 * Crumbling Sands — ven-039-166 · Spell · Calm · 1 energy + [calm] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Counter a spell if an opponent has played another spell this turn.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. "ANOTHER spell": the spell being countered never satisfies its own condition. The opponent's
 *      FIRST spell of the turn is safe; their second (whether the first already resolved or is still
 *      below it on the same chain) is fair game — and so is the first once a second exists.
 *   2. "an OPPONENT has played": the caster's own spells this turn do not arm it; neither do the
 *      opponent's UNITS/GEAR played this turn (not spells), nor spells they played on a previous turn.
 *   3. Reaction (813): castable onto the opponent's chain on their turn; but "a spell" is a target on
 *      the chain (355.9.a.2) — with no spell there (empty chain, or only a triggered ABILITY) it cannot
 *      be played at all (355.8), and it can never target itself (355.9.c).
 *   4. A countered spell does nothing, goes to the trash, and its cost is not refunded (425.1).
 *   5. When the condition is false the target must simply NOT be countered (whether the engine
 *      refuses the cast or lets it resolve as a dud) — the bolt still lands.
 *   6. Cost: exactly 1 energy + 1 calm; either piece missing → not castable.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-039-166";
const SHIELDBEARER = "ogn-051-298"; // Unit · 3 energy · "When you play me, stun a unit." → a triggered ABILITY on the chain

function bolt(name: string, timing: "action" | "reaction" = "action") {
  return {
    abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing, type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost: 1,
    name,
    timing,
  } as const;
}

/** P2's turn; P2 holds two bolts (+ energy for both), P1 holds Sands with 1 energy + 1 calm and a 5-Might Victim. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3 })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", { might: 5, name: "Victim" }, "victim")
    .hand(P2, bolt("Bolt A"), "boltA")
    .hand(P2, bolt("Bolt B"), "boltB")
    .hand(P2, bolt("Quick Bolt", "reaction"), "quick")
    .hand(P1, CARD, "sands");
}

/** P2 casts `id` at Victim and passes priority to P1. */
async function p2Bolts(game: Game, id: string): Promise<void> {
  await game.p2.cast(id, { targets: "victim" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
}

/** If Sands is castable at `target`, cast it; then settle the whole chain. Returns whether it was cast. */
async function trySandsThenSettle(game: Game, target: string): Promise<boolean> {
  const cast = game.p1.can("cast", "sands") ? (await game.p1.try((p) => p.cast("sands", { targets: target }))).ok : false;
  await game.settle();
  return cast;
}

describe("Crumbling Sands (ven-039-166)", () => {
  // Expected: the counter carries the "opponent has played another spell this turn" gate (a condition on
  // the spell ability or on the counter effect). Actual: a bare unconditional { type: "counter" }.
  test("registry payload — Reaction, 1 + [calm], 'counter a spell' WITH the opponent-played-another-spell condition", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 1, name: "Crumbling Sands", powerCost: ["calm"], timing: "reaction" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; timing: string; effect: { type: string }; condition?: unknown };
    expect(ability).toMatchObject({ timing: "reaction", type: "spell" });
    expect(JSON.stringify(ability)).toContain('"counter"');
    expect(JSON.stringify(ability)).toMatch(/condition/); // the "if an opponent has played another spell" gate exists somewhere
  });

  test("cost + Reaction timing: onto the opponent's chain on their turn for exactly 1 energy + 1 calm, as P1's non-triggered item on top", async () => {
    const game = await board().build();
    await game.p2.cast("boltA", { targets: "victim" });
    await game.settle(); // Bolt A resolves: P2 has now played a spell this turn
    await p2Bolts(game, "boltB");
    expect(game.p1.can("cast", "sands")).toBe(true);
    await game.p1.cast("sands", { targets: "boltB" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["boltB", "sands"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, name: "Crumbling Sands", triggered: false });
  });

  test("cost negative space: 1 energy without calm, or calm without energy → not castable even with a legal spell to hit", async () => {
    for (const pool of [{ energy: 1, power: { calm: 0, fury: 2 } }, { energy: 0, power: { calm: 1 } }]) {
      const game = await board().resources(P1, pool).build();
      await game.p2.cast("boltA", { targets: "victim" });
      await game.settle();
      await p2Bolts(game, "boltB");
      expect(game.p1.can("cast", "sands")).toBe(false);
    }
  });

  test("armed: the opponent's SECOND spell this turn (first already resolved) is countered — no damage from it, both cards in the trash, P2's energy not refunded (425.1)", async () => {
    const game = await board().build();
    await game.p2.cast("boltA", { targets: "victim" });
    await game.settle();
    expect(game.state("victim").damage).toBe(3);
    await p2Bolts(game, "boltB");
    await game.p1.cast("sands", { targets: "boltB" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("boltB")).toBe("trash");
    expect(game.zoneOf("sands")).toBe("trash");
    expect(game.state("victim").damage).toBe(3); // Bolt B never landed
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p2.energy()).toBe(1); // 3 − Bolt A − Bolt B, nothing refunded
    expect(game.violations()).toEqual([]);
  });

  test("armed on ONE chain: Bolt A then P2's own Reaction on top → Bolt A now has 'another spell' and can be countered; the Reaction bolt still resolves", async () => {
    const game = await board().build();
    await game.p2.cast("boltA", { targets: "victim" });
    await game.p2.cast("quick", { targets: "victim" }); // P2 keeps priority and stacks a Reaction
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("sands", { targets: "boltA" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["boltA", "quick", "sands"]);
    await game.settle();
    expect(game.zoneOf("boltA")).toBe("trash");
    expect(game.zoneOf("quick")).toBe("trash");
    expect(game.state("victim").damage).toBe(3); // only Quick Bolt hit
  });

  // Expected: Bolt A is P2's FIRST spell this turn → the condition is false → Bolt A resolves and Victim
  // takes 3 (Sands either can't be cast or resolves as a dud). Actual: the counter is unconditional.
  test("NOT armed by the target itself — the opponent's first spell of the turn is not countered ('another spell')", async () => {
    const game = await board().build();
    await p2Bolts(game, "boltA");
    await trySandsThenSettle(game, "boltA");
    expect(game.zoneOf("boltA")).toBe("trash"); // resolved normally
    expect(game.state("victim").damage).toBe(3);
  });

  // Expected: P2 playing a UNIT earlier this turn is not "a spell" → their first spell stays safe.
  // Actual: countered regardless.
  test("a unit the opponent played this turn is not a spell — their first SPELL afterwards is still safe", async () => {
    const game = await board().resources(P2, { energy: 6 }).hand(P2, SHIELDBEARER, "sol").unit(P2, "base", { might: 1, name: "Dummy" }, "dummy").build();
    await game.p2.play("sol");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("dummy"); // the stun trigger's target
      await game.settle();
    }
    expect(game.zoneOf("sol")).toBe("base");
    await p2Bolts(game, "boltA");
    await trySandsThenSettle(game, "boltA");
    expect(game.state("victim").damage).toBe(3);
  });

  // Expected: "an OPPONENT has played" — on P1's own turn, P1's earlier spell does not arm Sands against
  // P2's first (Reaction) spell. Actual: countered regardless.
  test("the caster's OWN spells this turn don't count — P2's first spell (a Reaction on my turn) is not countered", async () => {
    // P1 resolves My Bolt (P1 has now played a spell), then casts My Bolt 2; P2 reacts with Quick Bolt —
    // P2's first spell of the turn — and P1 answers with Sands on Quick Bolt.
    const game2 = await scenario()
      .active(P1)
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 5, name: "Victim" }, "victim")
      .unit(P2, "base", { might: 5, name: "Theirs" }, "theirs")
      .hand(P1, bolt("My Bolt"), "mine")
      .hand(P1, bolt("My Bolt 2"), "mine2")
      .hand(P2, bolt("Quick Bolt", "reaction"), "quick")
      .hand(P1, CARD, "sands")
      .build();
    await game2.p1.cast("mine", { targets: "theirs" });
    await game2.settle();
    expect(game2.state("theirs").damage).toBe(3); // P1 (not an opponent of P1) has played a spell this turn
    await game2.p1.cast("mine2", { targets: "theirs" });
    await game2.p1.passPriority();
    await game2.p2.cast("quick", { targets: "victim" }); // P2's FIRST spell this turn
    await game2.p2.passPriority();
    expect(game2.actingSeat()).toBe(P1);
    await trySandsThenSettle(game2, "quick");
    expect(game2.state("victim").damage).toBe(3); // Quick Bolt was not countered
  });

  // Expected: spells P2 played LAST turn don't count "this turn". Actual: countered regardless.
  test("'this turn' — a spell the opponent played on their previous turn does not arm it on their next", async () => {
    const game = await board().turn(2).build();
    await game.p2.cast("boltA", { targets: "victim" });
    await game.settle();
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2 again, fresh turn; pools were emptied, refill both
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    await game.p1.do("addResources", { energy: 1, power: { calm: 1 } });
    await p2Bolts(game, "boltB"); // P2's first spell THIS turn
    await trySandsThenSettle(game, "boltB");
    expect(game.state("victim").damage).toBe(3);
  });

  test("'a spell' must be on the chain (355.8 / 355.9.a.2): empty chain on my own turn → not castable; a triggered ABILITY alone is not a spell", async () => {
    const own = await scenario().active(P1).resources(P1, { energy: 1, power: { calm: 1 } }).hand(P1, CARD, "sands").build();
    expect(own.p1.can("cast", "sands")).toBe(false);
    const game = await board().resources(P2, { energy: 5 }).hand(P2, SHIELDBEARER, "sol").build();
    await game.p2.cast("boltA", { targets: "victim" });
    await game.settle(); // arm the condition so only the targeting rule is under test
    await game.p2.play("sol", { answers: ["victim"] }); // rule 402 (finalization): the stun target is picked before priority
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sol", triggered: true })]);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "sands")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sands", { targets: "sol" }));
    expect(r.ok).toBe(false);
  });

  test("cannot target itself (355.9.c): with only Bolt B on the chain the sole legal target is Bolt B", async () => {
    const game = await board().build();
    await game.p2.cast("boltA", { targets: "victim" });
    await game.settle();
    await p2Bolts(game, "boltB");
    const targets = game.p1.option("cast", "sands")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["boltB"]]);
  });
});
