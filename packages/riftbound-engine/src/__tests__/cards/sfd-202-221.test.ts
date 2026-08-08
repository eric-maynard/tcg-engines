/**
 * Hostile Takeover — sfd-202-221 · Spell · Mind/Order · 5 energy + 2 hybrid [mind|order] pips
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *   there. Otherwise, conquer.)
 *   Lose control of that unit and recall it at end of turn. (Send it to base. This isn't a move.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Controller ≠ owner for the rest of the turn: the unit is "friendly" to the caster (moves with
 *      their units, fights on their side, counts for control/conquer) but is still OWNED by the victim
 *      — if it dies it goes to its owner's trash, and the end-of-turn recall sends it to its (restored)
 *      controller's = owner's base, never the caster's.
 *   2. The reminder text is real rules fallout: a lone stolen unit means the caster now has the only
 *      units there → conquer (+1 point, control flips); other enemy units still there → the battlefield
 *      is contested by the caster and a combat opens (190.3.a → 323.9/323.13) with the caster attacking.
 *   3. "Ready it" matters: the stolen unit can be Standard-Moved by its new controller this turn.
 *   4. End of turn (317.1): control reverts AND the unit is recalled (455 — not a Move, 456). The
 *      caster keeps any point already scored; a battlefield left empty becomes uncontrolled (323.6).
 *      "End of turn" is the CURRENT turn — cast from Hidden on the opponent's turn it reverts that turn.
 *   5. Hidden (811): hide on your turn at a battlefield you control for one power of any domain; from
 *      the next turn it may be played as a [Reaction] for 0, targets restricted to units at THAT
 *      battlefield (811.1.d.2). Mid-combat the stolen attacker must switch to the caster's side
 *      (323.2.b: a unit with the opposite designation of its controller flips at the next cleanup).
 *   6. Cost/timing: 5 energy + two pips each payable by MIND or ORDER (135.2.e.6.c) — never fury;
 *      no [Action]/[Reaction] printed → from hand it is turn-player, open-state, empty-chain only.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-202-221";

/** P1's turn. bf1: P2's lone exhausted Victim(3). bf2: P2's Big(5, exhausted) + Small(2). Bases: Home(2) / Mine(2). */
function board(power: Record<string, number> = { order: 2 }, energy = 5) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim", { exhausted: true })
    .unit(P2, "bf2", { might: 5, name: "Big" }, "big", { exhausted: true })
    .unit(P2, "bf2", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 2, name: "Home" }, "home")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "ht");
}

