/**
 * Tactical Retreat — unl-175-219 · Spell · Order · 2 energy (no power) · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it
 *   instead. (Send it to base. This isn't a move.)
 *
 * Rules: 813 (Reaction: playable in Closed States and showdowns, on anyone's turn; resolves LIFO ahead of
 * what it answers), 355.10.c ("Choose a friendly unit" targets; the replacement itself does not), 367–375
 * (replacement effect: "would die … instead"; 370.1.a.1 replacing the death = the KILL / lethal-damage
 * event never happened — whatever the cause: damage, combat, or a "Kill" instruction), 391 ("the next
 * time … this turn": a one-shot delayed effect that lapses at end of turn), 418 (heal = clear ALL damage),
 * 455–456 (Recall: relocate to base; NOT a Move — move triggers stay silent, 456.1), 383.4 (Deathknell
 * needs an actual death), 465–466 (a defender that leaves combat alive leaves the attacker to conquer).
 *
 * Head-judge checklist for THIS card:
 *  1. Cause-agnostic: lethal spell damage, combat damage AND a plain "Kill a unit" (Vengeance) must all
 *     be replaced — the last one is where engines that hook only the damage path slip.
 *  2. In-response timing on the opponent's turn: cast after their lethal spell is on the chain; Retreat
 *     resolves first, arms the shield, then their spell "kills" → unit ends up home, exhausted, at 0.
 *  3. One-shot and this-turn: a second lethal hit the same turn kills; next turn the shield is gone.
 *  4. Side effects that key on death or movement must NOT fire: Deathknell (Soaring Scout) stays quiet,
 *     "When I move" (Imposing Challenger) stays quiet, the moved-units counter does not tick.
 *  5. Combat: a saved DEFENDER leaves the battlefield, so the attacker conquers it; a saved ATTACKER
 *     comes home and the defender keeps the field.
 *  6. Heal is total: pre-existing damage is wiped too, not just the lethal packet.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-175-219";
const VENGEANCE = "ogn-229-298"; // Order 4 + [order][order]: Kill a unit.
const SOARING_SCOUT = "ogn-216-298"; // Order 2, 1 Might: [Deathknell] — Channel 1 rune exhausted.
const CHALLENGER = "unl-105-219"; // Body 5, 5 Might: "When I move, you may move an enemy unit here …"
/** Inline 6-damage Action spell used as the lethal event. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 6",
  timing: "action",
};

/** P1 controls bf1 with a 3-Might Ally carrying 2 damage; P2 has a Foe at home. P1 holds Retreat (+ two Bolts) with exactly 2 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally", { damage: 2 })
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "tr")
    .hand(P1, BOLT, "bolt")
    .hand(P1, BOLT, "bolt2");
}

describe("Tactical Retreat (unl-175-219)", () => {
  test("registry payload: a Reaction spell that targets a FRIENDLY unit and installs a one-shot 'die' replacement whose sequence is heal(all) → exhaust → recall", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, name: "Tactical Retreat", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; timing?: string; effect: { type: string; replaces: string; duration?: string; target: unknown; replacement: { type: string; effects: { type: string; amount?: unknown }[] } } };
    expect(ab).toMatchObject({ timing: "reaction", type: "spell" });
    expect(ab.effect).toMatchObject({ replaces: "die", target: { controller: "friendly", type: "unit" }, type: "replacement" });
    expect(ab.effect.replacement.type).toBe("sequence");
    expect(ab.effect.replacement.effects.map((e) => e.type)).toEqual(["heal", "exhaust", "recall"]);
    expect(ab.effect.replacement.effects[0]?.amount).toBe("all");
    expect(JSON.stringify(ab.effect)).toMatch(/next|turn/i); // one-shot / this-turn scoping is encoded
  });

  test("cost & targeting: 2 energy; only FRIENDLY units are offered (never Foe); with no friendly unit on the board, or with 1 energy, it is not castable", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "tr")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["ally"]]);
    expect((await game.p1.try((p) => p.cast("tr", { targets: "foe" }))).ok).toBe(false);
    await game.p1.cast("tr", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tr", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("tr")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 2, isReady: true, zone: "battlefield-bf1" }); // nothing happens yet
    expect((await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 3 }, "foe").hand(P1, CARD, "tr").build()).p1.can("cast", "tr")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, CARD, "tr").build()).p1.can("cast", "tr")).toBe(false);
  });

  test("[Reaction] in response on the OPPONENT's turn: their 6-damage Bolt is on the chain, Retreat goes on top and resolves first; when Bolt resolves the Ally is instead fully healed (the old 2 damage too), exhausted, and home in base", async () => {
    const game = await board().active(P2).hand(P2, BOLT, "theirBolt").build();
    await game.p2.cast("theirBolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "tr")).toBe(true);
    await game.p1.cast("tr", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["theirBolt", "tr"]);
    await game.settle();
    expect(game.zoneOf("tr")).toBe("trash");
    expect(game.zoneOf("theirBolt")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("ally");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("[Reaction] inside a showdown: castable with Focus passed to P1 while P2's attacker stands on bf1", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 5, name: "Atk" }, "atk").build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "tr")).toBe(true);
  });

  test("a plain KILL is a death too (370.1.a.1) — answering P2's Vengeance with Retreat leaves the Ally alive: healed, exhausted, recalled to base", async () => {
    // Expected: after both resolve, ally is in P1's base, exhausted, damage 0. Actual: the replacement only
    // intercepts lethal-damage deaths; the "kill" instruction sends the Ally straight to the trash.
    const game = await board().active(P2).resources(P2, { energy: 4, power: { order: 2 } }).hand(P2, VENGEANCE, "venge").build();
    await game.p2.cast("venge", { targets: "ally" });
    await game.p2.passPriority();
    await game.p1.cast("tr", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["venge", "tr"]);
    await game.settle();
    expect(game.zoneOf("venge")).toBe("trash");
    expect(game.p1.trash()).not.toContain("ally");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("'the next time' is once: after the first lethal Bolt is absorbed (home, exhausted, 0 damage), a second Bolt the same turn kills the Ally", async () => {
    const game = await board().build();
    await game.p1.cast("tr", { targets: "ally" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    await game.p1.cast("bolt2", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("'this turn': armed on P1's turn and never used, the shield is gone on P2's turn — their Bolt kills the Ally", async () => {
    const game = await board().hand(P2, BOLT, "theirBolt").build();
    await game.p1.cast("tr", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("theirBolt", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("combat, saved DEFENDER: P2's 5-Might attacker would kill P1's lone 2-Might defender — it retreats home exhausted and unhurt instead, so bf1 is left undefended and P2 conquers it (+1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Def" }, "def")
      .unit(P2, "base", { might: 5, name: "Atk" }, "atk")
      .hand(P1, CARD, "tr")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("tr", { targets: "def" });
    await game.settle();
    expect(game.state("def")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("def");
    expect(game.state("atk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 2 < 5, cleared after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("combat, saved ATTACKER: P1's 3-Might Ally charges a 5-Might Wall, would die, and instead comes home exhausted at 0 damage; the Wall keeps bf2 and nobody scores", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .hand(P1, CARD, "tr")
      .build();
    await game.p1.cast("tr", { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf2");
    await game.settle();
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("no death happened → no [Deathknell]: a shielded 1-Might Soaring Scout bolted for 6 retreats home and channels NO rune (383.4); unshielded, the same Bolt kills it and channels 1", async () => {
    const control = await scenario().unit(P1, "base", SOARING_SCOUT, "scout").hand(P1, BOLT, "bolt").build();
    await control.p1.cast("bolt", { targets: "scout" });
    await control.settle();
    expect(control.zoneOf("scout")).toBe("trash");
    expect(control.p1.runes()).toHaveLength(1); // Deathknell channeled one
    const game = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", SOARING_SCOUT, "scout").hand(P1, CARD, "tr").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("tr", { targets: "scout" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "scout" });
    await game.settle();
    expect(game.state("scout")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("'This isn't a move' (456.1): a shielded Imposing Challenger bolted off bf1 lands in base with NO 'When I move' trigger and the moved-units count untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CHALLENGER, "ic")
      .unit(P2, "bf2", { might: 1, name: "Weak" }, "weak")
      .hand(P1, CARD, "tr")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("tr", { targets: "ic" });
    await game.settle();
    const movedBefore = game.gameState.unitsMovedThisTurn?.[P1] ?? 0;
    await game.p1.cast("bolt", { targets: "ic" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ic")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.chain()).toEqual([]); // no "Imposing Challenger" trigger
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(movedBefore);
    expect(game.locationOf("weak")).toBe("bf2");
  });

  test("a unit already IN base that would die is 'recalled' where it stands: healed to 0 and exhausted, still in base, not in the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home", { damage: 1 })
      .hand(P1, CARD, "tr")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("tr", { targets: "home" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "home" });
    await game.settle();
    expect(game.state("home")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("home");
    expect(game.p1.trash().sort()).toEqual(["bolt", "tr"]);
  });
});
