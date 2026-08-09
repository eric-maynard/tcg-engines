/**
 * Radiant Dawn — ogn-261-298 · Legend (Leona) · Calm/Order
 *
 *   When you stun one or more enemy units, buff a friendly unit.
 *   (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *
 * Rules: 423 (Stun — binary; 423.1.a.1 a stunned unit can't be stunned again, so choosing it is
 * no stun and no trigger; 423.1 "the act of selecting one or more Units" — one action), 411.4
 * ("when YOU do X" = a game action you are RESPONSIBLE for), 426 / 701 (Buff = a +1 counter; a
 * unit that already has one gets nothing — 426.1.b.1; not a "this turn" effect), 355.8 (the buff's
 * one target is chosen at finalization; a lone candidate is locked in, none → nothing happens).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Responsibility (411.4): my Rune Prison on my OWN unit is not "an enemy unit"; the opponent
 *     Rune-Prisoning MY unit is not "you"; and the opponent stunning THEIR OWN unit (enemy to me,
 *     but I did nothing) must not wake my legend either.
 *  2. 423.1.a.1: re-"stunning" an already-stunned enemy is legal to choose but stuns nothing → no buff.
 *  3. "one or more": ONE stun action hitting two enemy units is one trigger → exactly one buff.
 *  4. Buff mechanics: two friendly units → a real choice; one → locked without asking; none → the
 *     trigger fizzles quietly; the only candidate already buffed → still +1 total (no stacking);
 *     the counter survives the turn (unlike the stun, which clears at end of turn).
 *  5. Timing on the OPPONENT's turn: Zenith Blade ([Action]) cast with Focus in P2's showdown stuns
 *     the attacker → the buff prompt goes to P1 mid-showdown and lands before combat damage.
 *  6. Partner — Leona, Determined ("When I attack, stun an enemy unit here"): a stun performed by MY
 *     unit's ability is still mine → her attack both silences the defender and (via the legend)
 *     buffs her to 5 before damage, turning a 4-into-5 loss into a kill + conquer.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-261-298";
const RUNE_PRISON = "ogn-050-298"; // Calm [Action] 2 + [calm]: Stun a unit.
const ZENITH_BLADE = "ogn-262-298"; // Calm/Order [Action] 3 + [C][C]: Stun an enemy unit at a bf. You may move a friendly unit there.
const LEONA_DETERMINED = "ogn-238-298"; // 4 Might [Shield]; When I attack, stun an enemy unit here.
/** One stun ACTION over every enemy unit at the chosen battlefield ("one or more"). */
const MASS_DAZE = {
  abilities: [{ effect: { target: { controller: "enemy", location: "battlefield", quantity: "all", type: "unit" }, type: "stun" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Mass Daze",
  rulesText: "[Action] Stun all enemy units at a battlefield.",
  timing: "action",
} as const;

/** P1: Radiant Dawn, two friendly units in base, Rune Prison + its cost; P2: a unit at bf1 and a pre-stunned one. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .legend(P1, CARD, "rd")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Acolyte" }, "a")
    .unit(P1, "base", { might: 3, name: "Templar" }, "b")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 3, name: "Dazed" }, "dazed", { stunned: true })
    .hand(P1, RUNE_PRISON, "prison");
}

describe("Radiant Dawn (ogn-261-298)", () => {
  test("registry payload: Legend (Leona · Calm/Order) with ONE non-optional triggered ability — on stun of an enemy unit → buff a friendly unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Leona", domain: ["calm", "order"], name: "Radiant Dawn" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { controller: "friendly", type: "unit" }, type: "buff" },
      trigger: { event: "stun", on: { controller: "enemy", type: "unit" } },
      type: "triggered",
    });
    expect((def?.abilities?.[0] as { optional?: boolean }).optional ?? false).toBe(false);
  });

  test("stunning an enemy unit with Rune Prison puts the legend's trigger on the chain; with two friendly units P1 must CHOOSE (enemy units are not offered); the pick gets the +1 buff", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle(); // prison resolves → trigger finalizes and asks for its target
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rd", controller: P1, triggered: true })]);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, source: { cardId: "rd" } });
    expect(d.options.map((o) => o.key).sort()).toEqual(["a", "b"]);
    expect(game.state("b").isBuffed).toBe(false); // nothing before resolution
    await game.p1.pick("b");
    await game.settle();
    expect(game.state("b")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4 });
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.zoneOf("prison")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a lone friendly unit is locked in without a prompt; the opponent gets priority on the trigger before the buff lands", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .legend(P1, CARD, "rd")
      .unit(P1, "base", { might: 2 }, "solo")
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // prison resolves; the trigger is now the only chain item
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rd", targets: ["solo"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("solo").isBuffed).toBe(false);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("solo")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("negative space — stunning your OWN unit is not 'an enemy unit': no trigger, nobody buffed", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "a" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("a").isStunned).toBe(true);
    expect(game.chain()).toEqual([]);
    expect([game.state("a").isBuffed, game.state("b").isBuffed]).toEqual([false, false]);
  });

  test("negative space — choosing an ALREADY-STUNNED enemy stuns nothing (423.1.a.1), so the legend stays silent", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "dazed" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("dazed").isStunned).toBe(true);
    expect([game.state("a").isBuffed, game.state("b").isBuffed]).toEqual([false, false]);
    expect(game.zoneOf("prison")).toBe("trash"); // the spell still resolved and was paid for
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("negative space — 'when YOU stun': the opponent Rune-Prisoning one of MY units on their turn does not trigger my legend", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .legend(P1, CARD, "rd")
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P2, RUNE_PRISON, "prison")
      .build();
    await game.p2.cast("prison", { targets: "a" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("a")).toMatchObject({ isBuffed: false, isStunned: true, might: 2 });
  });

  test("'when YOU stun' (411.4) — the opponent stunning THEIR OWN unit (enemy to me, but not my action) must not trigger Radiant Dawn", async () => {
    // Expected: P2's Rune Prison on P2's own unit is a stun P2 is responsible for; P1's legend does
    // nothing and P1's unit stays unbuffed. Actual: the trigger only checks that the stunned unit is
    // an enemy of the legend's controller, so P1's lone unit is auto-buffed to 3.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .legend(P1, CARD, "rd")
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P2, RUNE_PRISON, "prison")
      .build();
    await game.p2.cast("prison", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("'one or more' — ONE stun action over two enemy units (423.1) is a single trigger: exactly one friendly unit ends up buffed", async () => {
    // Expected: Mass Daze stuns foe + dazed-free foe2 in one action → one Radiant Dawn item → one
    // pick → one buff (the other friendly unit stays unbuffed). Actual: the engine fires the stun
    // event per unit, so two legend items go on the chain and both friendly units get buffed.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "rd")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 3 }, "b")
      .unit(P2, "bf1", { might: 3 }, "foe1")
      .unit(P2, "bf1", { might: 3 }, "foe2")
      .hand(P1, MASS_DAZE, "mass")
      .build();
    await game.p1.cast("mass", { targets: "bf1" });
    await game.settle();
    expect([game.state("foe1").isStunned, game.state("foe2").isStunned]).toEqual([true, true]);
    expect(game.chain().filter((i) => i.cardId === "rd")).toHaveLength(1);
    game.script(P1, ["a", "a"]); // answer whatever target prompt(s) appear with the same unit
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("b")).toMatchObject({ isBuffed: false, might: 3 });
  });

  test("no friendly unit anywhere: the enemy is stunned, the trigger has nothing to buff and the game returns to an open state without a prompt", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .legend(P1, CARD, "rd")
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "foe" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the only friendly unit is already buffed: it is still the (forced) choice but gains nothing — one buff, +1 total (426.1.b.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .legend(P1, CARD, "rd")
      .unit(P1, "base", { might: 2 }, "vet", { buffed: true })
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 3 });
    await game.p1.cast("prison", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("vet")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 });
  });

  test("across the turn: the stun clears at end of turn (423.1.a.2) but the buff counter stays", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "foe" });
    await game.settle();
    await game.p1.pick("a");
    await game.settle();
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    await game.advanceTurn();
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("opponent's turn, in THEIR showdown: Zenith Blade with Focus stuns the attacker → P1 is asked for the buff mid-showdown; the buffed 3→4 defender then kills the silenced 4-Might attacker and holds the field", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 1, order: 1 } })
      .legend(P1, CARD, "rd")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, ZENITH_BLADE, "zb")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "zb")).toBe(false); // no Focus yet
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("zb", { targets: ["raider", "holder"] }); // [enemy to stun, friendly it may move]
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
    // Drive: pass priority; decline Zenith Blade's optional move if asked; the buff has one candidate.
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else if (d.kind === "pick") {
        const holder = d.options.find((o) => (o.card ?? o.key) === "holder");
        await (holder ? game.seat(d.seat).pick("holder") : game.seat(d.seat).decline());
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("holder")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.zoneOf("raider")).toBe("trash"); // stunned: dealt 0, took 4
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("partner — Leona, Determined attacking a lone 5-Might defender: her stun triggers the legend, the buff (only candidate: Leona) makes her 5, the silenced defender dies and P1 conquers", async () => {
    // Control first: the same attack WITHOUT the legend — the stunned Wall deals nothing, but 4 < 5
    // leaves it standing, so Leona is sent home and bf1 stays P2's.
    const control = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", LEONA_DETERMINED, "leona")
      .build();
    await control.p1.move("leona", "bf1");
    await control.settle();
    expect(control.state("wall").isStunned).toBe(true);
    expect(control.zoneOf("wall")).toBe("battlefield-bf1");
    expect(control.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(control.zoneOf("leona")).toBe("base");

    const game = await scenario()
      .legend(P1, CARD, "rd")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", LEONA_DETERMINED, "leona")
      .build();
    await game.p1.move("leona", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", triggered: true })]);
    await game.settle(); // stun (forced: wall) → legend trigger (forced: leona) → combat
    expect(game.state("leona")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("leona")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
