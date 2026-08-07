/**
 * Kha'Zix, Mutating Horror — unl-143-219 · Unit (Champion, Kha'Zix) · Chaos · 4 energy + [chaos] · 4 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP.
 *
 * Rules: 822 (Ambush ≡ "I may be played to a battlefield where you control units" + "I have Reaction
 * while being played there" — base is NOT a Reaction destination, a battlefield with only enemy units
 * is not an Ambush destination), 383.4.e/f (attack/defend triggers fire when the unit gains the
 * designation; an extra "if" requirement is checked right then and, if false, the ability does not
 * trigger this combat at all — 383.2.a.1, 383.4.e.2.b), 740.2.a (a unit is ALONE when no other unit of
 * its side is at that location — Kha'Zix himself may have company), 464.2.c.3.a (a unit that becomes
 * present mid-combat gains Attacker/Defender in the next Cleanup → its defend trigger fires then),
 * 359.2.c (a played unit enters exhausted, Ambush or not), "this turn" ends with the turn; XP persists.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "an ENEMY unit is alone HERE": one defender → trigger; two defenders → nothing (no Might, no XP),
 *     even though the fight might have been winnable with the +2. Kha'Zix attacking WITH an ally against
 *     a lone defender still triggers — the loneliness that matters is the enemy's.
 *  2. Walking onto an empty battlefield is a conquer, not an attack: no trigger, no XP.
 *  3. Defend half on the opponent's turn: a lone 5-Might raider into a 4-Might Kha'Zix loses to the
 *     pumped 6; two raiders (3+2) get no trigger and kill him.
 *  4. Timing: the trigger is a chain item — before it resolves he is still 4 and XP is unchanged; the
 *     +2 lasts the turn (gone after the turn passes) while the 2 XP stay forever.
 *  5. Ambush: only inside a Reaction window, only to a battlefield where P1 already has a unit, never
 *     to base as a Reaction; still costs 4+[chaos]; enters exhausted; and — the deep one — arriving
 *     mid-combat makes him a Defender, so against a lone attacker his own trigger should fire.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-143-219";

const playLocations = (g: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; name: string; options?: readonly unknown[] }[] } | undefined } }) =>
  ((g.p1.option("play", "kz")?.fields.find((f) => f.arg === "to" || f.name === "location")?.options ?? []) as string[]);

function attackInto(defenders: number[], withAlly = false) {
  const b = scenario().xp(P1, 1).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "kz");
  defenders.forEach((m, i) => b.unit(P2, "bf1", { might: m, name: `Def${i}` }, `def${i}`));
  return withAlly ? b.unit(P1, "base", { might: 2, name: "Ally" }, "ally") : b;
}

describe("Kha'Zix, Mutating Horror (unl-143-219)", () => {
  test("registry payload: 4+[chaos] Chaos champion, 4 Might; Ambush keyword + ONE attack-or-defend trigger gated on 'an enemy unit alone here' giving self +2 Might (turn) then 2 XP", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, isChampion: true, might: 4, name: "Kha'Zix, Mutating Horror", tags: ["Kha'Zix"] });
    expect(def?.powerCost).toEqual(["chaos"]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Ambush", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { target: { controller: "enemy", location: "here", type: "unit" }, type: "alone-in-combat" },
      effect: {
        effects: [
          { amount: 2, duration: "turn", target: "self", type: "modify-might" },
          { amount: 2, type: "gain-xp" },
        ],
        type: "sequence",
      },
      trigger: { event: "attack-or-defend", on: "self" },
      type: "triggered",
    });
  });

  test("cost on your own turn: 4 energy + 1 chaos, to base (or a controlled battlefield), enters exhausted as a 4 with Ambush and no play effect; short a chaos or an energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "kz").build();
    expect(playLocations(game).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.play("kz", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("kz")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4, zone: "base" });
    expect(game.state("kz").keywords).toEqual(["Ambush"]);
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { chaos: 2 } }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
  });

  test("When I ATTACK a LONE defender: trigger on the chain (still 4, XP unchanged) → resolves to 6 Might and +2 XP → 6 kills the 5-Might defender, Kha'Zix survives and conquers", async () => {
    const game = await attackInto([5]).build();
    await game.p1.move("kz", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
    expect(game.state("kz")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.p1.xp()).toBe(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("kz").might).toBe(6);
    expect(game.p1.xp()).toBe(3);
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.state("kz")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("negative space — TWO defenders (2+2) are not 'an enemy unit alone here': nothing goes on the chain, no XP, he fights at 4, kills both but dies to their 4", async () => {
    const game = await attackInto([2, 2]).build();
    await game.p1.move("kz", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("kz").might).toBe(4);
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.zoneOf("def1")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("the ENEMY must be alone, not Kha'Zix: attacking together with an ally into one defender still triggers (+2 XP, 6 Might)", async () => {
    const game = await attackInto([3], true).build();
    await game.p1.move(["kz", "ally"], "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", triggered: true })]);
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.state("kz").might).toBe(6);
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space — moving onto an EMPTY enemy battlefield is a conquer but not an attack: no trigger, +1 point, XP unchanged, still 4 Might", async () => {
    const game = await attackInto([]).build();
    await game.p1.move("kz", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.state("kz").might).toBe(4);
  });

  test("'this turn' vs XP: after the attack the +2 Might lasts through P1's turn and is gone once the turn passes; the 2 XP persist", async () => {
    const game = await attackInto([1]).build();
    await game.p1.move("kz", "bf1");
    await game.settle();
    expect(game.state("kz").might).toBe(6);
    expect(game.p1.xp()).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("kz").might).toBe(4);
    expect(game.p1.xp()).toBe(3);
  });

  test("When I DEFEND against a LONE attacker (opponent's turn): trigger → 6 Might, +2 XP; the 5-Might raider dies, Kha'Zix holds bf1 undamaged; bonus ends with P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .xp(P1, 0)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "kz")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("kz").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("kz")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p2.endTurn();
    expect(game.state("kz").might).toBe(4);
    expect(game.p1.xp()).toBe(2);
  });

  test("negative space — defending against TWO attackers (3+2): no trigger, no XP, and the un-pumped 4-Might Kha'Zix dies to 5", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "kz")
      .unit(P2, "base", { might: 3, name: "R1" }, "r1")
      .unit(P2, "base", { might: 2, name: "R2" }, "r2")
      .build();
    await game.p2.move(["r1", "r2"], "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Ambush] window & destinations: nothing in P2's Neutral Open State; once P2 attacks bf1 (where P1 has a Scout) and passes Focus, Kha'Zix is playable ONLY to bf1 (not base, not the empty bf2), for the full 4+[chaos], entering exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "kz")
      .build();
    expect(game.p1.can("play", "kz")).toBe(false);
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("play", "kz")).toBe(true);
    expect(playLocations(game)).toEqual(["battlefield-bf1"]);
    expect((await game.p1.try((p) => p.play("kz", { to: "base" }))).ok).toBe(false);
    await game.p1.play("kz", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    // 359.2: a permanent leaves the chain as soon as it is finalized — he is on bf1 at once, exhausted.
    expect(game.state("kz")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.zoneOf("kz")).not.toBe("chain");
  });

  test("[Ambush] needs a battlefield where YOU have units (822.1.b): with P1's only unit in base, P2's attack on an empty P1 battlefield opens no Ambush destination", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "kz")
      .build();
    await game.p2.move("raider", "bf1");
    if (game.p2.can("passFocus")) {
      await game.p2.passFocus();
    }
    expect(game.p1.can("play", "kz")).toBe(false);
    expect(playLocations(game)).toEqual([]);
  });

  test("Ambushed INTO an ongoing combat, Kha'Zix gains Defender (464.2.c.3.a) so his own defend trigger fires vs the LONE raider: trigger on the chain → 6 Might, +2 XP, and Scout(2)+Kha'Zix(6) kill the raider", async () => {
    // After Kha'Zix resolves onto bf1 mid-showdown he is a Defender facing a lone attacker →
    // "When I defend, if an enemy unit is alone here" goes on the chain → +2 Might this turn, +2 XP.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "kz")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.play("kz", { to: "bf1" }); // 359.2: finalized → on bf1 immediately
    expect(game.zoneOf("kz")).toBe("battlefield-bf1");
    expect(game.state("kz").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.state("kz").might).toBe(6);
    expect(game.zoneOf("raider")).toBe("trash");
  });
});
