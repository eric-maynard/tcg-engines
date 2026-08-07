/**
 * Core rules: Movement — the Standard Move (timing, cost, destinations, Ganking, capacity),
 * and how effect-driven Moves differ from it.
 *
 * Rules covered (riftbound-rules):
 *   144 / 144.1.a-c       Standard Move is a unit's inherent action: your Main Phase only, never in a Closed state,
 *                         never during a Showdown or Combat
 *   144.2 / 414.1.b / 414.4 / 420.3   exhausting the unit is the COST; an exhausted unit cannot pay it
 *   144.3 / 144.3.a-c     several units may Standard Move as ONE action: same destination, origins may differ,
 *                         costs paid simultaneously (all-or-nothing)
 *   144.4 / 144.4.a / 144.4.b / 144.4.c.1   destinations: base→battlefield, battlefield→base; battlefield→battlefield
 *                         only with Ganking
 *   144.4.a.1 / 449.2 / 447.2.a / 447.2.c / 410.1.b.3   (3+ players) a battlefield holding units of two OTHER players
 *                         is an invalid destination by any means; a forced move there becomes a Recall
 *   170.6                 any number of units may be at a battlefield (no capacity limit)
 *   410.1.a               discretionary actions are taken on your own turn
 *   446.1 / 446.3 / 446.3.c   moving is instantaneous, uses no chain, cannot be reacted to
 *   449 / 449.1           effect-driven moves take their legality from the effect, not from 144
 *   450 / 453 / 190.3.a.1 / 190.4.b   destination becomes Contested; a Cleanup follows the move; no control change
 *                         until the showdown/combat says so
 *   316.8.b.1 / 344 / 344.1 / 344.2 / 345   Non-Combat Showdown at an empty battlefield (mover has Focus) vs Combat
 *   323.6 / 190.4.c       vacating a battlefield loses control at the next cleanup
 *   323.8 / 323.9 / 323.12 / 323.13   staging Showdowns and Combats; showdown-only battlefields begin first; only
 *                         in a Neutral Open state
 *   810 / 810.1.b / 810.1.c / 810.1.c.1-3 / 810.3   Ganking adds a battlefield→battlefield option to the Standard
 *                         Move, costs nothing extra, removes nothing, and is a checkable characteristic
 *   456.1                 a Recall is not a Move
 *
 * Everything is built from inline filler units/spells; the one printed-card cross-check (Vi,
 * Destructive — a natively Ganking unit) sits in its own test.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, P3, scenario } from "../../harness";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** Spell: "Draw 1." — opens a chain (Closed state) without touching the board. */
const DRAW_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Ponder (inline spell: Draw 1)",
  timing: "action",
};

/** Spell: "Move a friendly unit to a battlefield." (controller picks the battlefield). */
const MOVE_TO_BATTLEFIELD_SPELL = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "March (inline spell: Move a friendly unit to a battlefield)",
  timing: "action",
};

/** Spell: "[Reaction] Move a friendly unit to a battlefield." */
const MOVE_TO_BATTLEFIELD_REACTION = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Flank (inline Reaction: Move a friendly unit to a battlefield)",
  timing: "reaction",
};

/** Spell: "Kill a unit." */
const KILL_SPELL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Cull (inline spell: Kill a unit)",
  timing: "action",
};

/** Unit with printed Ganking. */
const GANKER = (might: number) => ({ keywords: ["Ganking"], might, name: "Prowler (inline: [Ganking])" });

/** Unit: "Other friendly units have [Ganking]." — a passive that grants Ganking while it is on the board. */
const GANKING_AURA_UNIT = {
  abilities: [{ effect: { keyword: "Ganking", target: { controller: "friendly", excludeSelf: true, type: "unit" }, type: "grant-keyword" }, type: "static" }],
  might: 1,
  name: "Warcaller (inline: Other friendly units have [Ganking])",
};

/** Unit: "When I move, draw 1." */
const MOVE_DRAW_UNIT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  might,
  name: "Scout (inline: When I move, draw 1)",
});

