/**
 * Core rules — WHEN control of a battlefield is lost / gained: the ONE model
 * (`operations/battlefield-control.ts`, FIXER-PRIMER § Battlefield control timing).
 *
 * CARD-INDEPENDENT: every unit / spell / battlefield below is an inline filler definition.
 *
 * Rules covered (riftbound-rules ids):
 *   190.4 / 190.4.a-c   control rests on units; frozen while a Showdown/Combat is ONGOING there; lost in the following
 *                       Cleanup when the controller has no unit there, the turn is in an OPEN State and nothing is ongoing there
 *   309 / 310 / 401.1   Open = no chain item (Neutral Open AND Showdown Open); a Pending Item makes the state Closed
 *   323.4-323.7 / 808.1.d.2  Cleanup order: death triggers pending → kills → control loss (step 4) → facedown removal (step 5)
 *   323.8-323.13 / 344  a showdown is only STAGED at steps 6/7 and BEGINS at step 9 — staged is not "ongoing"
 *   348.2.a / 348.2.a.1 non-combat close: the sole remaining player establishes control = Conquer; nobody ⇒ nothing
 *   466.5 / 466.5.b-e   combat resolution: remaining player establishes control (Conquer iff a change), nobody ⇒ Uncontrolled,
 *                       facedown cards of the other player removed
 *   469.1 / 469.2 / 470 / 471.2.c  Conquer = GAIN control; keeping control you never lost is no Score
 *   107.3.c-d / 811     facedown legality follows the recorded controller
 *   190.6.d             "you" on a battlefield's ability = its controller; Uncontrolled ⇒ nobody
 *   harness             seeded `controller` with no unit is real control and lapses the same way
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

const spell = (name: string, effect: Record<string, unknown>, timing: "action" | "reaction" | "standard" = "action") => ({
  abilities: [{ effect, timing, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: timing === "standard" ? [] : [timing === "action" ? "Action" : "Reaction"],
  name,
  timing,
});

/** [Action] Kill a unit at a battlefield. */
const KILL = spell("Filler Kill", { target: { location: "battlefield", type: "unit" }, type: "kill" });
/** [Reaction] Move an enemy unit at a battlefield to its base. */
const GUST = spell("Filler Gust", { target: { controller: "enemy", location: "battlefield", type: "unit" }, to: "base", type: "move" }, "reaction");
/** [Reaction] Move a friendly unit at a battlefield to base. */
const RETREAT = spell("Filler Retreat", { target: { controller: "friendly", location: "battlefield", type: "unit" }, to: "base", type: "move" }, "reaction");
/** [Reaction] Move a friendly unit in your base to a battlefield (destination chosen at play — 355.4). */
const MARCH = spell("Filler March", { target: { controller: "friendly", location: "base", type: "unit" }, to: { battlefield: "any" }, type: "move" }, "reaction");
/** Standard-timed: move an enemy unit at a battlefield to its base (a "Charm home" for the caster's own turn). */
const SHOVE = spell("Filler Shove", { target: { controller: "enemy", location: "battlefield", type: "unit" }, to: "base", type: "move" }, "standard");

/** Unit · N Might · [Deathknell] Draw 1. */
const DK = (might: number) => ({
  abilities: [
    { effect: { amount: 1, type: "draw" }, keyword: "Deathknell", type: "keyword" },
    { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  energyCost: 0,
  keywords: ["Deathknell"],
  might,
  name: `Filler Deathknell ${might}`,
});

/** Hidden unit · N Might (4 + [fury] printed; free from facedown). */
const HIDDEN = (might: number) => ({
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  keywords: ["Hidden"],
  might,
  name: `Filler Hidden ${might}`,
  powerCost: ["fury"],
});

/** Battlefield card: "When you defend here, draw 1." (Ravenbloom-Conservatory shape) */
const WATCHPOST = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", location: "here", on: "controller" }, type: "triggered" }],
  cardType: "battlefield",
  name: "Filler Watchpost (When you defend here, draw 1)",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const bf = (game: Game, id = "bf1") => game.gameState.battlefields[id];
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
      continue;
    }
    await game.acting().passPriority();
  }
}

// ===========================================================================
// A. NEUTRAL OPEN — the controller's last unit leaves ⇒ control lost in the following Cleanup (323.6)
// ===========================================================================

