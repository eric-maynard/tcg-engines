/**
 * Core rules — effect-driven arrivals contest a battlefield and stage Showdowns / Combats exactly
 * like a Standard Move (one helper: `operations/arrive-at-battlefield.ts`).
 *
 *   190.3.a / 190.3.a.1   a unit that moves to, is played to, or otherwise becomes present at a
 *                         battlefield its CONTROLLER does not control applies Contested (450: the
 *                         arriving unit's controller, never whoever moved it)
 *   323.8 / 323.9         the Cleanup marks a Showdown / Combat as Staged there
 *   323.12 / 323.13 / 344 in a Neutral Open State the staged Showdown (showdown-only first) or
 *                         Combat BEGINS — never part-way through a resolution or with a Chain open
 *   345 / 464.2.c         the player who applied Contested gains Focus and is the Attacker; every
 *                         other occupant defends
 *   323.2.b               a unit whose control changes while standing among its former allies is
 *                         now present as an enemy → Contested + Combat
 *   449.2 / 447.2.c / 456 a forced move onto a battlefield already holding two OTHER players' units
 *                         becomes a Recall (not a Move: no move triggers)
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../harness";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Spell: "Move an enemy unit to a battlefield you control." (one controlled battlefield → no prompt). */
const DRAG = (timing: "action" | "reaction" = "action") => ({
  abilities: [{ effect: { target: { controller: "enemy", type: "unit" }, to: { battlefield: "controlled" }, type: "move" }, timing, type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: `Drag (inline ${timing}: Move an enemy unit to a battlefield you control)`,
  timing,
});

/** Spell: "Move a friendly unit to a battlefield." */
const MARCH = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "March (inline spell: Move a friendly unit to a battlefield)",
  timing: "action",
};

/** Spell: "Take control of an enemy unit at a battlefield." */
const STEAL = {
  abilities: [{ effect: { target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "take-control" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Turncoat (inline spell: Take control of an enemy unit at a battlefield)",
  timing: "action",
};

/** Spell: "Draw 1." — keeps a Chain open underneath a Reaction. */
const PONDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Ponder (inline spell: Draw 1)",
  timing: "action",
};

/** Unit: "When I move, draw 1." */
const SCOUT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  might,
  name: "Scout (inline: When I move, draw 1)",
});

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
}

function topShowdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

describe("Effect move onto an ENEMY-held battlefield → Contested by the mover's controller, Combat staged, begun by the Cleanup after the chain empties (190.3.a, 323.9, 323.13, 464.2.c)", () => {
  test("P1 drags P2's Brute onto P1's bf1: while the spell is on the chain nothing is contested; once it resolves bf1 is Contested BY P2, the Combat has begun with P2 attacking / holding Focus and Guard defending; the fight then resolves (Brute 4 kills Guard 3, P2 conquers)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
      .hand(P1, DRAG(), "drag")
      .build();

    await game.p1.cast("drag", { targets: "brute" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["drag"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);

    await resolveChain(game);
    expect(game.locationOf("brute")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(topShowdown(game)).toMatchObject({ active: true, attackingPlayer: P2, autoBegun: true, battlefieldId: "bf1", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("brute").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.actingSeat()).toBe(P2); // 345 — the player who applied Contested has Focus
    expect(game.p1.can("startShowdown")).toBe(false); // nothing left to "start" by hand
    expect(game.p1.points() + game.p2.points()).toBe(0); // arriving is not conquering

    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("brute")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
  });

  test("323.12/323.13 — during an open Chain nothing begins: a Reaction drag resolving on top of Ponder contests bf1 and stages the Combat, but the Showdown only begins once Ponder has resolved too (Neutral Open)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Pawn" }, "pawn")
      .hand(P1, PONDER, "ponder")
      .hand(P1, DRAG("reaction"), "drag")
      .build();

    await game.p1.cast("ponder");
    await game.p1.cast("drag", { targets: "pawn" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ponder", "drag"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Drag resolves, Ponder still pending
    expect(game.locationOf("pawn")).toBe("bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ponder"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 }); // staged …
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0); // … but not begun (Closed state)
    expect(game.state("pawn").combatRole).toBeFalsy();

    await resolveChain(game); // Ponder resolves → Neutral Open → the Cleanup begins the staged Combat
    expect(topShowdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("pawn").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });
});

describe("Effect move onto an EMPTY uncontrolled battlefield → Non-Combat Showdown begun by the Cleanup → all pass → Conquer (190.3.a, 323.12, 344.2, 348.2.a)", () => {
  test("March moves Scout to the lone open battlefield: its move trigger resolves first (Closed state), then the staged Showdown begins with P1's Focus; both pass → P1 controls bf1 and scores 1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", SCOUT(2), "scout")
      .hand(P1, MARCH, "march")
      .build();
    const hand0 = game.p1.hand().length - 1;

    await game.p1.cast("march", { targets: "scout" }); // one battlefield → no destination prompt
    await game.p1.passPriority();
    await game.p2.passPriority(); // March resolves: Scout arrives, its "When I move" trigger is now pending
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    if (game.chain().length > 0) {
      expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0); // 323.12: not while the chain is open
      await resolveChain(game);
    }
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(topShowdown(game)).toMatchObject({ active: true, autoBegun: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("scout").combatRole).toBeFalsy();
    expect(game.p1.points()).toBe(0);

    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
  });
});

