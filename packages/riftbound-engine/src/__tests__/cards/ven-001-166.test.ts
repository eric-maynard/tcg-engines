/**
 * Baccai Sandspinner — ven-001-166 · Unit · Fury · 6 energy · 6 Might
 *
 *   [Empower] [5]. This ability costs [3] less if you control 4 or fewer runes.
 *     (Pay the cost: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have [Deflect] and [Assault 2]. (Opponents must pay [rainbow] to choose me
 *     with a spell or ability. +2 [Might] while I'm an attacker.)
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. Empower cost is [5], or [2] with 4-or-fewer runes CONTROLLED (runes in the rune pool, ready or
 *      exhausted — 827.1.c.3: cost-altering text is part of the Empower cost). Boundary: exactly 4 → [2],
 *      exactly 5 → [5]. With ≤4 runes and only 2 energy the ability must be legal; with 5 runes and 4
 *      energy it must not be.
 *   2. "Use only if not Empowered" (827.1.c.1 / 441.1.b): once Empowered the ability is gone from the
 *      menu; Empowered is a binary state with no duration — it survives advanceTurn().
 *   3. The keywords are CONDITIONAL statics: before empowering there is no Deflect (an opponent's spell
 *      chooses it for free) and no Assault (attacks at 6). After: Deflect taxes only OPPONENTS one power
 *      of ANY domain (809.1.c.1); own spells are untaxed; Assault 2 applies only while attacking (8 as
 *      attacker, 6 as defender / in base).
 *   4. Assault stacks (807.2): Cleave's [Assault 3] on an Empowered Sandspinner → swings for 11 — and
 *      because Assault raises MIGHT (807.1.c), 10 combat damage is not lethal to it while attacking.
 *   5. Timing: a unit's activated ability is Main-Phase/Open-State/your-turn only — not during a
 *      showdown, not on the opponent's turn.
 *   6. Damage marked in combat is healed at Combat Cleanup (143.3.b.2) — assert survival, not damage.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-001-166";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn — 1 energy
const HEXTECH_RAY = "ogn-009-298"; // [Action] Deal 3 to a unit at a battlefield — 1 energy + [fury]

function withRunes(runes: number, energy: number) {
  return scenario().resources(P1, { energy }).runes(P1, "fury", runes).unit(P1, "base", CARD, "spinner");
}

function empowered() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .card("spinner", { def: CARD, meta: { empowered: true }, owner: P1, zone: "battlefield-bf1" });
}

describe("Baccai Sandspinner (ven-001-166)", () => {
  test("parsed abilities: [Empower] activated (cost 5, −3 with ≤4 runes, not-empowered restriction) + two while-empowered keyword statics", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 6, might: 6 });
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(3);
    expect(abilities[0]).toMatchObject({
      cost: { energy: 5 },
      costModifier: { reduction: 3 },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(abilities[1]).toMatchObject({ condition: { type: "while-empowered" }, effect: { keyword: "Deflect", type: "grant-keyword" }, type: "static" });
    expect(abilities[2]).toMatchObject({ condition: { type: "while-empowered" }, effect: { keyword: "Assault", type: "grant-keyword", value: 2 }, type: "static" });
  });

  test("cost to play: 6 energy, no power; enters base exhausted at 6 Might, not Empowered, no Deflect/Assault yet; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "spinner").build();
    await game.p1.play("spinner");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("spinner")).toBe("base");
    expect(game.state("spinner")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 6 });
    expect(game.state("spinner").keywords).not.toContain("Deflect");
    expect(game.state("spinner").keywords).not.toContain("Assault");
    const poor = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).hand(P1, CARD, "spinner").build();
    expect(poor.p1.can("play", "spinner")).toBe(false);
  });

  test("[Empower] with 5+ runes costs the full [5]: pays 5, resolves, the unit is Empowered and now shows Deflect + Assault", async () => {
    const game = await withRunes(5, 5).build();
    expect(game.p1.can("activate", "spinner")).toBe(true);
    await game.p1.activate("spinner");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("spinner").isEmpowered).toBe(true);
    expect(game.state("spinner").keywords).toEqual(expect.arrayContaining(["Deflect", "Assault"]));
    // rule 357.1.a: 5 runes keeps the cost at [5], and 4 floating energy plus a
    // ready rune exhausted during Pay Costs covers it — so it IS activatable.
    const short = await withRunes(5, 4).build();
    expect(short.p1.can("activate", "spinner")).toBe(true);
  });

  test("[Empower] costs [3] less with 4 or fewer runes — exactly 4 runes + 2 energy must be enough and charge only 2 (827.1.c.3)", async () => {
    // With 4 runes controlled the Empower cost is [2]; 2 energy suffices and is fully spent.
    const game = await withRunes(4, 2).build();
    expect(game.p1.can("activate", "spinner")).toBe(true);
    await game.p1.activate("spinner");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("spinner").isEmpowered).toBe(true);
  });

  test("with 0 runes and 5 energy the reduced Empower charges only [2], leaving 3", async () => {
    // 0 ≤ 4 runes → cost [2]; 3 energy remains.
    const game = await withRunes(0, 5).build();
    await game.p1.activate("spinner");
    expect(game.p1.energy()).toBe(3);
    await game.settle();
    expect(game.state("spinner").isEmpowered).toBe(true);
  });

  test("'Use only if not Empowered': once Empowered the ability is no longer offered, and the state persists across turns (441.1.a)", async () => {
    const game = await withRunes(5, 10).build();
    await game.p1.activate("spinner");
    await game.settle();
    expect(game.state("spinner").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "spinner")).toBe(false);
    expect(game.p1.energy()).toBe(5); // only one activation was paid for
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("spinner").isEmpowered).toBe(true);
    expect(game.state("spinner").keywords).toContain("Deflect");
    expect(game.p1.can("activate", "spinner")).toBe(false);
  });

  test("timing: the Empower ability is not available on the opponent's turn nor during a showdown", async () => {
    const oppTurn = await withRunes(5, 5).active(P2).build();
    expect(oppTurn.p1.can("activate", "spinner")).toBe(false);
    const sd = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "spinner")
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1"); // empty uncontrolled battlefield → non-combat showdown, P1 has Focus
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "spinner")).toBe(false);
  });

  test("not Empowered → no Deflect: an opponent's Hextech Ray chooses it with zero power and deals 3", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "spinner")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "spinner" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("spinner").damage).toBe(3);
  });

  test("Empowered → Deflect: the opponent cannot choose it without a SPARE power; with 1 extra power of ANY domain they can and it is spent (809.1.c.1)", async () => {
    const broke = await empowered().active(P2).resources(P2, { energy: 1, power: { fury: 1 } }).hand(P2, HEXTECH_RAY, "ray").build();
    expect(broke.state("spinner").keywords).toContain("Deflect");
    const r = await broke.p2.try((p) => p.cast("ray", { targets: "spinner" }));
    expect(r.ok).toBe(false);
    expect(broke.zoneOf("ray")).toBe("hand");
    expect(broke.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    const rich = await empowered().active(P2).resources(P2, { energy: 1, power: { calm: 1, fury: 1 } }).hand(P2, HEXTECH_RAY, "ray").build();
    await rich.p2.cast("ray", { targets: "spinner" });
    expect(rich.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await rich.settle();
    expect(rich.state("spinner").damage).toBe(3);
  });

  test("Deflect taxes opponents only: the controller's own Cleave chooses the Empowered Sandspinner for just 1 energy", async () => {
    const game = await empowered().resources(P1, { energy: 1 }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "spinner" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("spinner").grantedKeywords).toEqual(expect.arrayContaining([{ duration: "turn", keyword: "Assault", value: 3 }]));
  });

  test("Empowered Assault 2 in combat: 6 in base, attacks at 8, kills a 5-Might defender, conquers, then back to 6 (807.1.d.1)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
      .card("spinner", { def: CARD, meta: { empowered: true }, owner: P1, zone: "base" })
      .build();
    expect(game.state("spinner").might).toBe(6); // no Assault bonus outside an attack
    await game.p1.move("spinner", "bf1");
    expect(game.state("spinner").might).toBe(8); // attacker: 6 + Assault 2
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // 8 ≥ 5
    expect(game.locationOf("spinner")).toBe("bf1"); // took 5 < 6 — survives; damage healed at Combat Cleanup
    expect(game.state("spinner").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("spinner").might).toBe(6); // Assault ends with the attacker designation (807.1.d.1)
  });

  test("NOT Empowered in the same combat: attacks at only 6 — a 6-Might defender trades with it instead of losing cleanly to 8", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Defender" }, "def")
      .unit(P1, "base", CARD, "spinner")
      .build();
    await game.p1.move("spinner", "bf1");
    expect(game.state("spinner").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("spinner")).toBe("trash"); // 6 ≥ 6 both ways
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("Assault is attacker-only: an Empowered Sandspinner DEFENDING fights at 6 (a 7-Might attacker kills it and survives)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .card("spinner", { def: CARD, meta: { empowered: true }, owner: P1, zone: "battlefield-bf1" })
      .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf1");
    expect(game.state("spinner").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("spinner")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1"); // took 6 < 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Assault stacks (807.2): Cleave on the Empowered Sandspinner → Assault 5 → attacks at 11, one-shots a 10-Might defender AND survives (10 < 11 while attacking)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 10, name: "Wall" }, "wall")
      .card("spinner", { def: CARD, meta: { empowered: true }, owner: P1, zone: "base" })
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "spinner" });
    await game.settle();
    await game.p1.move("spinner", "bf1");
    expect(game.state("spinner").might).toBe(11);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("spinner")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("spinner").might).toBe(6); // Cleave's Assault 3 is still granted this turn but only counts while attacking
    expect(game.state("spinner").grantedKeywords).toEqual(expect.arrayContaining([{ duration: "turn", keyword: "Assault", value: 3 }]));
    await game.advanceTurn();
    expect(game.state("spinner").grantedKeywords.filter((k) => k.duration === "turn")).toEqual([]); // "this turn" expired
    expect(game.state("spinner").keywords).toContain("Assault"); // the Empowered static grant remains
  });
});