describe("A · Neutral Open (190.4.c / 323.6): whatever removes the controller's last unit, control is lost in the following Cleanup — and a facedown card there goes to its owner's trash in the same Cleanup (323.7 / 107.3.d)", () => {
  function held() {
    return scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .facedown(P1, "bf1", HIDDEN(2), "hid");
  }

  test("MOVE away (Standard Move bf1 → base): bf1 uncontrolled, facedown trashed, no chain, no window", async () => {
    const game = await held().build();
    await game.p1.move("holder", "base");
    expect(bf(game)).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("hid")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("DEATH with nothing pending (killed by a spell, no Deathknell): once the spell has resolved the chain is empty ⇒ same Cleanup drops control and trashes the facedown card", async () => {
    const game = await held().active(P2).hand(P2, KILL, "kill").build();
    await game.p2.cast("kill", { targets: "holder" });
    expect(bf(game)?.controller).toBe(P1); // Closed while the spell is on the chain
    await resolveChain(game);
    expect(game.zoneOf("holder")).toBe("trash");
    expect(bf(game)?.controller).toBeNull();
    expect(game.zoneOf("hid")).toBe("trash");
  });

  test("BOUNCE / effect-move home by the opponent's spell: control survives exactly as long as the chain does, then lapses", async () => {
    const game = await held().active(P2).hand(P2, SHOVE, "shove").build();
    await game.p2.cast("shove", { targets: "holder" });
    await game.p2.passPriority();
    expect(bf(game)?.controller).toBe(P1); // still Closed: P1 holds priority over the pending spell
    await game.p1.passPriority(); // resolves
    expect(game.locationOf("holder")).toBe("base");
    expect(bf(game)?.controller).toBeNull();
    expect(game.zoneOf("hid")).toBe("trash");
  });
});

// ===========================================================================
// B. CLOSED STATE — a chain item / Pending item exists ⇒ control cannot lapse (309.1 / 401.1 / 808.1.d.2)
// ===========================================================================

describe("B · Closed State: while ANY chain item exists — including the Deathknell of the unit that just died (808.1.d.2 → 401.1) — the emptied battlefield stays controlled; the check happens at the first Open Cleanup", () => {
  function dkHeld() {
    return scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DK(2), "dk")
      .facedown(P1, "bf1", HIDDEN(3), "hid")
      .hand(P2, KILL, "kill");
  }

  test("last unit dies OUTSIDE any showdown but has [Deathknell]: with the trigger on the chain bf1 is STILL P1's, the facedown card is still there and P1 may flip it in response (official clarification 9a32c2cc829f221a / Glasc Mixologist)", async () => {
    const game = await dkHeld().build();
    await game.p2.cast("kill", { targets: "dk" });
    // resolve the kill only: the Deathknell is then the (only) chain item
    for (let i = 0; i < 4 && !game.chain().some((c) => c.cardId === "dk"); i++) {
      await game.acting().passPriority();
    }
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("dk")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dk", triggered: true })]);
    expect(bf(game)?.controller).toBe(P1);
    expect(game.zoneOf("hid")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "hid")).toBe(true);
    await game.p1.reveal("hid");
    expect(game.zoneOf("hid")).toBe("battlefield-bf1"); // 811.1.d.1 — enters AT bf1
    await game.settle();
    expect(bf(game)?.controller).toBe(P1); // a P1 unit holds it again: control never lapsed
    expect(game.p1.points()).toBe(0); // …and keeping it is no Conquer
  });

  test("declining to respond: the Deathknell resolves, the chain empties ⇒ THAT Cleanup drops control and trashes the facedown card (no extra window)", async () => {
    const game = await dkHeld().build();
    await game.p2.cast("kill", { targets: "dk" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(bf(game)).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("hid")).toBe("trash");
    expect(game.p1.can("reveal", "hid")).toBe(false);
  });
});

// ===========================================================================
// C. COMBAT ONGOING HERE — control frozen until 466.5
// ===========================================================================

describe("C · Combat ongoing at the battlefield (190.4.b): the defender losing every unit there mid-combat KEEPS control until the Resolution Step; coming back and winning is a defence (no point); the attacker winning is a Conquer; nobody left ⇒ Uncontrolled (466.5.b)", () => {
  /** P2's turn. P1 holds bf1 with lone Defender (2) + facedown Hidden 3; Reserve (5) in base with a March; P2 attacks with Raider (4) holding a Gust. */
  function siege() {
    return scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Defender" }, "def")
      .unit(P1, "base", { might: 5, name: "Filler Reserve" }, "reserve")
      .facedown(P1, "bf1", HIDDEN(3), "hid")
      .hand(P1, MARCH, "march")
      .unit(P2, "base", { might: 4, name: "Filler Raider" }, "raider")
      .hand(P2, GUST, "gust");
  }

  /** Raider attacks; P2 (Focus) Gusts the Defender home; the Gust resolves. */
  async function defenderGusted(): Promise<Game> {
    const game = await siege().build();
    await game.p2.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    await game.p2.cast("gust", { targets: "def" });
    await resolveChain(game);
    expect(game.locationOf("def")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    return game;
  }

  test("after the lone Defender is Gusted home mid-combat: bf1 is STILL P1's (contested by P2), the combat showdown continues, the facedown card stays and is playable", async () => {
    const game = await defenderGusted();
    expect(bf(game)).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)?.battlefieldId).toBe("bf1");
    expect(game.zoneOf("hid")).toBe("facedown-bf1");
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.p1.can("reveal", "hid")).toBe(true);
    expect(game.p2.points()).toBe(0);
  });

  test("P1 Marches the Reserve (5) in during the same combat and wins it: P1 KEPT bf1 throughout ⇒ a defence, NOT a Conquer — no point (469.1; rulings 0763e2fd879f27ba / 144a43c3a845800b / cd9356416a0b87e4)", async () => {
    const game = await defenderGusted();
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    await game.p1.cast("march", { targets: "reserve" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(bf(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
  });

  test("P1 does nothing: the showdown runs to its end and only THEN does the Raider establish control — a Conquer for P2 (+1); the un-played facedown card is removed at that point (466.5.c), not before", async () => {
    const game = await defenderGusted();
    game.script(P1, ["pass", "pass", "pass"]);
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(bf(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("hid")).toBe("trash");
  });

  test("nobody left at the Resolution Step (both traded): the battlefield becomes UNCONTROLLED (466.5.b) — no Conquer for anyone, and no Hold for the old controller later", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Filler Three" }, "d3")
      .unit(P2, "base", { might: 3, name: "Filler Three Too" }, "a3")
      .build();
    await game.p2.move("a3", "bf1");
    await game.settle();
    expect(game.zoneOf("d3")).toBe("trash");
    expect(game.zoneOf("a3")).toBe("trash");
    expect(bf(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });
});

// ===========================================================================
// D. STAGED ≠ ONGOING, non-combat showdowns, uncontrolled battlefields
// ===========================================================================

describe("D · a showdown merely STAGED in the same Cleanup does not protect control (323.6 is step 4, the showdown begins at step 9); during a showdown at an UNCONTROLLED battlefield nobody controls it until it closes (348.2.a)", () => {
  test("seeded unit-less enemy control: P1 walks onto P2's EMPTY bf1 ⇒ P2's control lapses in the Cleanup after the move, the non-combat showdown runs at an uncontrolled bf1, and its close makes P1 the controller = Conquer +1", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2, name: "Filler Walker" }, "w").build();
    expect(bf(game)?.controller).toBe(P2); // as seeded
    await game.p1.move("w", "bf1");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
    expect(bf(game)).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    await game.settle();
    expect(bf(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("seeded control WITH a unit of the controller is durable: nothing lapses on the first Cleanup", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Filler Token-ish" }, "t")
      .unit(P1, "base", { might: 2, name: "Filler Walker" }, "w")
      .build();
    await game.p1.endTurn(); // a full turn boundary of Cleanups
    await game.settle();
    expect(bf(game)?.controller).toBe(P2);
  });

  test("non-combat showdown where the contester is Gusted away: at its close NO player's units remain ⇒ nobody establishes control (348.2.a) — the battlefield stays uncontrolled and Contested is removed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler Walker" }, "w")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("w", "bf1");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    await game.p1.passFocus();
    await game.p2.cast("gust", { targets: "w" });
    await resolveChain(game);
    expect(game.locationOf("w")).toBe("base");
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(bf(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("190.6.d — 'When you defend here' on an UNCONTROLLED battlefield names nobody: P2 attacks P1's unit standing at an uncontrolled Watchpost ⇒ combat, but the Watchpost draws for no one; contrast: when P1 controls it, P1 draws", async () => {
    const uncontrolled = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("wp", { controller: null, def: WATCHPOST, inert: false })
      .unit(P1, "wp", { might: 3, name: "Filler Squatter" }, "sq")
      .unit(P2, "base", { might: 1, name: "Filler Poker" }, "pk")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    const hand0 = uncontrolled.p1.hand().length;
    await uncontrolled.p2.move("pk", "wp");
    expect(showdown(uncontrolled)?.isCombatShowdown).toBe(true);
    expect(uncontrolled.chain().filter((c) => c.cardId === "wp")).toEqual([]);
    await uncontrolled.settle();
    expect(uncontrolled.p1.hand()).toHaveLength(hand0);

    const controlled = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("wp", { controller: P1, def: WATCHPOST, inert: false })
      .unit(P1, "wp", { might: 3, name: "Filler Squatter" }, "sq")
      .unit(P2, "base", { might: 1, name: "Filler Poker" }, "pk")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    const hand1 = controlled.p1.hand().length;
    await controlled.p2.move("pk", "wp");
    expect(controlled.chain().filter((c) => c.cardId === "wp")).toHaveLength(1);
    await controlled.settle();
    expect(controlled.p1.hand()).toHaveLength(hand1 + 1);
  });
});

// ===========================================================================
// E. SHOWDOWN OPEN elsewhere is an Open State (310.3)
// ===========================================================================

describe("E · Showdown Open is an Open State (310.3): a battlefield with nothing ongoing THERE loses its unit-less control while a showdown runs elsewhere — it does not wait for Neutral Open", () => {
  test("P2 attacks bfB; during that combat P1 (Focus) Retreats its lone bfA unit home: once the Retreat resolves (Showdown Open) bfA is already uncontrolled, while contested bfB stays P1's", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "Filler Loner" }, "loner")
      .unit(P1, "bfB", { might: 4, name: "Filler Wall" }, "wall")
      .unit(P2, "base", { might: 1, name: "Filler Poker" }, "pk")
      .hand(P1, RETREAT, "retreat")
      .build();
    await game.p2.move("pk", "bfB");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: true });
    await game.p2.passFocus();
    await game.p1.cast("retreat", { targets: "loner" });
    await resolveChain(game);
    expect(game.locationOf("loner")).toBe("base");
    expect(showdown(game)?.battlefieldId).toBe("bfB"); // still Showdown Open
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: null });
    expect(bf(game, "bfB")?.controller).toBe(P1);
  });
});