const VI_DESTRUCTIVE = "ogn-036-298"; // printed: "[Ganking] (I can move from battlefield to battlefield.) …", 3 Might

function contextOf(game: Game): string | undefined {
  const d = game.decision();
  return d && d.kind === "action" ? d.context : undefined;
}

/** Unit-groups the engine offers for a Standard Move to `dest` (each entry sorted). */
function moveGroupsOffered(game: Game, dest: string): string[][] {
  const opt = game.p1.option(`standardMove:to:${dest}`);
  const field = opt?.fields.find((f) => f.arg === "units");
  return ((field?.options ?? []) as string[][]).map((g) => [...g].sort());
}

// ---------------------------------------------------------------------------
// Basics: cost, timing, instantaneity
// ---------------------------------------------------------------------------

describe("Standard Move basics: exhaust as cost, instantaneous, no chain, followed by a Cleanup (144.2, 446.3, 450, 453)", () => {
  test("base → empty battlefield: the unit arrives exhausted, nothing goes on the chain, P2 never gets a reaction window to the move; cleanup marks bf1 Contested and opens a Non-Combat Showdown with P1 holding Focus; no control yet (190.4.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2 }, "u")
      .unit(P2, "base", { might: 2 }, "p2idle")
      .build();
    expect(contextOf(game)).toBe("main");
    expect(game.state("u").isReady).toBe(true);

    const r = await game.p1.move("u", "bf1");
    // Exactly one engine action, and it was the move itself — no chain item, no priority pass in between.
    expect(r.executed.map((e) => e.moveId)).toEqual(["standardMove"]);
    expect(game.locationOf("u")).toBe("bf1"); // no in-transit state: it is simply there now
    expect(game.state("u").isExhausted).toBe(true); // cost paid
    expect(game.chain()).toHaveLength(0);
    expect(game.gameState.interaction?.chain?.active ?? false).toBe(false);
    // Cleanup after the move: Contested applied, Non-Combat Showdown opened, mover has Focus.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    const sd = game.gameState.interaction?.showdownStack ?? [];
    expect(sd).toHaveLength(1);
    expect(sd[0]).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    const d = game.decision() as ActionDecision;
    expect(d.kind).toBe("action");
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P1);
    // P2's first say is a Focus/priority window INSIDE the showdown — never a reaction to the move.
    expect(game.p2.legal().some((o) => o.moveId === "playSpell")).toBe(false);
    // Control does not change until the showdown ends.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("an exhausted unit cannot Standard Move: the cost is unpayable, nothing happens (414.1.b, 414.4)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
      .build();
    expect(game.p1.can("move")).toBe(false); // no Standard Move offered at all
    const r = await game.p1.try((p) => p.move("tired", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("tired")).toBe("base");
    expect(game.state("tired").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(contextOf(game)).toBe("main");
  });
});

// ---------------------------------------------------------------------------
// Timing: whose turn, which phase, which state
// ---------------------------------------------------------------------------

