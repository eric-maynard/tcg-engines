/**
 * Baccai Witherclaw — ven-078-166 · Unit · Body · 4 energy · 4 Might
 *
 *   [Empower] [1][rainbow][rainbow] ([1][rainbow][rainbow]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +2 [Might].
 *   [Empowered][>] [Deathknell][>] Channel 2 runes exhausted. (When I die while Empowered, get the effect.)
 *
 * Head-judge notes (the tricky spots this file pins down):
 *  1. [Empower] is an ACTIVATED ability (827.1): it uses the chain (opponent may respond), only on
 *     your turn in an open state, and is switched off once Empowered (827.1.c.1) — even with another
 *     [1][rainbow][rainbow] floating. [rainbow] pips are payable by power of ANY domain (135.2.e.5.a).
 *  2. "I have +2 Might" is a self-only static (828.1.b.1): other units — friendly or enemy — must not
 *     move. It is continuous, so it is already on in a position that starts Empowered.
 *  3. The Deathknell is a DEPENDENT trigger: it exists only while Empowered. Dying un-empowered
 *     channels nothing and puts nothing on the chain; dying Empowered (spell kill OR combat) channels
 *     2 runes that enter EXHAUSTED (430.2) — pool +2, rune deck −2, no fresh energy.
 *  4. Look-back (428.1.a.1.b / 359.3.e.13): the "while Empowered" check reads the unit as it died, not
 *     the card now sitting in the trash (which has no statuses).
 *  5. Short rune deck (430.3): with 1 rune left it channels 1; with 0 it channels 0 — never an error.
 *  6. Partner/counter — Sanction (ven-035-166): a Sanction-empowered Witherclaw gets the +2 and the
 *     Deathknell too (441.2.a — any Empower source), loses both at end of turn, and its own [Empower]
 *     becomes legal again next turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-078-166";
const VENGEANCE = "ogn-229-298"; // Order spell · 4 + [order][order] · Kill a unit.
const SANCTION = "ven-035-166"; // Calm Reaction · 3 + [calm] · mode 0: Empower a unit, disempower it at end of turn.

function board(opts: { energy?: number; power?: Record<string, number>; empowered?: boolean; foeMight?: number } = {}) {
  return scenario()
    .resources(P1, { energy: opts.energy ?? 1, power: opts.power ?? { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: opts.foeMight ?? 6, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", CARD, "claw", opts.empowered ? { empowered: true } : undefined);
}

/** P1 kills its own Witherclaw with Vengeance and lets everything resolve. */
async function vengeanceOwnClaw(game: Game): Promise<void> {
  await game.p1.cast("veng", { targets: "claw" });
  await game.settle();
}

/** P1 casts Sanction, takes the Empower mode (if asked) and chooses `target`. */
async function sanctionEmpower(game: Game, target: string): Promise<void> {
  await game.p1.cast("sanction");
  for (let i = 0; i < 10; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick") {
      return;
    }
    const opt = d.options.find((o) => o.card === target);
    await (opt ? game.p1.answer({ keys: [opt.key], kind: "pick" }) : game.p1.chooseMode(0));
  }
}

