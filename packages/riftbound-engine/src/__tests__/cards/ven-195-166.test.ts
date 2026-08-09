/**
 * Soul's Reflection — ven-195-166 · Legend · Mind/Chaos
 *
 *   When you empower something else, empower me.
 *   Disempower me, [Exhaust]: Give a unit at a battlefield -2 [Might] this turn.
 *
 * Rules: 441 (Empower: a binary board status; 441.1.c empowering an Empowered object does nothing;
 * 441.2.a becoming Empowered is a referencable EVENT), 827 ([Empower] keyword = "[Cost]: Empower this"
 * — an activated ability that resolves off the chain), 383 (this legend's first line is a TRIGGERED
 * ability: it goes on the chain after the friendly empower resolved and empowers the legend on its own
 * resolution), "you empower" = the player whose effect performed the Empower action (not the owner of
 * the object), "something else" = any game object other than this legend, 442.1.a (Disempower only
 * affects an Empowered object → "Disempower me" is an unpayable cost while not Empowered), the shared
 * [Exhaust] cost, 355 (the -2 needs a unit AT A BATTLEFIELD — either side; none → cannot activate),
 * 143.2.b (Might below 0 counts as 0 in combat; a Might reduction is not damage and kills nothing by
 * itself), "this turn" (expires in the Ending Step), 343.1.b / 313.1.a (no [Action]/[Reaction] tag →
 * your Main Phase, Neutral Open only — not inside the showdown you just started).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Order of operations: Lifeblade's [Empower] resolves first (he is Empowered, legend not yet), THEN
 *     the legend's trigger is a separate chain item; only after it resolves is the legend Empowered.
 *  2. "YOU empower": the opponent empowering their own unit does nothing for me; ME empowering an ENEMY
 *     unit with my spell IS me empowering something else → my legend should light up.
 *  3. "something ELSE": an effect that empowers the legend directly must not queue its own trigger.
 *  4. The activated ability has two mandatory non-resource costs: be Empowered (to Disempower) AND be
 *     ready (to Exhaust); it also needs a battlefield unit to point at. Paying flips both statuses at
 *     once on activation; the -2 lands on resolution and is gone next turn.
 *  5. Re-arm loop: shoot (now disempowered + exhausted) → empower another unit → legend Empowered again,
 *     but still exhausted → no second shot this turn; next turn (Awaken) it is armed and ready.
 *  6. Softening line: shrink the lone 4-Might defender to 2 in Neutral Open, THEN attack with a 3 and
 *     conquer — the same attack without the shot loses. It cannot be done mid-showdown.
 *  7. Partner (Mind): an Empowered LEGEND is "something you control that's Empowered" for Shock Blast's
 *     discount.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-195-166";
const LIFEBLADE = "ven-093-166"; // Chaos unit · 4 Might · [Empower] [2] · [Empowered] +1 Might and Ganking
const APPRENTICE = "ven-047-166"; // Mind unit · 3 Might · [Empower] [2] · When I become Empowered, Predict 2 · [Empowered] +1
const SHOCK_BLAST = "ven-059-166"; // Mind [Action] 3 + [mind] · costs [2] less if you control something Empowered · deal 4 to a unit at a battlefield
const EMPOWER_UNIT = {
  abilities: [{ effect: { target: { type: "unit" }, type: "empower" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Empower Unit",
  rulesText: "[Action] Empower a unit.",
  timing: "action",
};
const EMPOWER_LEGEND = {
  abilities: [{ effect: { target: { controller: "friendly", type: "legend" }, type: "empower" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Empower Legend",
  rulesText: "[Action] Empower your legend.",
  timing: "action",
};

/** Legend already Empowered (and ready unless told otherwise); P2 holds bf1 with a 4-Might Guard; P1 has a 3-Might Hunter at home. */
function armed(meta: { empowered?: boolean; exhausted?: boolean } = { empowered: true }) {
  return scenario()
    .card("soul", { def: CARD, meta, owner: P1, zone: "legendZone" })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 3, name: "Hunter" }, "hunter");
}