describe("Standard Move timing: only the turn player, only in their Main Phase, only in a Neutral Open state (144.1, 410.1.a, 308-310)", () => {
  test("P2 cannot Standard Move on P1's turn even with a ready unit (410.1.a)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2 }, "mine")
      .unit(P2, "base", { might: 2 }, "theirs")
      .build();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.can("move")).toBe(false);
    const r = await game.p2.try((p) => p.move("theirs", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("theirs")).toBe("base");
    expect(game.state("theirs").isReady).toBe(true);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    // …while the turn player can.
    expect(game.p1.can("move")).toBe(true);
  });

  test("not outside the Main Phase: during P1's Beginning Phase no Standard Move is offered (144.1.a)", async () => {
    const game = await scenario()
      .phase("beginning")
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2 }, "u")
      .build();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.can("move")).toBe(false);
    const r = await game.p1.try((p) => p.move("u", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("u")).toBe("base");
    expect(game.state("u").isReady).toBe(true);
  });

  test("Neutral Closed: with a spell on the chain (P1 holding priority) the move is refused; once the chain resolves it is legal again (144.1.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2 }, "v")
      .hand(P1, DRAW_SPELL, "ponder")
      .build();
    await game.p1.cast("ponder");
    expect(contextOf(game)).toBe("chain");
    expect(game.actingSeat()).toBe(P1); // P1 has priority — still may not move
    expect(game.p1.can("move")).toBe(false);
    const r = await game.p1.try((p) => p.move("v", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("v")).toBe("base");
    await game.settle();
    expect(contextOf(game)).toBe("main");
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("v", "bf1");
    expect(game.locationOf("v")).toBe("bf1");
  });

  test("Showdown Open: while P1's own Non-Combat Showdown at bf1 is in progress (P1 has Focus) a second ready unit may not Standard Move anywhere (144.1.c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 2 }, "u")
      .unit(P1, "base", { might: 2 }, "v")
      .build();
    await game.p1.move("u", "bf1");
    expect(contextOf(game)).toBe("showdown");
    expect(game.decision()?.seat).toBe(P1);
    expect(game.p1.can("move")).toBe(false);
    for (const dest of ["bf1", "bf2"]) {
      const r = await game.p1.try((p) => p.move("v", dest));
      expect(r.ok).toBe(false);
    }
    expect(game.locationOf("v")).toBe("base");
    expect(game.state("v").isReady).toBe(true);
  });

  test("Combat: while combat is in progress at bf1, a ready base unit may not Standard Move in as 'reinforcement', nor may anyone retreat (144.1.c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "attacker")
      .unit(P1, "base", { might: 2 }, "reinforcement")
      .unit(P2, "bf1", { might: 4 }, "defender")
      .build();
    await game.p1.move("attacker", "bf1");
    expect(game.gameState.interaction?.showdownStack?.[0]?.isCombatShowdown).toBe(true);
    expect(game.state("attacker").combatRole).toBe("attacker");
    expect(game.p1.can("move")).toBe(false);
    const r = await game.p1.try((p) => p.move("reinforcement", "bf1"));
    expect(r.ok).toBe(false);
    const r2 = await game.p1.try((p) => p.move("attacker", "base"));
    expect(r2.ok).toBe(false);
    expect(game.locationOf("reinforcement")).toBe("base");
    expect(game.state("reinforcement").isReady).toBe(true);
    expect(game.p1.legal().map((o) => o.moveId).sort()).toEqual(["concede", "passShowdownFocus"]);
  });
});

// ---------------------------------------------------------------------------
// Multi-unit moves
// ---------------------------------------------------------------------------