// ===========================================================================
// F. CONQUER vs HOLD after a lapse (469 / 470 / 471.2.c)
// ===========================================================================

describe("F · scoring after a lapse: control that was LOST and is re-established is a Conquer (even on the opponent's turn — rulings 007fba1784bd1662 / cba925b25c0bd764); control that never lapsed is not", () => {
  test("P2 (turn player) Shoves P1's lone holder home ⇒ bf1 lapses; P2 walks in ⇒ non-combat showdown; P1 Marches a unit back in ⇒ combat; P1 wins ⇒ P1 establishes control it had LOST = Conquer, +1 on P2's turn", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Filler Anchor" }, "anchor")
      .hand(P1, MARCH, "march")
      .unit(P2, "base", { might: 2, name: "Filler Scout" }, "scout")
      .hand(P2, SHOVE, "shove")
      .build();
    await game.p2.cast("shove", { targets: "anchor" });
    await resolveChain(game);
    expect(game.locationOf("anchor")).toBe("base");
    expect(bf(game)?.controller).toBeNull(); // rule 323.6 — lapsed (Neutral Open on P2's turn)
    await game.p2.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P2, isCombatShowdown: false });
    await game.p2.passFocus();
    await game.p1.cast("march", { targets: "anchor" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(bf(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toContain("bf1");
  });

  test("contrast — the holder never left: P2 attacks and loses ⇒ P1 merely keeps bf1, no point", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Filler Anchor" }, "anchor")
      .unit(P2, "base", { might: 2, name: "Filler Scout" }, "scout")
      .build();
    await game.p2.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(bf(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
  });

  test("Hold needs control at the Beginning Phase: a battlefield whose control lapsed (emptied on the opponent's turn) earns its old controller no Hold point next turn", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .hand(P2, SHOVE, "shove")
      .build();
    await game.p2.cast("shove", { targets: "holder" });
    await resolveChain(game);
    expect(bf(game)?.controller).toBeNull();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(bf(game)?.controller).toBeNull();
  });
});