describe("Soul's Reflection (ven-195-166)", () => {
  test("registry payload: [0] triggered on a controller empower → empower self; [1] activated, cost {disempower self + exhaust} → -2 Might this turn to a unit at a battlefield", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["mind", "chaos"], name: "Soul's Reflection" });
    expect(def?.abilities).toEqual([
      { effect: { target: "self", type: "empower" }, trigger: { event: "empower", on: "controller" }, type: "triggered" },
      {
        cost: { disempower: "self", exhaust: true },
        effect: { amount: -2, duration: "turn", target: { location: "battlefield", type: "unit" }, type: "modify-might" },
        type: "activated",
      },
    ]);
  });

  test("order of operations: Lifeblade's [Empower] [2] resolves (he is Empowered, legend NOT yet) → the legend's TRIGGER is a new chain item → it resolves → legend Empowered (still ready)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).legend(P1, CARD, "soul").unit(P1, "base", LIFEBLADE, "kl").build();
    expect(game.state("soul").isEmpowered).toBe(false);
    await game.p1.activate("kl");
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("kl")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("soul").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "soul", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("soul")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(game.violations()).toEqual([]);
  });

  test("'YOU empower' — the opponent empowering their own Lifeblade on their turn does nothing to my legend (and nothing is put on the chain for me)", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 2 }).legend(P1, CARD, "soul").unit(P2, "base", LIFEBLADE, "theirs").build();
    await game.p2.activate("theirs");
    await game.settle();
    expect(game.state("theirs").isEmpowered).toBe(true);
    expect(game.state("soul").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("'YOU empower something else' is about the ACTING player — my spell empowering an ENEMY unit must light up my legend", async () => {
    // Expected: after Test Empower Unit (cast by P1) empowers P2's unit, Soul's Reflection triggers and
    // ends Empowered. Actual: the empower event is attributed to the target's OWNER, so nothing fires.
    const game = await scenario().legend(P1, CARD, "soul").unit(P2, "base", { might: 2, name: "Theirs" }, "theirs").hand(P1, EMPOWER_UNIT, "emp").build();
    await game.p1.cast("emp", { targets: "theirs" });
    await game.settle();
    expect(game.state("theirs").isEmpowered).toBe(true);
    expect(game.state("soul").isEmpowered).toBe(true);
  });

  test("'something ELSE' — an effect that empowers the legend itself must not queue the legend's own trigger (the chain is empty once the spell resolves)", async () => {
    // Expected: the spell resolves, legend Empowered, NO Soul's Reflection item follows. Actual: a
    // (harmless, 441.1.c) self-trigger is put on the chain.
    const game = await scenario().legend(P1, CARD, "soul").hand(P1, EMPOWER_LEGEND, "el").build();
    await game.p1.cast("el", { targets: "soul" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("soul").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("Disempower me, [Exhaust]: both statuses flip ON ACTIVATION (un-triggered chain item, P2 window), the Guard is 4 until resolution, then 2 for this turn only — back to 4 after the turn passes; the base unit was never a target", async () => {
    const game = await armed().build();
    expect(game.p1.option("activateAbility:soul#1")?.fields.find((f) => f.name === "targets")?.options).toEqual([["guard"]]);
    expect((await game.p1.try((p) => p.activate("soul", 1, { targets: "home" }))).ok).toBe(false);
    await game.p1.activate("soul", 1, { targets: "guard" });
    expect(game.state("soul")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "soul", controller: P1, triggered: false })]);
    expect(game.state("guard").might).toBe(4);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.state("guard")).toMatchObject({ baseMight: 4, damage: 0, might: 2 });
    expect(game.state("home").might).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("guard").might).toBe(4);
  });

  test("cost/target gates: NOT Empowered → absent (442.1.a); Empowered but EXHAUSTED → absent; Empowered + ready but no unit at any battlefield → absent; energy is never involved", async () => {
    const act = (g: { p1: { legal(): readonly { key: string }[] } }) => g.p1.legal().some((o) => o.key === "activateAbility:soul#1");
    expect(act(await armed({}).resources(P1, { energy: 9 }).build())).toBe(false);
    expect(act(await armed({ empowered: true, exhausted: true }).build())).toBe(false);
    expect(act(await scenario().card("soul", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" }).unit(P2, "base", { might: 4, name: "Homebody" }, "home").unit(P1, "base", { might: 3, name: "Hunter" }, "hunter").build())).toBe(false);
    const ok = await armed().build();
    expect(act(ok)).toBe(true);
    expect(ok.p1.energy()).toBe(0);
  });

  test("softening line: shrink the lone Guard 4 → 2 in Neutral Open, then the 3-Might Hunter attacks, kills it, survives and conquers; WITHOUT the shot the same attack just dies", async () => {
    const game = await armed().build();
    await game.p1.activate("soul", 1, { targets: "guard" });
    await game.settle();
    expect(game.state("guard").might).toBe(2);
    await game.p1.move("hunter", "bf1");
    expect(game.state("guard")).toMatchObject({ combatRole: "defender", might: 2 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("hunter")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);

    const noShot = await armed().build();
    await noShot.p1.move("hunter", "bf1");
    await noShot.settle();
    expect(noShot.zoneOf("hunter")).toBe("trash");
    expect(noShot.state("soul").isEmpowered).toBe(true); // unused
  });

  test("timing: too late once the showdown is open — with Focus in my own attack the ability is not offered; nor on the opponent's turn", async () => {
    const game = await armed().autoProcedures(false).build();
    await game.p1.move("hunter", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:soul#1")).toBe(false);
    const opp = await armed().active(P2).build();
    expect(opp.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });

  test("143.2.b — a reduction is not damage: a 1-Might defender at -2 reads below zero yet stays on the board; in combat it deals 0 and dies to a 1-Might attacker who conquers unhurt", async () => {
    const game = await scenario()
      .card("soul", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Wisp" }, "wisp")
      .unit(P1, "base", { might: 1, name: "Gnat" }, "gnat")
      .build();
    await game.p1.activate("soul", 1, { targets: "wisp" });
    await game.settle();
    expect(game.state("wisp").might).toBeLessThanOrEqual(0);
    expect(game.zoneOf("wisp")).toBe("battlefield-bf1"); // not dead from the reduction alone
    await game.p1.move("gnat", "bf1");
    await game.settle();
    expect(game.zoneOf("wisp")).toBe("trash");
    expect(game.locationOf("gnat")).toBe("bf1");
    expect(game.state("gnat").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("re-arm loop: shoot (disempowered + exhausted) → Apprentice Mage's [Empower] [2] re-Empowers the legend via the trigger, but it stays EXHAUSTED → no second shot this turn; next turn it is armed AND ready and shoots again", async () => {
    const game = await armed().resources(P1, { energy: 2 }).unit(P1, "base", APPRENTICE, "mage").unit(P2, "bf1", { might: 3, name: "Second" }, "second").build();
    await game.p1.activate("soul", 1, { targets: "guard" });
    await game.settle();
    expect(game.state("soul")).toMatchObject({ isEmpowered: false, isExhausted: true });
    await game.p1.activate("mage");
    await game.settle({ policy: "first" }); // Predict 2 look-and-arrange is answered arbitrarily
    expect(game.state("mage").isEmpowered).toBe(true);
    expect(game.state("soul")).toMatchObject({ isEmpowered: true, isExhausted: true });
    expect(game.p1.can("activateAbility:soul#1")).toBe(false);
    await game.advanceTurn(); // P2
    expect(game.state("guard").might).toBe(4); // "this turn" wore off
    await game.advanceTurn(); // P1: Awaken readies the legend; Empowered persisted (441.1.a — no duration)
    expect(game.state("soul")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(game.p1.can("activateAbility:soul#1")).toBe(true);
    await game.p1.activate("soul", 1, { targets: "second" });
    await game.settle();
    expect(game.state("second").might).toBe(1);
  });

  test("a second friendly empower while the legend is already Empowered is harmless (441.1.c): legend stays Empowered and ready, no violation", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).card("soul", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" }).unit(P1, "base", LIFEBLADE, "kl").build();
    await game.p1.activate("kl");
    await game.settle();
    expect(game.state("kl").isEmpowered).toBe(true);
    expect(game.state("soul")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("partner — Shock Blast: an Empowered LEGEND is 'something you control that's Empowered' → [2] less: castable and fully paid from 1 energy + [mind]", async () => {
    // Expected: the legend (a game object you control, Empowered) satisfies the discount gate → 1 + [mind]
    // casts it. Actual: the gate only scans base and battlefield zones, never the legend zone → needs 3.
    const game = await armed().resources(P1, { energy: 1, power: { mind: 1 } }).hand(P1, SHOCK_BLAST, "blast").build();
    expect(game.p1.can("cast", "blast")).toBe(true);
    await game.p1.cast("blast", { targets: "guard" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    const unarmed = await armed({}).resources(P1, { energy: 1, power: { mind: 1 } }).hand(P1, SHOCK_BLAST, "blast").build();
    expect(unarmed.p1.can("cast", "blast")).toBe(false);
  });
});