describe("Multi-unit Standard Move: one action, one destination, origins may differ, costs paid simultaneously (144.3)", () => {
  test("two base units → bf2 as ONE action: both exhausted, both arrive, exactly one Contested application and one showdown", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 2 }, "a2")
      .build();
    expect(moveGroupsOffered(game, "bf2")).toContainEqual(["a", "a2"]);
    const r = await game.p1.move(["a", "a2"], "bf2");
    expect(r.executed.map((e) => e.moveId)).toEqual(["standardMove"]); // a single game action
    expect(game.locationOf("a")).toBe("bf2");
    expect(game.locationOf("a2")).toBe("bf2");
    expect(game.state("a").isExhausted).toBe(true);
    expect(game.state("a2").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(1); // not two
    expect(contextOf(game)).toBe("showdown");
  });

  test("different origins, shared destination: a unit at bf1 and a unit at bf2 both Standard Move → base in one action (144.3.b, 144.4.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "d")
      .unit(P1, "bf2", { might: 2 }, "e")
      .build();
    expect(moveGroupsOffered(game, "base")).toContainEqual(["d", "e"]);
    const r = await game.p1.move(["d", "e"], "base");
    expect(r.executed).toHaveLength(1);
    expect(game.locationOf("d")).toBe("base");
    expect(game.locationOf("e")).toBe("base");
    expect(game.state("d").isExhausted).toBe(true);
    expect(game.state("e").isExhausted).toBe(true);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0); // base is never contested
  });

  test("one declaration = one destination: every Standard Move option names exactly one destination, so a→bf1 + a2→bf2 are necessarily two sequential actions (144.3.a)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 }) // controlled → moving there opens nothing, keeps the state Neutral Open
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 1 }, "keep1")
      .unit(P1, "bf2", { might: 1 }, "keep2")
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 2 }, "a2")
      .build();
    const moveOptions = game.p1.legal().filter((o) => o.moveId === "standardMove");
    expect(moveOptions.map((o) => o.key).sort()).toEqual(["standardMove:to:base", "standardMove:to:bf1", "standardMove:to:bf2"]);
    for (const o of moveOptions) {
      // The only free parameter is WHICH units — the destination is fixed per option.
      expect(o.fields.map((f) => f.arg)).toEqual(["units"]);
      expect(o.variants.every((v) => v.params.destination === o.key.slice("standardMove:to:".length))).toBe(true);
    }
    const first = await game.p1.move("a", "bf1");
    const second = await game.p1.move("a2", "bf2");
    expect(first.executed).toHaveLength(1);
    expect(second.executed).toHaveLength(1);
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("a2")).toBe("bf2");
  });

  test("atomic: {ready A, exhausted B} → bf1 is rejected as a whole — A stays home AND ready; then {A} alone is legal (144.3.c, 414.4)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 2 }, "b", { exhausted: true })
      .build();
    expect(moveGroupsOffered(game, "bf1")).toEqual([["a"]]); // no group containing the exhausted unit
    const r = await game.p1.try((p) => p.move(["a", "b"], "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("a")).toBe("base");
    expect(game.state("a").isReady).toBe(true); // no partial cost payment
    expect(game.locationOf("b")).toBe("base");
    expect(game.state("b").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    await game.p1.move("a", "bf1");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.state("a").isExhausted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

describe("Destinations: base→battlefield, battlefield→base; battlefield→battlefield only with Ganking (144.4, 810)", () => {
  test("retreat battlefield → base is a legal Standard Move; vacating the battlefield loses control at cleanup; nothing opens, nothing scores (144.4.b, 323.6, 190.4.c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "u")
      .build();
    expect(moveGroupsOffered(game, "base")).toEqual([["u"]]);
    await game.p1.move("u", "base");
    expect(game.locationOf("u")).toBe("base");
    expect(game.state("u").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(contextOf(game)).toBe("main");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("a plain unit at bf1 is offered bf1→base but never bf1→bf2; attempting it is rejected and the unit stays ready (144.4, 144.4.c.1)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 2 }, "u")
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .build();
    expect(game.state("u").keywords).not.toContain("Ganking");
    expect(moveGroupsOffered(game, "base")).toContainEqual(["u"]);
    expect(moveGroupsOffered(game, "bf2").some((g) => g.includes("u"))).toBe(false);
    expect(game.p1.can("gank", "u")).toBe(false);
    const r = await game.p1.try((p) => p.move("u", "bf2"));
    expect(r.ok).toBe(false);
    const r2 = await game.p1.try((p) => p.gank("u", "bf2"));
    expect(r2.ok).toBe(false);
    expect(game.locationOf("u")).toBe("bf1");
    expect(game.state("u").isReady).toBe(true);
    expect(game.gameState.battlefields.bf2?.contested).toBe(false);
  });

  test("a Ganking unit may Standard Move bf1→bf2: exhausted (the only cost — no energy/power), bf2 Contested by P1, Non-Combat Showdown opens with P1's Focus; bf1 stays P1's thanks to the unit left behind (810.1.b, 810.1.c.2)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", GANKER(2), "g")
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .build();
    expect(game.state("g").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "g")).toBe(true);
    const resourcesBefore = game.p1.resources();
    const r = await game.p1.gank("g", "bf2");
    expect(r.executed).toHaveLength(1); // still a single move action, not an extra "activation" (810.1.c.3)
    expect(game.locationOf("g")).toBe("bf2");
    expect(game.state("g").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual(resourcesBefore); // no activation cost
    expect(game.chain()).toHaveLength(0);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.interaction?.showdownStack?.[0]).toMatchObject({ battlefieldId: "bf2", focusPlayer: P1, isCombatShowdown: false });
    expect(contextOf(game)).toBe("showdown");
    expect(game.decision()?.seat).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Ganking adds options, never removes them: the Ganking unit is still offered bf1 → base and can take it (810.1.c.1)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", GANKER(2), "g")
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .build();
    expect(moveGroupsOffered(game, "base")).toContainEqual(["g"]);
    await game.p1.move("g", "base");
    expect(game.locationOf("g")).toBe("base");
    expect(game.state("g").isExhausted).toBe(true);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
  });

  test("cross-check (printed card): Vi, Destructive — natively [Ganking] — moves bf1→bf2 exactly like the inline Prowler", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", VI_DESTRUCTIVE, "vi")
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .build();
    expect(game.state("vi").keywords).toContain("Ganking");
    await game.p1.gank("vi", "bf2");
    expect(game.locationOf("vi")).toBe("bf2");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
  });

  test("144.3.b / 144.4.c.1 — a Ganking unit at bf1 and a plain unit in base may go to enemy-held bf2 as ONE Standard Move (different origins, same destination) and both become attackers; engine models Ganking as a separate single-unit move and never offers the mixed-origin group", async () => {
    // Expected: standardMove → bf2 offers the group [a, g]; both exhausted simultaneously; bf2 Contested by P1;
    // combat staged and begun with P1 attacking (323.9/323.13).
    // Actual: only [a] is offered for bf2; the bundle matches no legal variant and throws.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", GANKER(2), "g")
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P2, "bf2", { might: 1 }, "e")
      .build();
    expect(moveGroupsOffered(game, "bf2")).toContainEqual(["a", "g"]);
    await game.p1.move(["g", "a"], "bf2");
    expect(game.locationOf("g")).toBe("bf2");
    expect(game.locationOf("a")).toBe("bf2");
    expect(game.state("g").isExhausted).toBe(true);
    expect(game.state("a").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("g").combatRole).toBe("attacker");
    expect(game.state("a").combatRole).toBe("attacker");
    expect(game.state("e").combatRole).toBe("defender");
  });

  test("variant: {Ganking g, plain a} both AT bf1 → bf2 is rejected as a whole because a lacks Ganking; neither moves, both stay ready", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", GANKER(2), "g")
      .unit(P1, "bf1", { might: 2 }, "a")
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .build();
    expect(moveGroupsOffered(game, "bf2").some((grp) => grp.includes("a"))).toBe(false);
    const r = await game.p1.try((p) => p.move(["g", "a"], "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("g")).toBe("bf1");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.state("g").isReady).toBe(true);
    expect(game.state("a").isReady).toBe(true);
    expect(game.gameState.battlefields.bf2?.contested).toBe(false);
  });

  test("Ganking granted by a passive is checked at declaration time: with the Warcaller on the board the plain unit may go bf1→bf2; once the Warcaller is killed the same move is refused (810.1.c, 810.3)", async () => {
    const build = () =>
      scenario()
        .turn(2)
        .active(P2) // advance into P1's turn so the passive layer has been evaluated before we look at the menu
        .battlefield("bf1", { controller: P1 })
        .battlefield("bf2", { controller: null })
        .unit(P1, "bf1", { might: 2 }, "u")
        .unit(P1, "bf1", { might: 2 }, "anchor")
        .unit(P1, "base", GANKING_AURA_UNIT, "warcaller")
        .hand(P1, KILL_SPELL, "cull");

    // (a) passive active → legal.
    const live = await build().build();
    await live.advanceTurn();
    expect(live.turnPlayer()).toBe(P1);
    expect(live.state("u").keywords).toContain("Ganking");
    expect(live.p1.can("gank", "u")).toBe(true);
    await live.p1.gank("u", "bf2");
    expect(live.locationOf("u")).toBe("bf2");
    expect(live.state("u").isExhausted).toBe(true);

    // (b) granting permanent removed BEFORE declaring → the characteristic is gone → refused (nothing cached).
    const gone = await build().build();
    await gone.advanceTurn();
    expect(gone.p1.can("gank", "u")).toBe(true);
    await gone.p1.cast("cull", { targets: "warcaller" });
    await gone.settle();
    expect(gone.zoneOf("warcaller")).toBe("trash");
    expect(gone.state("u").keywords).not.toContain("Ganking");
    expect(gone.p1.can("gank", "u")).toBe(false);
    const r = await gone.p1.try((p) => p.gank("u", "bf2"));
    expect(r.ok).toBe(false);
    expect(gone.locationOf("u")).toBe("bf1");
    expect(gone.state("u").isReady).toBe(true);
    // The retreat option is of course still there.
    expect(moveGroupsOffered(gone, "base")).toContainEqual(["u"]);
  });
});

// ---------------------------------------------------------------------------
// Capacity & multiplayer destination limits
// ---------------------------------------------------------------------------

describe("No per-battlefield unit cap; the only destination limit is the 3+-player 'two other players already there' rule (170.6, 144.4.a.1, 449.2, 447.2.c)", () => {
  test("1v1: P1 already controls bf1 with 5 units and moves 3 more in one action — legal; 8 units present; NO Contested (already controls it), NO showdown, NO score (170.6, 190.3.a.1, 450)", async () => {
    let b = scenario().battlefield("bf1", { controller: P1 });
    for (let i = 0; i < 5; i++) {
      b = b.unit(P1, "bf1", { might: 1 }, `there${i}`);
    }
    for (let i = 0; i < 3; i++) {
      b = b.unit(P1, "base", { might: 1 }, `m${i}`);
    }
    const game = await b.build();
    expect(moveGroupsOffered(game, "bf1")).toContainEqual(["m0", "m1", "m2"]);
    const r = await game.p1.move(["m0", "m1", "m2"], "bf1");
    expect(r.executed).toHaveLength(1);
    expect(game.p1.units("bf1")).toHaveLength(8);
    for (const m of ["m0", "m1", "m2"]) {
      expect(game.state(m).isExhausted).toBe(true);
    }
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(contextOf(game)).toBe("main");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("144.4.a.1 / 410.1.b.3 (3-player FFA) — a battlefield already holding units of two OTHER players is not a Standard Move destination; engine offers and executes the move, putting a third player's unit there", async () => {
    // Expected: `standardMove:to:bf1` is not offered to P1 (or is rejected); u stays ready in base; bf1 untouched.
    // Actual: the move is legal in the engine and u arrives at bf1 (Contested by P1).
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 2 }, "p2unit")
      .unit(P3, "bf1", { might: 2 }, "p3unit")
      .unit(P1, "base", { might: 2 }, "u")
      .build();
    expect(game.p1.can("standardMove:to:bf2")).toBe(true); // the other battlefield is fine
    expect(game.p1.can("standardMove:to:bf1")).toBe(false);
    const r = await game.p1.try((p) => p.move("u", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("u")).toBe("base");
    expect(game.state("u").isReady).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
  });

  test("449.2 / 447.2.c / 456.1 (3-player FFA) — an EFFECT forcing P1's unit from bf2 onto bf1 (units of two other players there) must Recall it to base instead, which is not a Move (no 'When I move' trigger); engine moves it onto bf1 and fires the move trigger", async () => {
    // Expected: after "Move a friendly unit to a battlefield" picks bf1, the Scout ends in P1's base (Recall), bf1 is
    // untouched/uncontested, and its "When I move, draw 1" does NOT fire → hand = before − 1 (the spell only).
    // Actual: Scout is placed at bf1, bf1 becomes Contested by P1, and the move trigger draws a card.
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 2 }, "p2unit")
      .unit(P3, "bf1", { might: 2 }, "p3unit")
      .unit(P1, "bf2", MOVE_DRAW_UNIT(2), "scout")
      .unit(P1, "bf2", { might: 2 }, "anchor")
      .hand(P1, MOVE_TO_BATTLEFIELD_SPELL, "march")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("march", { targets: "scout" });
    const s = await game.settle();
    if (s.reason === "unanswered") {
      // destination prompt (bf1 is the only battlefield other than the scout's own)
      expect(s.decision?.seat).toBe(P1);
      await game.p1.pick("battlefield-bf1");
      await game.settle();
    }
    expect(game.p1.units("bf1")).toEqual([]); // never a third player's unit at bf1
    expect(game.locationOf("scout")).toBe("base"); // recalled instead
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // no move-trigger draw: a Recall is not a Move
  });
});

