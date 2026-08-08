/**
 * Diana, No Longer Human — unl-149-219 · Champion Unit (Diana) · Chaos · 4 energy + [chaos] · 3 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When you play a spell, give me +2 [Might] this turn.
 *
 * Rules: 822 (Ambush = "I may be played to a battlefield where you control units" + "I have [Reaction]
 * while being played there"; 822.1.c it only ADDS play locations), 355.2.a (default locations: your base
 * or a battlefield you control), 813 ([Reaction] timing = whenever you hold priority/focus, any turn),
 * 310.1.a (the opponent's Neutral Open state gives you no priority at all), 347.1.b (a card played in a
 * showdown starts a chain; when it closes Focus passes on), 419.4.a (a "when you play a spell" trigger
 * fires when the spell RESOLVES — 419.4.a.1 / 425.1.b a countered spell was never "played"), 359.3.e.10
 * (a spell whose instructions all fizzle still counts as played), 477 ("this turn" modifier ends with
 * the turn it was created in — whoever's turn that is), 465 (combat uses current Might).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. Ambush windows: on P2's turn Diana is unplayable in the neutral open state and while P2 holds
 *     Focus; once P1 has Focus/priority she may be played — but ONLY to a battlefield holding P1 units
 *     (never to base, never to an empty/enemy-only battlefield). On P1's own turn base stays legal and
 *     no extra battlefield opens up without friendly units there.
 *  2. Ambushed into a defence she is a DEFENDER at once and fights with her current Might.
 *  3. The +2 lands when the spell RESOLVES, not when it is put on the chain: chain = [spell] first, the
 *     trigger only appears after the spell left the chain; a Wind-Walled spell gives nothing.
 *  4. Only YOUR spells (P2's spell pumps P2's Diana, not yours); units/gear are not spells; two spells
 *     stack to +4; the bonus dies with the turn it was granted in — including a bonus earned on P2's turn.
 *  5. The real line: P2 swings 4 into Scout(1); P1 ambushes Diana (3), then casts a 1-cost [Action]
 *     spell with Focus → Diana 5 → defenders 6 ≥ 4 kill the raider and Diana survives to keep bf1.
 *  6. Cost 4 + [chaos]; enters exhausted; 3 Might; registry = [Ambush keyword, play-spell@controller
 *     trigger → modify-might +2 self this turn].
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-149-219";
const WIND_WALL = "ogn-064-298"; // [Reaction] Counter a spell. (3 + calm calm)
/** Inline 1-cost [Action] chaos spell: deal 1 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Moonbolt",
  timing: "action",
} as const;

const playLocations = (game: Game) =>
  ((game.p1.option("play", "diana")?.fields.find((f) => f.arg === "to")?.options as string[] | undefined) ?? []).sort();

/** P2's turn. P1 controls bf1 (Scout 1) and bf2 (Other 1); P2 has Raider(raider) in base; Diana + a Moonbolt in P1's hand with 6 energy + 1 chaos. */
function defence(raider = 4) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 6, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Scout" }, "scout")
    .unit(P1, "bf2", { might: 1, name: "Other" }, "other")
    .unit(P2, "bf3", { might: 1, name: "Guard" }, "guard")
    .unit(P2, "base", { might: raider, name: "Raider" }, "raider")
    .hand(P1, CARD, "diana")
    .hand(P1, BOLT, "bolt");
}

