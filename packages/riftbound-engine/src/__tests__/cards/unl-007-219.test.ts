/**
 * Smite — unl-007-219 · Spell · Fury · 2 energy + [fury] · [Action]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 3 to a unit at a battlefield. If it would die this turn, banish it instead.
 *
 * Rules: Action timing (your Neutral Open state or a showdown you have Focus in — never as a bare
 * Reaction on the opponent's chain); 355.9.b "a unit at a battlefield" = ANY controller, base units
 * excluded; 370–374 Replacement Effects: "would die this turn → banish instead" is a turn-long
 * replacement riding on THAT object (370.1.a.1 the death never happens → no Deathknell; killed by
 * ANY cause later this turn — combat included — still banishes; 359.3.e.4 a unit that left the board
 * and came back is a new object; the shield drops at end of turn); 372 two replacements on one death
 * (Smite + Tactical Retreat / Soraka) → the dying unit's controller orders them; 359.3.e.5 target
 * moved to base in response → no damage AND no lingering replacement; the spell itself goes to the
 * trash (only the unit is banished).
 *
 * Head-judge corner cases for THIS card:
 *   1. Exactly lethal (3 into a 3, or 3 into a 4 already carrying 1) → banishment, not trash;
 *      Watchful Sentry's Deathknell must NOT draw.
 *   2. Survivor (5-Might) keeps 3 damage; if it then dies IN COMBAT the same turn it is banished —
 *      while MY unit dying in that same combat goes to the trash as usual.
 *   3. Expiry: next turn the damage is gone and a later death is a plain trash death.
 *   4. Friendly fire is legal ("a unit"): Smite on my own 3-Might at a battlefield banishes it.
 *   5. Response: Flash moves the target to base → it takes nothing, and dying later that turn is a
 *      normal death (the replacement was an instruction tied to an illegal target).
 *   6. Two replacements (372): P2 answers Smite with Tactical Retreat on the target → P2, as the
 *      unit's controller, may apply Retreat first and keep the unit (base, exhausted, healed).
 *   7. Timing/cost: castable with Focus in a showdown I started; not castable on P2's chain; 2+[fury]
 *      exactly; base-only boards make it uncastable.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-007-219";
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 might, Deathknell — draw 1
const FLASH = "ogs-011-024"; // Reaction 2: move up to 2 friendly units to base
const TACTICAL_RETREAT = "unl-175-219"; // Reaction 2: friendly unit — next time it would die this turn, heal/exhaust/recall instead
const CLEAVE = "ogn-004-298"; // Action 1: give a unit Assault 3

const COST = { energy: 2, power: { fury: 1 } };

function board() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "smite");
}

describe("Smite (unl-007-219)", () => {
  test("registry payload: Action spell 2+[fury]; sequence on ONE target (unit at a battlefield) = damage 3, then a turn-long die→banish replacement on it", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "fury", energyCost: 2, name: "Smite", timing: "action" });
    expect(def?.powerCost).toEqual(["fury"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        effects: [
          { amount: 3, target: { location: "battlefield", type: "unit" }, type: "damage" },
          { duration: "turn", replacement: { type: "banish" }, replaces: "die", type: "replacement" },
        ],
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    });
    // "a unit" — no controller restriction on the target
    expect(JSON.stringify(def?.abilities?.[0])).not.toMatch(/"controller":"(enemy|friendly)"/);
  });

  test("cost & exactly-lethal: 2 energy + 1 fury; 3 into the 3-Might Three → Three is BANISHED (P2's banishment, not trash); Smite itself goes to the trash", async () => {
    const game = await board().build();
    await game.p1.cast("smite", { targets: "three" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("three")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["three"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("not affordable with 1 energy or without fury; not castable when the only units are in bases", async () => {
    expect((await board().resources(P1, { energy: 1, power: { fury: 1 } }).build()).p1.can("cast", "smite")).toBe(false);
    expect((await board().resources(P1, { energy: 2, power: { fury: 0 } }).build()).p1.can("cast", "smite")).toBe(false);
    const basesOnly = await scenario().resources(P1, COST).battlefield("bf1").unit(P2, "base", { might: 1 }, "home").unit(P1, "base", { might: 2 }, "mine").hand(P1, CARD, "smite").build();
    expect(basesOnly.p1.can("cast", "smite")).toBe(false);
  });

  test("targets = every unit AT A BATTLEFIELD regardless of controller (my own included); base units are refused", async () => {
    const game = await board().unit(P1, "bf1", { might: 3, name: "MyForward" }, "fwd").build();
    const targets = game.p1.option("cast", "smite")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["three"], ["five"], ["fwd"]]));
    expect((await game.p1.try((p) => p.cast("smite", { targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("smite", { targets: "mine" }))).ok).toBe(false);
    // Friendly fire: my own 3-Might at the battlefield is banished, into MY banishment.
    await game.p1.cast("smite", { targets: "fwd" });
    await game.settle();
    expect(game.zoneOf("fwd")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["fwd"]);
  });

  test("370.1.a.1 — banished 'instead' of dying: Watchful Sentry's Deathknell does NOT draw P2 a card", async () => {
    const game = await scenario().resources(P1, COST).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", WATCHFUL_SENTRY, "sentry").hand(P1, CARD, "smite").build();
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("smite", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("banishment");
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.chain()).toEqual([]);
  });

  test("prior damage counts toward lethal: a 4-Might already carrying 1 damage takes 3 → banished", async () => {
    const game = await scenario().resources(P1, COST).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Bruised" }, "bruised", { damage: 1 }).hand(P1, CARD, "smite").build();
    await game.p1.cast("smite", { targets: "bruised" });
    await game.settle();
    expect(game.zoneOf("bruised")).toBe("banishment");
  });

  test("'this turn' rides on the survivor: Five keeps 3 damage, then dies in combat to my 2-Might attacker the SAME turn → Five is banished, my attacker dies to the TRASH, nobody conquers", async () => {
    const solo = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, CARD, "smite")
      .build();
    await solo.p1.cast("smite", { targets: "five" });
    await solo.settle();
    expect(solo.zoneOf("five")).toBe("battlefield-bf1");
    expect(solo.state("five").damage).toBe(3);
    await solo.p1.move("mine", "bf1");
    await solo.settle();
    expect(solo.zoneOf("five")).toBe("banishment"); // 3 + 2 = lethal → replaced
    expect(solo.p2.trash()).toEqual([]);
    expect(solo.zoneOf("mine")).toBe("trash"); // took 5 — a normal death
    expect(solo.p1.banishment()).toEqual([]);
    expect(solo.gameState.battlefields.bf1?.controller ?? null).toBeNull(); // 190.4.c / 466.5.b
    expect(solo.p1.points()).toBe(0);
  });

  test("expiry across game.advanceTurn(): the damage clears at end of turn and a death on a LATER turn is a plain trash death", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
      .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .hand(P1, CARD, "smite")
      .build();
    await game.p1.cast("smite", { targets: "five" });
    await game.settle();
    expect(game.state("five").damage).toBe(3);
    await game.advanceTurn(); // → P2
    expect(game.state("five").damage).toBe(0);
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("five")).toBe("trash"); // 5 vs 5: both die, no banish any more
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p2.banishment()).toEqual([]);
  });

  test("359.3.e.5 response: P2 Flashes Five to base → Smite resolves with an illegal target: no damage; Smite still goes to the trash", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, FLASH, "flash").build();
    await game.p1.cast("smite", { targets: "five" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "five" });
    await game.settle();
    expect(game.zoneOf("five")).toBe("base");
    expect(game.state("five").damage).toBe(0);
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // cost stays paid
  });

  test("372 — P2 answers with Tactical Retreat on Three: two die-replacements → Three's controller (P2) orders them; applying Retreat first keeps Three (base, exhausted, 0 damage) and nothing is banished", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, TACTICAL_RETREAT, "retreat").build();
    await game.p1.cast("smite", { targets: "three" });
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "three" });
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      // The ordering choice belongs to P2 (controller of the dying unit), never to P1.
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
      const d = game.decision();
      const retreatKey = d?.kind === "pick" ? d.options.find((o) => o.card === "retreat" || /retreat/i.test(o.label))?.key : undefined;
      expect(retreatKey).toBeDefined();
      await game.p2.pick(retreatKey as string);
      await game.settle();
    }
    expect(game.zoneOf("three")).toBe("base");
    expect(game.state("three")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.trash()).toEqual(["retreat"]);
  });

  test("[Action] with Focus in a showdown: I attack Five with Mine, then Smite Five before combat — 3 now + 2 in combat = lethal → Five banished; Mine dies to trash", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, CARD, "smite")
      .build();
    await game.p1.move("mine", "bf1");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "smite")).toBe(true);
    await game.p1.cast("smite", { targets: "five" });
    await game.settle();
    expect(game.zoneOf("five")).toBe("banishment");
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("smite")).toBe("trash");
  });

  test("[Action] is not a Reaction: on P2's turn, with P2's Cleave on the chain and P1 holding priority, Smite is not legal and stays in hand", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, CLEAVE, "cleave").build();
    expect(game.p1.can("cast", "smite")).toBe(false);
    await game.p2.cast("cleave", { targets: "three" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "smite")).toBe(false);
    expect((await game.p1.try((p) => p.cast("smite", { targets: "three" }))).ok).toBe(false);
    expect(game.zoneOf("smite")).toBe("hand");
  });
});