describe("Control change at a shared battlefield — the stolen unit 'otherwise becomes present' as an enemy of its former allies (190.3.a, 323.2.b) → Combat with the new controller attacking", () => {
  test("P1 steals Big(5) standing next to P2's Small(2) at P2's bf2: bf2 is Contested by P1, the Cleanup begins the Combat (Big attacks, Small defends), Small dies and P1 conquers bf2", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5, name: "Big" }, "big")
      .unit(P2, "bf2", { might: 2, name: "Small" }, "small")
      .hand(P1, STEAL, "steal")
      .build();

    await game.p1.cast("steal", { targets: "big" });
    await resolveChain(game);
    expect(game.state("big")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(topShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("big").combatRole).toBe("attacker");
    expect(game.state("small").combatRole).toBe("defender");

    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("stealing the ONLY unit there is not a combat: the Cleanup hands the battlefield to the new controller (presence conquer), +1 point", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5, name: "Big" }, "big")
      .hand(P1, STEAL, "steal")
      .build();
    await game.p1.cast("steal", { targets: "big" });
    await game.settle();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
  });
});

describe("Parity with the Standard Move — the same helper opens the same Showdown", () => {
  test("moving A onto P2's held bf1 by Standard Move and dragging P2's unit onto P1's held bf1 by spell produce mirror-image combat showdowns (attacker = arriving controller, Focus = attacker, roles stamped, 'attack'/'defend' events fired once)", async () => {
    const std = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 4, name: "A" }, "a")
      .build();
    await std.p1.move("a", "bf1");
    const s1 = topShowdown(std);
    expect(s1).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true, passedPlayers: [], relevantPlayers: [P1, P2] });
    expect(s1?.autoBegun).toBeFalsy(); // the mover began it with their own Move
    expect(std.state("a").combatRole).toBe("attacker");
    expect(std.state("holder").combatRole).toBe("defender");

    const eff = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "A" }, "a")
      .hand(P1, DRAG(), "drag")
      .build();
    await eff.p1.cast("drag", { targets: "a" });
    await resolveChain(eff);
    const s2 = topShowdown(eff);
    expect(s2).toMatchObject({ active: true, attackingPlayer: P2, autoBegun: true, battlefieldId: "bf1", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true, passedPlayers: [], relevantPlayers: [P2, P1] });
    expect(eff.state("a").combatRole).toBe("attacker");
    expect(eff.state("holder").combatRole).toBe("defender");
    expect(eff.violations()).toEqual([]);
    expect(std.violations()).toEqual([]);
  });
});

describe("Free-for-all: a battlefield already holding units of two OTHER players cannot be entered by any means — the forced Move becomes a Recall (449.2, 447.2.c, 456.1)", () => {
  test("3 players — P2 and P3 face off at bf1; P1's March tries to send Scout (at bf2) there: Scout is recalled to P1's base instead, bf1 is untouched, and no 'When I move' trigger fires (a Recall is not a Move)", async () => {
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P3, "bf1", { might: 3, name: "Raider" }, "raider")
      .unit(P1, "bf2", SCOUT(2), "scout")
      .hand(P1, MARCH, "march")
      .build();
    const hand0 = game.p1.hand().length - 1;

    await game.p1.cast("march", { targets: "scout" }); // bf1 is the only OTHER battlefield → no prompt
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0); // no move trigger
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contestedBy ?? null).not.toBe(P1);
  });
});