/** P1 controls bf1 (Guard 5) with Hostile Takeover in hand and one mind power to hide it; P2 has two raiders. */
function hideout() {
  return scenario()
    .resources(P1, { energy: 0, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 4, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "elsewhere")
    .hand(P1, CARD, "ht");
}

describe("Hostile Takeover (sfd-202-221)", () => {
  test("registry payload: Hidden keyword + one spell ability = take-control(enemy unit @ battlefield) → ready → delayed lose-control with recall", async () => {
    const game = await board().build();
    expect(game.state("ht")).toMatchObject({ cardType: "spell", energyCost: 5, name: "Hostile Takeover" });
    expect(game.state("ht").powerCost).toEqual(["rainbow", "rainbow"]); // two hybrid pips
    expect(game.state("ht").domains.sort()).toEqual(["mind", "order"]);
    const abilities = peekDefaultCardPool()?.get(CARD)?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ keyword: "Hidden", type: "keyword" });
    expect(abilities[1]).toMatchObject({
      effect: {
        effects: [
          { target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "take-control" },
          { type: "ready" },
          { recall: true, type: "delayed-lose-control" },
        ],
        type: "sequence",
      },
      type: "spell",
    });
  });

  test("cost: 5 energy + two pips payable by ORDER, MIND, a mix, or [rainbow] (135.2.e.6.c) — never fury; 1 pip or 4 energy is short; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("ht", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("ht")).toBe("trash");
    expect((await board({ mind: 2 }).build()).p1.can("cast", "ht")).toBe(true);
    expect((await board({ mind: 1, order: 1 }).build()).p1.can("cast", "ht")).toBe(true);
    expect((await board({ rainbow: 2 }).build()).p1.can("cast", "ht")).toBe(true);
    expect((await board({ fury: 2 }).build()).p1.can("cast", "ht")).toBe(false);
    expect((await board({ order: 1 }).build()).p1.can("cast", "ht")).toBe(false);
    expect((await board({ order: 2 }, 4).build()).p1.can("cast", "ht")).toBe(false);
  });

  test("targets: ENEMY units AT A BATTLEFIELD only — the enemy's base unit and your own units are never offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ht")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["victim"], ["big"], ["small"]]));
    expect((await game.p1.try((p) => p.cast("ht", { targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("ht", { targets: "mine" }))).ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 5, power: { order: 2 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1 }, "mine").unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "ht").build();
    expect(none.p1.can("cast", "ht")).toBe(false);
  });

  test("lone enemy unit: you control it (owner unchanged), it is READIED, and with only your unit there you CONQUER (+1 point)", async () => {
    const game = await board().build();
    expect(game.state("victim").isExhausted).toBe(true);
    await game.p1.cast("ht", { targets: "victim" });
    // 344.2 / 323.12 — unopposed, the steal contests bf1 and the Cleanup opens a Non-Combat Showdown
    // (handed back once); only its close establishes control = Conquer (348.2.a).
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.state("victim")).toMatchObject({ controller: P1, isReady: true, owner: P2, zone: "battlefield-bf1" });
    expect(game.p1.units("bf1")).toEqual(["victim"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("big").controller).toBe(P2); // only the chosen unit
  });

  test("end of turn: control reverts and the unit is RECALLED to its owner's base; the emptied battlefield becomes uncontrolled; the point stays", async () => {
    const game = await board().build();
    await game.p1.cast("ht", { targets: "victim" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("victim")).toMatchObject({ controller: P2, owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("victim");
    expect(game.p1.base()).not.toContain("victim");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(1);
    // It is fully theirs again: P2 can move it out of base on their turn.
    await game.p2.move("victim", "bf1");
    expect(game.locationOf("victim")).toBe("bf1");
  });

  test("'Ready it' is usable: the caster may Standard-Move the stolen unit to base this turn — and at end of turn it still goes home to its OWNER's base", async () => {
    const game = await board().build();
    await game.p1.cast("ht", { targets: "victim" });
    await game.settle(); // the auto-begun Non-Combat Showdown (344.2) is handed back once …
    await game.settle(); // … Focus passes through it and P1 conquers bf1
    await game.p1.move("victim", "base");
    expect(game.state("victim")).toMatchObject({ controller: P1, isExhausted: true, zone: "base" });
    expect(game.p1.units("base").sort()).toEqual(["mine", "victim"]);
    await game.advanceTurn();
    expect(game.state("victim").controller).toBe(P2);
    expect(game.p2.base()).toContain("victim");
    expect(game.p1.units("base")).toEqual(["mine"]);
  });

  test("other enemies still there → a combat starts (190.3.a, 323.13): stolen Big(5) attacks Small(2), kills it, and conquers bf2", async () => {
    const game = await board().build();
    await game.p1.cast("ht", { targets: "big" });
    await game.settle({ policy: "first" });
    expect(game.state("big")).toMatchObject({ controller: P1, zone: "battlefield-bf2" });
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("a stolen unit that dies while yours goes to its OWNER's trash and is not recalled later (Ganking Victim 3 into Wall 6)", async () => {
    // Expected: P1 moves the readied (Ganking) Victim bf1 → bf2, combat vs Wall: 3 < 6 → Victim dies →
    // P2's trash (323.5 "owners' Trash"); at end of turn there is nothing to recall. Actual: the move
    // resolves but no combat opens (hostility is judged by owner, not controller), so Victim survives.
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 2 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Ganking"], might: 3, name: "Victim" }, "victim", { exhausted: true })
      .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
      .hand(P1, CARD, "ht")
      .build();
    await game.p1.cast("ht", { targets: "victim" });
    await game.settle(); // the auto-begun Non-Combat Showdown (344.2) is handed back once …
    await game.settle(); // … Focus passes through it and P1 conquers bf1
    await game.p1.move("victim", "bf2");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.trash()).toContain("victim");
    expect(game.p1.trash()).toEqual(["ht"]);
    await game.advanceTurn();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.base()).not.toContain("victim");
  });

  test("Hidden: hide at a battlefield you control for one power of any domain; not at one you don't control; the card is facedown there", async () => {
    const game = await hideout().build();
    expect(game.p1.option("hide", "ht")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    expect((await game.p1.try((p) => p.hide("ht", "bf2"))).ok).toBe(false);
    await game.p1.hide("ht", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("ht")).toBe("facedown-bf1");
    expect(game.state("ht").isHidden).toBe(true);
    expect(game.chain()).toEqual([]); // hiding opens no chain (811.1.c.2)
    const broke = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1 }, "g").hand(P1, CARD, "ht").build();
    expect(broke.p1.can("hide", "ht")).toBe(false); // no power to pay the [rainbow]
  });

  test("from Hidden on the opponent's turn: played as a Reaction for 0 during their attack; targets restricted to units at THAT battlefield (811.1.d.2)", async () => {
    const game = await hideout().build();
    await game.p1.hide("ht", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.legal().some((o) => o.card === "ht")).toBe(false); // no reaction window yet (closed state, their turn)
    await game.p2.move(["raider", "scout"], "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "ht")).toBe(true);
    await game.p1.reveal("ht");
    expect(game.p1.energy()).toBe(0); // [energy_0] …
    expect(game.p1.power()).toBe(0); // … and no power
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", controller: P1, triggered: false })]);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["raider", "scout"]); // not "elsewhere" (bf2), not Guard
  });

  test("stolen mid-combat, the attacker switches sides (323.2.b): Guard 5 + Raider 5 defend vs Scout 4 → Scout dies, bf1 held; Raider goes home at end of THIS (P2's) turn", async () => {
    // Expected: after Hostile Takeover resolves Raider is P1's and becomes a Defender at the next
    // cleanup; defenders (10) kill Scout, Scout's 4 cannot kill a 5; P1 keeps bf1, no points move; at
    // the end of P2's turn Raider reverts to P2 and is recalled to P2's base. Actual: Raider keeps the
    // Attacker designation under P1's control and combat damage assignment loops forever.
    const game = await hideout().build();
    await game.p1.hide("ht", "bf1");
    await game.advanceTurn();
    await game.p2.move(["raider", "scout"], "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("ht");
    await game.p1.pick("raider");
    // P2 already scored bf2 on their own Hold step; the combat itself must move no points.
    const p2Before = game.p2.points();
    const stop = await game.settle({ maxSteps: 60, policy: "first" });
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ controller: P1, zone: "battlefield-bf1" });
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(p2Before);
    expect(game.zoneOf("ht")).toBe("trash");
    await game.advanceTurn(); // P2 ends → "end of turn" of the turn it was cast in
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("raider")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.p2.base()).toContain("raider");
  });

  test("timing from hand (no [Action]/[Reaction] printed): not on the opponent's turn, not inside a showdown, not onto an open chain", async () => {
    expect((await board().active(P2).build()).p1.can("cast", "ht")).toBe(false);
    const showdown = await board().build();
    await showdown.p1.move("mine", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(showdown.p1.can("cast", "ht")).toBe(false);
    const chained = await board({ order: 4 }, 10).hand(P1, CARD, "ht2").build();
    await chained.p1.cast("ht", { targets: "victim" });
    expect(chained.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(chained.p1.can("cast", "ht2")).toBe(false);
  });

  test("responded to: if the target leaves the battlefield before resolution the spell does nothing — no control, no conquer, no point", async () => {
    const YANK = {
      abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Yank",
      timing: "reaction",
    } as const;
    const game = await board().hand(P2, YANK, "yank").build();
    await game.p1.cast("ht", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("yank", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.state("victim").controller).toBe(P2);
    expect(game.zoneOf("ht")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // costs stay paid
  });
});