describe("Baccai Witherclaw (ven-078-166)", () => {
  test("registry payload: activated Empower [1][rainbow][rainbow] (not-empowered gate), while-empowered +2 static, while-empowered Deathknell → channel 2 exhausted", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 4, might: 4, name: "Baccai Witherclaw" });
    expect(def?.powerCost).toBeUndefined();
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities[0]).toEqual({
      cost: { energy: 1, power: ["rainbow", "rainbow"] },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(abilities[1]).toMatchObject({ condition: { type: "while-empowered" }, effect: { amount: 2, type: "modify-might" }, type: "static" });
    const deathknell = abilities.find((a) => a.type === "triggered");
    expect(deathknell).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { amount: 2, exhausted: true, type: "channel" },
      trigger: { event: "die", on: "self" },
    });
  });

  test("cost: plays for exactly 4 energy as a 4-Might, non-Empowered unit; 3 energy (even with power floating) is one short", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "claw").build();
    await game.p1.play("claw");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("claw")).toBe("base");
    expect(game.state("claw")).toMatchObject({ baseMight: 4, isEmpowered: false, might: 4 });
    const poor = await scenario().resources(P1, { energy: 3, power: { body: 2, rainbow: 2 } }).hand(P1, CARD, "claw").build();
    expect(poor.p1.can("play", "claw")).toBe(false);
  });

  test("[Empower]: pays [1] + two rainbow pips, sits on the chain un-empowered (P2 may respond), resolves → Empowered 6 Might; Buddy and Wall untouched", async () => {
    const game = await board().build();
    expect(game.state("claw").might).toBe(4);
    await game.p1.activate("claw");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "claw", controller: P1, triggered: false })]);
    expect(game.state("claw").isEmpowered).toBe(false);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // 377.3 — response window
    await game.p2.passPriority();
    expect(game.state("claw")).toMatchObject({ baseMight: 4, isEmpowered: true, might: 6 });
    expect(game.state("buddy").might).toBe(2); // "I have" — self only
    expect(game.state("wall").might).toBe(6);
    expect(game.p1.can("activate", "claw")).toBe(false); // 827.1.c.1
  });

  test("135.2.e.5.a: the two [rainbow] pips can be paid with power of any domain — 1 energy + 2 body power activates and is fully spent", async () => {
    const game = await board({ power: { body: 2 } }).build();
    expect(game.p1.can("activate", "claw")).toBe(true);
    await game.p1.activate("claw");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.state("claw").isEmpowered).toBe(true);
  });

  test("negative space — not offered with 0 energy, with only one pip of power, when already Empowered, on the opponent's turn, or during a showdown", async () => {
    expect((await board({ energy: 0 }).build()).p1.can("activate", "claw")).toBe(false);
    expect((await board({ power: { rainbow: 1 } }).build()).p1.can("activate", "claw")).toBe(false);
    expect((await board({ empowered: true, energy: 5, power: { rainbow: 4 } }).build()).p1.can("activate", "claw")).toBe(false);
    expect((await board().active(P2).build()).p1.can("activate", "claw")).toBe(false);
    const sd = await board({ energy: 3, power: { rainbow: 4 } }).build();
    await sd.p1.move("buddy", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "claw")).toBe(false);
  });

  test("the +2 is a continuous static: a Witherclaw that starts Empowered is already 6 Might, and stays 6 two turns later", async () => {
    const game = await board({ empowered: true }).build();
    expect(game.state("claw")).toMatchObject({ isEmpowered: true, might: 6 });
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("claw")).toMatchObject({ isEmpowered: true, might: 6 });
  });

  // BUG — expected: killed while Empowered, the Deathknell is put on the chain and channels 2 runes
  // exhausted (808 / 428.1.a.1.b look-back). Actual: the `while-empowered` gate is read off the card
  // AFTER it reached the trash (statuses wiped), so the trigger never fires and nothing is channeled.
  test("Empowered Deathknell never fires — while-empowered is checked on the reset card in the trash, not the unit as it died (spell kill)", async () => {
    const game = await board({ empowered: true, energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "veng").build();
    const deckBefore = game.p1.runeDeck().length;
    expect(game.p1.runes()).toHaveLength(0);
    await game.p1.cast("veng", { targets: "claw" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Vengeance resolves → claw dies → Deathknell pending
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "claw", controller: P1, triggered: true })]);
    expect(game.p1.runes()).toHaveLength(0); // nothing channeled before it resolves
    await game.settle();
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(deckBefore - 2);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.runes()).toHaveLength(0); // "you" channel, not the killer/opponent
  });

  test("negative space — dying while NOT Empowered: no Deathknell item, no runes channeled", async () => {
    const game = await board({ energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "veng").build();
    const deckBefore = game.p1.runeDeck().length;
    await vengeanceOwnClaw(game);
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(deckBefore);
  });

  // BUG — same root cause as above: the combat death of an Empowered Witherclaw channels nothing.
  test("Empowered Deathknell never fires on a combat death — 6 vs 6 trade should still channel 2 exhausted runes", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.move("claw", "bf1");
    expect(game.state("claw")).toMatchObject({ combatRole: "attacker", might: 6 });
    await game.settle();
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("combat, one short: an un-empowered 4-Might Witherclaw into the 6-Might Wall just dies — Wall survives, no runes", async () => {
    const game = await board().build();
    await game.p1.move("claw", "bf1");
    expect(game.state("claw").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.p1.runes()).toHaveLength(0);
  });

  // BUG — same root cause (Deathknell never fires); once fixed this also pins the 430.3 partial channel.
  test("430.3 short rune deck — Empowered Deathknell with 1 rune left should channel that 1 exhausted (0 left → nothing, no error)", async () => {
    const one = await board({ empowered: true, energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "veng").fillDecks({ main: 10, runes: 1 }).build();
    expect(one.p1.runeDeck()).toHaveLength(1);
    await vengeanceOwnClaw(one);
    expect(one.p1.runes({ ready: false })).toHaveLength(1);
    expect(one.p1.runeDeck()).toHaveLength(0);
    const none = await board({ empowered: true, energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "veng").fillDecks({ main: 10, runes: 0 }).build();
    await vengeanceOwnClaw(none);
    expect(none.zoneOf("claw")).toBe("trash");
    expect(none.p1.runes()).toHaveLength(0);
    expect(none.isOver()).toBe(false);
    expect(none.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Sanction-empowered (another source, 441.2.a): the +2 turns on at once (6 Might) and its own [Empower] switches off, even with [1][rainbow][rainbow] floating", async () => {
    const game = await board({ energy: 4, power: { calm: 1, rainbow: 2 } }).hand(P1, SANCTION, "sanction").build();
    expect(game.p1.can("activate", "claw")).toBe(true);
    await sanctionEmpower(game, "claw");
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("claw")).toMatchObject({ isEmpowered: true, might: 6 });
    expect(game.state("buddy").might).toBe(2);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, rainbow: 2 } });
    expect(game.p1.can("activate", "claw")).toBe(false); // already Empowered → own [Empower] off
  });

  // BUG — same Deathknell root cause; the Sanction half of this scenario works (see previous test).
  test("Sanction-empowered Witherclaw killed the same turn should channel 2 exhausted (Deathknell is live under any Empower source)", async () => {
    const game = await board({ energy: 7, power: { calm: 1, order: 2 } }).hand(P1, SANCTION, "sanction").hand(P1, VENGEANCE, "veng").build();
    await sanctionEmpower(game, "claw");
    expect(game.state("claw")).toMatchObject({ isEmpowered: true, might: 6 });
    await vengeanceOwnClaw(game);
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
  });

  test("Sanction wears off at end of turn: next turn the Witherclaw is a plain 4 again, and its own [Empower] is offered once more", async () => {
    const game = await board({ energy: 3, power: { calm: 1 } }).hand(P1, SANCTION, "sanction").build();
    await sanctionEmpower(game, "claw");
    expect(game.state("claw")).toMatchObject({ isEmpowered: true, might: 6 });
    await game.advanceTurn(); // → P2: end-of-turn disempower has happened
    expect(game.state("claw")).toMatchObject({ isEmpowered: false, might: 4 });
    await game.advanceTurn(); // → P1 (channels 2 fresh runes)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 1, power: { rainbow: 2 } });
    expect(game.p1.can("activate", "claw")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
