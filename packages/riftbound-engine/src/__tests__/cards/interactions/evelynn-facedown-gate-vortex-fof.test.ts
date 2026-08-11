/**
 * Interaction: Evelynn, Entrancing (unl-141-219) — unit · Chaos · 2 energy · 2 might
 *     [Hidden] [Backline]
 *     "When you play me from face down on your turn, you may move an enemy unit at a
 *      different location to my battlefield."
 *   × Mystic Vortex (ven-160-166) — battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play.
 *      (Hidden cards have [Reaction].)"
 *   × Fight or Flight (ogn-168-298) — spell · Chaos · 2 energy · [Hidden] [Action]
 *     "Move a unit from a battlefield to its base."
 *
 * Evelynn is hidden at P1's Mystic Vortex. Questions:
 *  (a) Three origins, one trigger — hand play on P1's turn / facedown flip during a showdown on
 *      P2's turn / facedown flip on P1's turn: which fire the pull, and is the P2's-turn flip legal?
 *      Rules 811.3, 811.5.a (the hand play is an ordinary play — the "from face down" half of the
 *      gate fails), 811.6 + 358.4 (a Hidden card HAS [Reaction] while facedown and when played from
 *      facedown, so the P2's-turn flip is legal inside a closed chain — but the "on your turn" half
 *      of the gate fails), 811.1.d.1 (she still enters at the Vortex).
 *  (b) What the P2's-turn flip is charged: 811.1.b sets the BASE cost to 0, but a later cost
 *      INCREASE still raises the total above zero (356.1.b.3 / 356.3) — the Vortex surcharge lands
 *      because a Hidden card played from facedown has [Reaction]. DESIGN (manual rune payment, a
 *      deliberate deviation from 357.1.a / 429.3): with an empty pool the flip is not OFFERED at
 *      all — a ready rune is never credited mid-payment.
 *  (c) 811.1.d restricts a hidden card's choices to its battlefield, but the pull demands a unit
 *      "at a DIFFERENT location". 811.1.d.2 / .2.a (the Tideturner precedent): the ability's own
 *      restriction wins and the choice is free — while Evelynn herself stays nailed to the Vortex
 *      by 811.1.d.1.
 *  (d) Evelynn is moved to base before the trigger resolves: "my battlefield" is a referent checked
 *      on EXECUTION of the instruction (359.3.f.1 / 359.3.f.2 / 359.3.f.2.a), so the destination is
 *      gone and the move instruction is ignored (359.3.e.6). Fight or Flight itself can never be the
 *      mover here — see the two gate tests below — so the referent facet uses Flash (ogs-011-024,
 *      [Reaction] "Move up to 2 friendly units to base"), the only Reaction-speed move-to-base in the
 *      pool, cast by Evelynn's own controller.
 *  (e) The pulled unit's arrival is an ordinary arrival: ITS controller applies Contested and becomes
 *      the Attacker (190.3.a, 464.2.c.1); the combat only begins once the chain empties in a Neutral
 *      Open State (323.13). Evelynn defends, with [Backline].
 *
 * Engine note: a [rainbow] cost pip is paid from `power.rainbow` in this engine.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EVELYNN = "unl-141-219";
const VORTEX = "ven-160-166";
const FOF = "ogn-168-298";
const FLASH = "ogs-011-024"; // [Reaction] Move up to 2 friendly units to base — the (d) mover

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** The ids offered by the current `pick` decision (target / destination prompts). */
function offered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

