/**
 * Ruling 8959d8c1a6701ee5 — playing from Hidden: what is restricted to "here"?
 *   Stand United (OGN-053 → ogn-053-298, [Hidden][Action] "Buff a friendly unit. Buffs give an additional +1 [Might]
 *   to friendly units this turn.") · Hidden Blade (OGN-213 → ogn-213-298, [Hidden][Action] "Kill a unit at a
 *   battlefield. Its controller draws 2.") · Zhonya's Hourglass (OGN-077 → ogn-077-298, [Hidden] gear "If a friendly
 *   unit would die, kill this instead. Heal that unit, exhaust it, and recall it.")
 *
 * Q: What targeting restrictions apply to a card played from hidden, for these three cards?
 * A: Only effects that TARGET are restricted to the battlefield it was hidden at: Stand United's buff target and
 *    Hidden Blade's kill target must be there. Non-targeting parts are global: Stand United's "buffs give +1" rider
 *    reaches friendly units everywhere, and Zhonya's replacement effect (it does not target) saves a friendly unit
 *    dying at any location.
 * Rules: 811.1.d.2 (from Hidden: chosen units/locations must be here), 355.10 (what is targeting), 369–372
 *        (replacement effects do not target).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAND_UNITED = "ogn-053-298";
const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
const CHALLENGE = "ogn-128-298";

describe("Ruling 8959d8c1a6701ee5 — from Hidden, only TARGETED choices are limited to 'here'; non-targeting effects are global", () => {
  test("Stand United flipped at bf1: the buff target may only be a friendly unit AT bf1 (Far at bf2 is not offered) — but the '+1 per buff' rider also boosts the already-buffed Far at bf2", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Near" }, "near")
      .unit(P1, "bf2", { might: 2, name: "Far" }, "far", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .facedown(P1, "bf1", STAND_UNITED, "su")
      .build();
    expect(game.state("far").might).toBe(3); // 2 + its buff
    expect(game.p1.can("reveal", "su")).toBe(true);
    // the flip's legal target set: friendly units HERE only — Far (bf2) / Home (base) cannot be named …
    expect((await game.p1.try((p) => p.reveal("su", { targets: "far" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.reveal("su", { targets: "home" }))).ok).toBe(false);
    expect(game.zoneOf("su")).toBe("facedown-bf1");
    // … and with Near the only unit here, the flip locks it without asking
    await game.p1.reveal("su");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P1, targets: ["near"] })]);
    expect(game.p1.energy()).toBe(0); // played for [0]
    await game.settle();
    expect(game.zoneOf("su")).toBe("trash");
    expect(game.state("near")).toMatchObject({ isBuffed: true, might: 4 }); // 2 + buff 1 + rider 1
    expect(game.state("far")).toMatchObject({ isBuffed: true, might: 4 }); // rider is GLOBAL: bf2 unit also +1
    expect(game.state("home")).toMatchObject({ isBuffed: false, might: 2 }); // unbuffed → no rider
    // rider lasts this turn only
    await game.advanceTurn();
    expect(game.state("near").might).toBe(3);
    expect(game.state("far").might).toBe(3);
  });

  test("Hidden Blade flipped at bf1: it TARGETS, so only units at bf1 can be killed (the enemy at bf2 is not offered); the victim's controller draws 2", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Near" }, "near")
      .unit(P2, "bf2", { might: 2, name: "Away" }, "away")
      .unit(P2, "base", { might: 2, name: "Homebody" }, "homebody")
      .facedown(P1, "bf1", HIDDEN_BLADE, "hb")
      .build();
    // Put an enemy at bf1 too: P2's Intruder stands at bf1 alongside (bf1 stays P1's; not contested in setup).
    const game2 = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Near" }, "near")
      .unit(P2, "bf1", { might: 5, name: "Intruder" }, "intruder")
      .unit(P2, "bf2", { might: 2, name: "Away" }, "away")
      .facedown(P1, "bf1", HIDDEN_BLADE, "hb")
      .build();
    // (a) with no enemy here, the only legal target is P1's own Near — Away/Homebody are never offered
    await game.p1.reveal("hb");
    const da = game.decision();
    const offeredA = da?.kind === "pick" ? da.options.map((o) => o.card ?? o.key).sort() : game.chain()[0]?.targets ?? [];
    expect(offeredA).toEqual(["near"]);
    // (b) with an enemy here, both units AT bf1 are offered and nothing else; killing Intruder makes P2 draw 2
    await game2.p1.reveal("hb");
    const db = game2.decision();
    expect(db).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "hb" } });
    expect(db?.kind === "pick" ? db.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["intruder", "near"]);
    expect((await game2.p1.try((p) => p.pick("away"))).ok).toBe(false);
    const p2Hand = game2.p2.hand().length;
    await game2.p1.pick("intruder");
    await game2.settle();
    expect(game2.zoneOf("hb")).toBe("trash");
    expect(game2.zoneOf("intruder")).toBe("trash");
    expect(game2.zoneOf("away")).toBe("battlefield-bf2");
    expect(game2.p2.hand().length).toBe(p2Hand + 2);
    expect(game2.violations()).toEqual([]);
  });

  test("Zhonya's flipped at bf1 does not target: later this turn it replaces the death of a friendly unit at ANOTHER battlefield (bf2) — Zhonya's dies instead; the unit is healed, exhausted and recalled", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Near" }, "near")
      .unit(P1, "bf2", { might: 1, name: "Far" }, "far")
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.state("zh").isHidden).toBe(false);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh")); // a permanent now (recalled to base at the latest on Cleanup)
    expect(game.p1.energy()).toBe(2); // flipped for [0]
    // Far (1) at bf2 and Brute (5) deal their Might to each other → Far would die at bf2.
    await game.p1.cast("challenge", { targets: ["far", "brute"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("far")).toBe("base"); // recalled, not dead
    expect(game.state("far")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("brute").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