// ---------------------------------------------------------------------------
// Effect-driven moves vs the Standard Move
// ---------------------------------------------------------------------------

describe("Effect-driven Moves ignore Standard Move restrictions but are still Moves (449, 449.1, 446.1, 450)", () => {
  test("on P2's turn, mid-chain, P1's Reaction moves its EXHAUSTED, non-Ganking Scout bf1→bf2: legal; arrives still exhausted (no cost); 'When I move' fires exactly once; bf2 becomes Contested by P1 but no showdown opens while the chain is live; afterwards the staged showdown is the TURN player's (P2's) to begin (323.12)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", MOVE_DRAW_UNIT(2), "scout", { exhausted: true })
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .hand(P1, MOVE_TO_BATTLEFIELD_REACTION, "flank")
      .hand(P2, DRAW_SPELL, "ponder")
      .build();
    expect(game.state("scout").keywords).not.toContain("Ganking");
    expect(game.state("scout").isExhausted).toBe(true);

    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "flank")).toBe(true);
    expect(game.p1.can("move")).toBe(false); // a Standard Move is out of the question here (opponent's turn, Closed state)
    const handAfterCast = game.p1.hand().length - 1;
    await game.p1.cast("flank", { targets: "scout" }); // bf2 is the only other battlefield → no destination prompt
    expect(game.chain().map((i) => i.cardId)).toEqual(["ponder", "flank"]);

    // Resolve Flank only (top of chain): both pass once.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("flank")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf2"); // bf→bf without Ganking, while exhausted, on the opponent's turn
    expect(game.state("scout").isExhausted).toBe(true); // ready state untouched — nothing was paid
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    // It IS a Move: the Scout's move trigger is now on the chain (above Ponder); no showdown may begin mid-chain.
    expect(game.chain().map((i) => i.cardId)).toEqual(["ponder", "scout"]);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(contextOf(game)).toBe("chain");

    await game.settle(); // trigger (draw 1) then Ponder resolve
    expect(game.p1.hand()).toHaveLength(handAfterCast + 1); // exactly one move-trigger draw
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // anchor stayed
    // Neutral Open again on P2's turn: beginning the staged showdown is surfaced to the TURN player (P2).
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.can("startShowdown")).toBe(true);
    expect(game.p2.option("startShowdown")?.key).toBe("startShowdown:bf2");
    expect(game.p1.points()).toBe(0); // arriving is not conquering
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
  });

  test("323.12 — choosing which staged showdown begins is the TURN player's step only; after P1's off-turn effect move contests bf2, engine also offers `startShowdown:bf2` to the non-turn player P1", async () => {
    // Expected: only P2 (turn player) may begin the staged showdown at bf2; P1 has no such option.
    // Actual: `startShowdown:bf2` is enumerated for both seats.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 2 }, "scout", { exhausted: true })
      .unit(P1, "bf1", { might: 2 }, "anchor")
      .hand(P1, MOVE_TO_BATTLEFIELD_REACTION, "flank")
      .hand(P2, DRAW_SPELL, "ponder")
      .build();
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    await game.p1.cast("flank", { targets: "scout" });
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.p2.can("startShowdown")).toBe(true);
    expect(game.p1.can("startShowdown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// What the destination stages: Non-Combat Showdown vs Combat; ordering
// ---------------------------------------------------------------------------

describe("Empty destination → Non-Combat Showdown; enemy-held destination → Combat; staged showdowns begin before staged combats (316.8.b.1, 344, 323.8-323.13)", () => {
  test("A → empty bf1 opens a Non-Combat Showdown (P1 Focus); both pass → P1 controls bf1; state back to Neutral Open; then B → enemy bf2 stages and begins COMBAT with P1 attacking / P2 defending — one at a time", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 2 }, "b")
      .unit(P2, "bf2", { might: 1 }, "e")
      .build();

    await game.p1.move("a", "bf1");
    let sd = game.gameState.interaction?.showdownStack ?? [];
    expect(sd).toHaveLength(1);
    expect(sd[0]).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("a").combatRole).toBeFalsy();
    // While it is open, the second move is not available (one thing at a time).
    expect((await game.p1.try((p) => p.move("b", "bf2"))).ok).toBe(false);
    await game.p1.passFocus();
    expect(game.decision()?.seat).toBe(P2);
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(contextOf(game)).toBe("main");
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);

    await game.p1.move("b", "bf2");
    sd = game.gameState.interaction?.showdownStack ?? [];
    expect(sd).toHaveLength(1);
    expect(sd[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("b").combatRole).toBe("attacker");
    expect(game.state("e").combatRole).toBe("defender");
    expect(game.state("a").combatRole).toBeFalsy(); // the unit at bf1 is not part of this combat
    expect(contextOf(game)).toBe("showdown");
    expect(game.decision()?.seat).toBe(P1);
  });

  test("323.12 → 323.13 — when one resolution leaves a Non-Combat Showdown staged at bf1 AND a Combat staged at bf2, the showdown-only battlefield must begin first and bf2's combat waits for the next Neutral Open state; engine offers `startShowdown` for both battlefields at once (turn player could open the combat first)", async () => {
    // Setup: P1 casts March (a → ?) and, holding priority, responds with the Reaction Flank (b → ?). LIFO: Flank
    // resolves first (b → bf2, enemy-held → combat staged), then March (a → bf1, empty → showdown staged).
    // Expected after the chain: the Non-Combat Showdown at bf1 is what begins (or is the only one selectable);
    // Combat at bf2 is not startable yet. Actual: both `startShowdown:bf1` and `startShowdown:bf2` are offered.
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 2 }, "b")
      .unit(P2, "bf2", { might: 1 }, "e")
      .hand(P1, MOVE_TO_BATTLEFIELD_SPELL, "march")
      .hand(P1, MOVE_TO_BATTLEFIELD_REACTION, "flank")
      .build();
    await game.p1.cast("march", { targets: "a" });
    expect(game.actingSeat()).toBe(P1); // caster keeps priority first
    await game.p1.cast("flank", { targets: "b" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["march", "flank"]);
    let s = await game.settle();
    while (s.reason === "unanswered" && s.decision?.kind === "pick") {
      expect(s.decision.seat).toBe(P1); // the mover's controller picks each destination
      await game.p1.pick(/\bfor b\b/.test(s.decision.prompt) ? "battlefield-bf2" : "battlefield-bf1");
      s = await game.settle();
    }
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("b")).toBe("bf2");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    // Ordering: bf1's Non-Combat Showdown first; bf2's Combat may not be opened yet.
    expect(game.p1.can("startShowdown:bf2")).toBe(false);
    const open = game.gameState.interaction?.showdownStack ?? [];
    if (open.length === 0) {
      // (engine models the 323.12 choice as an explicit step — take it)
      await game.p1.choose("startShowdown:bf1");
    }
    expect(game.gameState.interaction?.showdownStack?.[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    // Now — and only now — the combat at bf2 begins.
    if ((game.gameState.interaction?.showdownStack ?? []).length === 0) {
      await game.p1.choose("startShowdown:bf2");
    }
    expect(game.gameState.interaction?.showdownStack?.[0]).toMatchObject({ battlefieldId: "bf2", isCombatShowdown: true });
    expect(game.state("b").combatRole).toBe("attacker");
    expect(game.state("e").combatRole).toBe("defender");
  });
});