/**
 * P1 controls the Mystic Vortex ("mv") and keeps a Warden there so the control is durable;
 * P2 controls an ordinary battlefield "bf2" with a Marauder on it. Evelynn waits face down at
 * the Vortex. Both seats hold 1 [rainbow] Power.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .resources(P2, { energy: 4, power: { rainbow: 1 } })
    .battlefield("mv", { controller: P1, def: VORTEX, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "mv", { might: 1, name: "Warden" }, "warden")
    .unit(P2, "bf2", { might: 3, name: "Marauder" }, "foe")
    .facedown(P1, "mv", EVELYNN, "eve");
}

/** Same board, but it is P2's turn and P2 has a Raider in base to open a showdown at the Vortex. */
function p2TurnBoard() {
  return board().active(P2).unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

describe("Evelynn's face-down gate × Mystic Vortex × Fight or Flight", () => {
  // ---------------------------------------------------------------- (a) the origin gate

  test("(a) played from HAND on your turn: a legal play (811.3), but the 'from face down' half of the gate fails — no trigger, nothing is pulled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .battlefield("mv", { controller: P1, def: VORTEX, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "mv", { might: 1, name: "Warden" }, "warden")
      .unit(P2, "bf2", { might: 3, name: "Marauder" }, "foe")
      .hand(P1, EVELYNN, "eve")
      .build();

    expect(game.p1.can("play", "eve")).toBe(true); // 811.3: Hidden may always be played as a normal card
    await game.p1.play("eve", { to: "mv" });
    await game.settle();

    expect(game.zoneOf("eve")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } }); // 811.5.a: an ordinary 2-energy play
    expect(game.decision()?.kind).toBe("action"); // no "you may" was ever raised
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("foe")).toBe("bf2"); // the pull never happened
  });

  test("(a) flipped from face down during a showdown on P2's TURN: legal (811.6 + 358.4) and she enters at the Vortex (811.1.d.1) — but 'on your turn' fails, so no trigger", async () => {
    const game = await p2TurnBoard().build();
    await game.p2.move("raider", "mv"); // opens a showdown at the Vortex; P2 has Focus
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);

    // 811.6: a Hidden card has [Reaction] while face down, so P1 may answer inside the showdown.
    expect(game.p1.can("reveal", "eve")).toBe(true);
    await game.p1.reveal("eve");

    expect(game.zoneOf("eve")).toBe("battlefield-mv"); // 811.1.d.1 — a hidden permanent lands at its battlefield
    expect(game.decision()?.kind).toBe("action"); // no yes-no: the trigger never fired
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("foe")).toBe("bf2");
  });

  test("(a) flipped from face down on YOUR turn: both halves of the gate hold — the pull goes on the chain as an optional trigger", async () => {
    const game = await board().build();
    await game.p1.reveal("eve");

    expect(game.zoneOf("eve")).toBe("battlefield-mv");
    expect(game.decision()).toMatchObject({
      kind: "yes-no",
      seat: P1,
      timing: "FIN", // rules 383.3.a / 402: a leading "you may" is decided as the item is finalized
      source: { cardId: "eve", pendingChoiceType: "opt-in" },
    });
    await game.p1.yes();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "eve", controller: P1, triggered: true }),
    ]);
  });

  // ---------------------------------------------------------------- (b) what the flip costs

  test("(b) the P2's-turn flip at the Vortex costs exactly one [rainbow] and no energy — 811.1.b zeroes the BASE cost, 356.1.b.3/356.3 let the later increase raise it again", async () => {
    const game = await p2TurnBoard().build();
    await game.p2.move("raider", "mv");
    await game.p2.passFocus();
    await game.p1.reveal("eve");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 0 } });
  });

  test("(b) 'during showdowns HERE': the same flip on P1's own turn with no showdown open is free — energy and power both untouched", async () => {
    const game = await board().build();
    await game.p1.reveal("eve");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 1 } });
  });

  test("(b) DESIGN: with an empty pool the flip is not even OFFERED, though a ready rune could cover the surcharge — payment is manual (deviation from 357.1.a / 429.3)", async () => {
    // Rules 357.1.a / 429.3 would let P1 add Power during payment; this engine deliberately never
    // credits or auto-taps a ready rune, so the taxed flip simply is not on the menu.
    const game = await p2TurnBoard()
      .resources(P1, { energy: 4, power: { rainbow: 0 } })
      .rune(P1, "chaos", { alias: "seal" })
      .build();
    await game.p2.move("raider", "mv");
    await game.p2.passFocus();
    expect(game.p1.runes({ ready: true })).toContain("seal");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 0 } });
    expect(game.p1.can("reveal", "eve")).toBe(false);
    // The seal must be recycled into the pool FIRST; only then is the flip on the menu.
    expect(game.p1.legal().map((o) => o.key)).toContain("recycleRune:seal");
    await game.p1.recycleRune("seal");
    expect(game.p1.can("reveal", "eve")).toBe(true);
  });

  // ---------------------------------------------------------------- (c) whose restriction wins

  test("(c) 811.1.d.2 gives way to the ability's own 'at a different location' — enemies at OTHER locations are offered, the enemy standing at the Vortex is not", async () => {
    const game = await board()
      .unit(P2, "mv", { might: 2, name: "Intruder" }, "intruder") // same location as Evelynn
      .unit(P2, "base", { might: 2, name: "Homebody" }, "home") // base is a different location
      .build();
    await game.p1.reveal("eve");
    await game.p1.yes();

    // Tideturner precedent (811.1.d.2 / 811.1.d.2.a): the battlefield restriction can never be
    // satisfied by this ability, so the choice is made freely from all available options.
    expect(offered(game)).toEqual(["foe", "home"]);
    expect(offered(game)).not.toContain("intruder");
  });

  test("(c) Evelynn herself is still nailed to the Vortex (811.1.d.1) — the flip offers no destination at all", async () => {
    const game = await board().build();
    const opt = game.p1.option("revealHidden", "eve");
    expect(opt).toBeDefined();
    expect(opt?.fields.map((f) => f.name)).not.toContain("to");
    await game.p1.reveal("eve");
    expect(game.locationOf("eve")).toBe("mv");
  });

  // ---------------------------------------------------------------- (d) "my battlefield" at execution

  test("(d) Fight or Flight cannot answer the trigger FROM HAND — 358.4: the chain is already Closed, so a card played into it needs [Reaction] and FoF is [Action]", async () => {
    const game = await board().hand(P1, FOF, "fofP1").hand(P2, FOF, "fofP2").build();
    await game.p1.reveal("eve");
    await game.p1.yes();
    expect(game.chain()).toHaveLength(1);

    expect(game.p1.can("cast", "fofP1")).toBe(false);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "fofP2")).toBe(false);
    expect(game.p2.legal().map((o) => o.key)).toEqual(["concede:-", "passChainPriority:-"]);
  });

  test("(d) Fight or Flight CAN answer from face down (811.6), but 811.1.d.2 pins its target to its own battlefield — Evelynn at the Vortex is never offered", async () => {
    // Two units at bf2 so FoF's target is actually asked instead of auto-bound.
    const game = await board()
      .facedown(P2, "bf2", FOF, "fof")
      .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
      .build();
    await game.p1.reveal("eve");
    await game.p1.yes();
    await game.p1.pick("foe"); // Evelynn's own target: the Marauder
    await game.p1.passPriority();

    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    expect(game.chain().map((i) => i.cardId)).toEqual(["eve", "fof"]);

    // FoF sits on top and resolves first (LIFO), asking its controller for a target.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(offered(game)).toEqual(["foe", "sentry"]); // only bf2's occupants; not "eve", not "warden"
  });

  test("(d) moving Evelynn to base before the trigger executes kills the destination: 'my battlefield' returns null (359.3.f.2.a) and the move instruction is ignored (359.3.e.6)", async () => {
    const game = await board().hand(P1, FLASH, "flash").build();
    await game.p1.reveal("eve");
    await game.p1.yes();
    expect(game.chain()[0]).toMatchObject({ cardId: "eve", targets: ["foe"] });

    await game.p1.cast("flash", { targets: ["eve"] }); // [Reaction], legal into the closed chain
    await game.settle();

    expect(game.locationOf("eve")).toBe("base");
    expect(game.locationOf("foe")).toBe("bf2"); // the pull is ignored — nothing else of it executes
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([]);
    // Evelynn is still played and the Flash is still spent — nothing is refunded.
    expect(game.zoneOf("eve")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("(d) moving the trigger's TARGET instead is harmless — a base is still 'a different location', so the referent stays legal and the pull lands", async () => {
    const game = await board().facedown(P2, "bf2", FOF, "fof").build();
    await game.p1.reveal("eve");
    await game.p1.yes(); // sole enemy unit — the Marauder is auto-bound as the target
    await game.p1.passPriority();
    await game.p2.reveal("fof"); // sole unit at bf2 — the Marauder is auto-bound here too

    await game.p2.passPriority();
    await game.p1.passPriority(); // FoF is on top and resolves first
    expect(game.locationOf("foe")).toBe("base");
    expect(game.chain().map((i) => i.cardId)).toEqual(["eve"]);

    await game.p1.passPriority();
    await game.p2.passPriority(); // now the trigger executes
    // The target is re-checked and is still "an enemy unit at a different location" (a base is a
    // location), so unlike Evelynn's own displacement this changes nothing.
    expect(game.locationOf("foe")).toBe("mv");
  });

  // ---------------------------------------------------------------- (e) who attacks

  test("(e) the pulled unit's arrival makes ITS controller the Attacker (190.3.a / 464.2.c.1), and combat only begins once the chain empties (323.13)", async () => {
    const game = await board().build();
    await game.p1.reveal("eve");
    await game.p1.yes();
    // Still Closed: the trigger has not executed, so nothing is contested yet.
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: false, controller: P1 });

    await game.p1.passPriority();
    await game.p2.passPriority(); // chain empties → Neutral Open State → 323.13 begins combat

    expect(game.locationOf("foe")).toBe("mv");
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      attackingPlayer: P2,
      battlefieldId: "mv",
      defendingPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.state("foe").combatRole).toBe("attacker");
    expect(game.state("eve").combatRole).toBe("defender");
    expect(game.state("eve").keywords).toContain("Backline"); // assigned combat damage last
  });

  test("(e) Evelynn defends behind [Backline]: the 2-Might attacker must spend its damage on the Warden first, so Evelynn lives and P1 keeps the Vortex", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .battlefield("mv", { controller: P1, def: VORTEX, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "mv", { might: 1, name: "Warden" }, "warden")
      .unit(P2, "bf2", { might: 2, name: "Marauder" }, "foe")
      .facedown(P1, "mv", EVELYNN, "eve")
      .build();
    await game.p1.reveal("eve");
    await game.p1.yes();
    await game.settle(); // trigger resolves, combat begins and is fought out

    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash"); // 1 + 2 Might of defenders kills the 2-Might attacker
    expect(game.zoneOf("eve")).toBe("battlefield-mv");
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });
});