describe("Diana, No Longer Human (unl-149-219)", () => {
  test("registry payload: [Ambush] keyword + ONE triggered ability (play-spell by controller → +2 Might to self, this turn); 4 energy + [chaos], 3 Might, champion Diana", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, isChampion: true, might: 3, name: "Diana, No Longer Human", tags: ["Diana"] });
    expect(def?.powerCost).toEqual(["chaos"]);
    expect(def?.abilities).toEqual([
      { keyword: "Ambush", type: "keyword" },
      {
        effect: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
        trigger: { event: "play-spell", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 4 energy + 1 chaos to base on your turn; enters exhausted at 3 Might with Ambush; nothing triggers; 3 energy / no chaos / a fury pip → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "diana").build();
    expect(playLocations(game)).toEqual(["base"]); // no friendly units at any battlefield → Ambush adds nothing
    await game.p1.play("diana");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("diana")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
    expect(game.state("diana").keywords).toContain("Ambush");
    expect((await scenario().resources(P1, { energy: 3, power: { chaos: 2 } }).hand(P1, CARD, "diana").build()).p1.can("play", "diana")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "diana").build()).p1.can("play", "diana")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "diana").build()).p1.can("play", "diana")).toBe(false);
  });

  test("own turn locations: base + the battlefield you hold with a unit; an enemy-held battlefield and an empty uncontrolled one are NOT opened by Ambush", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: null })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CARD, "diana")
      .build();
    expect(playLocations(game)).toEqual(["base", "battlefield-bf1"]);
    expect((await game.p1.try((p) => p.play("diana", { to: "bf2" }))).ok).toBe(false);
    await game.p1.play("diana", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("diana")).toBe("bf1");
    expect(game.state("diana").isExhausted).toBe(true);
  });

  test("[Ambush] windows on P2's turn: no play in P2's neutral open state, none while P2 holds Focus; after P2 passes Focus she may go ONLY to bf1/bf2 (friendly units) — not base, not P2's bf3 — and lands at bf1 as a defender for 4+[chaos]", async () => {
    const game = await defence().build();
    expect(game.p1.can("play", "diana")).toBe(false); // 310.1.a
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("play", "diana")).toBe(false); // P2 has Focus
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(playLocations(game)).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    expect((await game.p1.try((p) => p.play("diana", { to: "base" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("diana", { to: "bf3" }))).ok).toBe(false);
    await game.p1.play("diana", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    expect(game.locationOf("diana")).toBe("bf1");
    expect(game.state("diana")).toMatchObject({ combatRole: "defender", isExhausted: true, might: 3 });
  });

  test("ambushed in with NO spell: 3 + 1 defenders vs Raider 4 → everything trades (4 lethal split over Scout and Diana; 4 back kills Raider) — the +2 needs an actual spell", async () => {
    const game = await defence().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.play("diana", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("diana")).toBe("trash");
    expect(game.state("diana").might).toBe(3);
  });

  test("the real line: ambush Diana, then (Focus back with P1) cast the 1-cost [Action] Moonbolt at Raider → on resolution Diana's trigger → 5 Might → defenders win, Raider dies, Diana holds bf1", async () => {
    const game = await defence().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.play("diana", { to: "bf1" });
    // 347.1.b: her play closed a chain → Focus moved to P2; P2 passes it back.
    for (let i = 0; i < 4 && !game.p1.can("cast", "bolt"); i++) {
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
      await game.acting().pass();
    }
    await game.p1.cast("bolt", { targets: "raider" });
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.state("diana").might).toBe(5);
    expect(game.zoneOf("raider")).toBe("trash"); // 1 (bolt) + 5 + 1 ≥ 4
    expect(game.locationOf("diana")).toBe("bf1"); // Raider's 4 cannot kill a 5 (Scout may soak 1 and die)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    // "this turn" = P2's turn: gone once P2's turn ends.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("diana").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("[Reaction] via priority too: on P2's turn, holding priority on P2's spell, P1 may ambush Diana — offered exactly the battlefield with a friendly unit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "bf2", { might: 1, name: "Guard" }, "guard")
      .hand(P1, CARD, "diana")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(playLocations(game)).toEqual(["battlefield-bf1"]);
    await game.p1.play("diana", { to: "bf1" });
    expect(game.locationOf("diana")).toBe("bf1");
    await game.settle();
    expect(game.state("scout").damage).toBe(1); // P2's spell still resolved …
    expect(game.state("diana").might).toBe(3); // … and being P2's spell it gave Diana nothing
  });

  test("timing of the trigger (419.4.a): after casting, the chain holds ONLY the spell and Diana is still 3; the trigger appears once the spell has resolved, then she is 5; end of turn → 3", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "diana").unit(P2, "base", { might: 3, name: "Foe" }, "foe").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "foe" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
    expect(game.state("diana").might).toBe(3);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Moonbolt resolves
    expect(game.state("foe").damage).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
    expect(game.state("diana").might).toBe(3);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("diana")).toMatchObject({ baseMight: 3, might: 5 });
    await game.advanceTurn();
    expect(game.state("diana").might).toBe(3);
  });

  test("two spells in one turn stack: 3 → 5 → 7 (and the base Might never changes)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "diana").unit(P2, "base", { might: 3, name: "Foe" }, "foe").hand(P1, BOLT, "b1").hand(P1, BOLT, "b2").build();
    await game.p1.cast("b1", { targets: "foe" });
    await game.settle();
    expect(game.state("diana").might).toBe(5);
    await game.p1.cast("b2", { targets: "foe" });
    await game.settle();
    expect(game.state("diana")).toMatchObject({ baseMight: 3, might: 7 });
  });

  test("counter-play — Wind Wall counters P1's spell: a countered spell was never 'played' (425.1.b) → no trigger, Diana stays 3; the next, uncountered spell does pump her", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .unit(P1, "base", CARD, "diana")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .hand(P1, BOLT, "b1")
      .hand(P1, BOLT, "b2")
      .hand(P2, WIND_WALL, "ww")
      .build();
    await game.p1.cast("b1", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "b1" });
    await game.settle();
    expect(game.zoneOf("b1")).toBe("trash");
    expect(game.state("foe").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.state("diana").might).toBe(3);
    await game.p1.cast("b2", { targets: "foe" });
    await game.settle();
    expect(game.state("diana").might).toBe(5);
  });

  test("only YOUR spells, only while on the board: P2's spell pumps P2's Diana (5) and not P1's (3); a Diana in hand gets nothing; playing a UNIT is not playing a spell", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .unit(P1, "base", CARD, "mine")
      .unit(P2, "base", CARD, "theirs")
      .unit(P1, "base", { might: 3, name: "Target" }, "target")
      .hand(P2, BOLT, "bolt")
      .hand(P2, { cardType: "unit", domain: "chaos", energyCost: 1, might: 1, name: "Cheapo" }, "cheapo")
      .build();
    await game.p2.play("cheapo");
    await game.settle();
    expect(game.state("theirs").might).toBe(3); // a unit is not a spell
    await game.p2.cast("bolt", { targets: "target" });
    await game.settle();
    expect(game.state("theirs").might).toBe(5);
    expect(game.state("mine").might).toBe(3);

    const inHand = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "diana").unit(P2, "base", { might: 3 }, "foe").hand(P1, BOLT, "bolt").build();
    await inHand.p1.cast("bolt", { targets: "foe" });
    await inHand.settle();
    expect(inHand.chain()).toEqual([]);
    expect(inHand.state("diana")).toMatchObject({ might: 3, zone: "hand" });
  });

  test("a spell whose only instruction fizzles still counts as played (359.3.e.10): Moonbolt's target bounced home by Gust in response → no damage, but Diana still gets +2", async () => {
    const GUST = "ogn-169-298"; // [Reaction] 1: Return a unit at a battlefield with 3 or less Might to its owner's hand.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "diana")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .hand(P1, BOLT, "bolt")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.cast("bolt", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("diana").might).toBe(5);
  });
});
