/**
 * Interaction: Baron Nashor (unl-147-219) · Unit · Chaos · 10 + [chaos][chaos][chaos] · 12 Might
 *     "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If
 *      you do, I enter there. (It has "Units can move here from anywhere.") I can't be chosen by enemy
 *      spells and abilities. Other friendly units have +2 [Might]."                    — in P1's hand
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos] · [Action]
 *     "Move a friendly unit and ready it."                                             — in P2's hand
 *   × Stalwart Poro (ogn-052-298) · Unit · Calm · 2 · 2 Might · "[Shield] (+1 [Might] while I'm a
 *     defender.)"                                                                      — P2's, at A
 *   (+ a vanilla non-Ganking 2-Might "Scout" of P2's at B, a P2 facedown Hidden Blade ogn-213-298 at A,
 *    and for (d) Vengeance ogn-229-298 "Kill a unit." / Thermo Beam ogn-022-298 "Kill all gear." in
 *    P2's hand as probes that nothing treats the Pit as a unit / permanent / gear.)
 *
 * Question. P1's turn with two ordinary battlefields: A (P2 controls it with a ready Stalwart Poro) and
 * B (P2's, with the Scout). P1 plays Baron Nashor.
 *   (a) When the Baron Pit token appears, who owns it, who controls it, are its abilities live before
 *       anyone controls it? Does Baron 'move' there, and does a showdown start?
 *   (b) In that showdown P2 plays Ride the Wind moving the Poro from A straight to the Pit — legal? What
 *       does that do to the showdown, and what happens to control of A right then?
 *   (c) Resolve the combat: controller / contested / staged for Pit, A and B.
 *   (d) On P2's next turn: may the non-Ganking Scout at B Standard Move to the Pit? To A? Can any effect
 *       kill or move the Pit itself?
 *
 * Rules: 439.4 / 439.4.b (a created object is owned by its creator; a created BATTLEFIELD is uncontrolled
 * as it is created — 439.4.a is for permanents and 171 says battlefields are not permanents), 170.5/.6/.8
 * (a Location at once, passive live regardless of control, 187.9), 446 (entering the board is not a
 * Move), 190.3.a.1 (P1's unit at a battlefield P1 doesn't control → Contested by P1), 323.8/323.12/345
 * (Showdown staged, no Combat → Non-Combat Showdown begins, P1 Focus), 447 + 144.4 (Standard-Move limits
 * bind Standard Moves only; the Pit's passive lifts them anyway), 323.9/323.14/460.1 (opposing units at
 * a Contested battlefield mid-showdown → Combat staged → the showdown becomes a Combat Showdown; 323.2.a
 * P1 attacker / P2 defender), 323.6/323.7 (Open state, no showdown AT A → P2 loses A immediately, its
 * facedown there is trashed), 466.5/466.5.d (P1 establishes control of the Pit = Conquer, +1),
 * 144.4.a–c (B → Pit legal via the passive; B → A illegal without Ganking), 170.3/170.4/171 (a
 * battlefield can't be killed or moved and is never a unit/gear/permanent for effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const RIDE_THE_WIND = "ogn-173-298";
const STALWART_PORO = "ogn-052-298";
const HIDDEN_BLADE = "ogn-213-298"; // P2's facedown at A (323.7 probe)
const VENGEANCE = "ogn-229-298"; // order · 4 + [order][order] · "Kill a unit."            — (d) probe
const THERMO_BEAM = "ogn-022-298"; // fury · 5 + [fury][fury] · [Action] "Kill all gear." — (d) probe

/**
 * P1's turn (turn 2, main). Battlefields A and B, both P2's: A holds P2's ready Stalwart Poro and a P2
 * facedown Hidden Blade, B holds P2's vanilla 2-Might Scout (no Ganking). P1 has exactly Baron's cost
 * (10 + 3 chaos) and Baron in hand; P2 has exactly Ride the Wind's cost (2 + 1 chaos) and Ride the Wind.
 */
function board(opts: { probes?: boolean } = {}) {
  let b = scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfA", STALWART_PORO, "poro")
    .facedown(P2, "bfA", HIDDEN_BLADE, "blade")
    .unit(P2, "bfB", { might: 2, name: "Scout" }, "scout")
    .hand(P1, BARON_NASHOR, "baron")
    .hand(P2, RIDE_THE_WIND, "ride");
  if (opts.probes) {
    // (d) only: sit in P2's hand unplayable (no order/fury power) until P2's turn 3 tops the pool up.
    b = b.hand(P2, VENGEANCE, "vengeance").hand(P2, THERMO_BEAM, "beam");
  }
  return b;
}

/** The battlefield id that is neither A nor B (the Baron Pit token), or undefined before it exists. */
function pitOf(game: Game): string | undefined {
  return game.battlefields().find((b) => b !== "bfA" && b !== "bfB");
}

function pit(game: Game): string {
  const id = pitOf(game);
  expect(id).toBeDefined();
  return id as string;
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** P1 plays Baron (the Pit appears, Baron enters there, the Non-Combat Showdown opens with P1 Focus). */
async function baronPlayed(opts: { probes?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.play("baron");
  // The play itself never asks anything: Baron's only legal `to` is base and the entry replacement sends him to the Pit.
  expect(game.chain()).toEqual([]);
  return game;
}

/** …P1 passes Focus; P2 (Focus) casts Ride the Wind on the Poro choosing the Pit; P2 pass, P1 pass → it resolves. */
async function poroRodeIn(opts: { probes?: boolean } = {}): Promise<Game> {
  const game = await baronPlayed(opts);
  await game.p1.passFocus();
  await game.p2.cast("ride", { answers: [`battlefield-${pit(game)}`], targets: "poro" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("ride")).toBe("trash");
  return game;
}

/** …both pass Focus → the combat at the Pit resolves; back to P1's open main phase. */
async function combatResolved(opts: { probes?: boolean } = {}): Promise<Game> {
  const game = await poroRodeIn(opts);
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** …P1 ends the turn; P2's open main phase (turn 3). */
async function p2NextTurn(opts: { probes?: boolean } = {}): Promise<Game> {
  const game = await combatResolved(opts);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  return game;
}

describe("(a) playing Baron Nashor: the Baron Pit token appears, Baron enters there, a Non-Combat Showdown begins", () => {
  test("before the play there are exactly two battlefields; Baron's play offers only 'base' as a location (the Pit is an entry replacement, not a play-location choice) and costs all 10 + 3 chaos", async () => {
    const game = await board().build();
    expect(game.battlefields().sort()).toEqual(["bfA", "bfB"]);
    const loc = game.p1.option("play", "baron")?.fields.find((f) => f.name === "location");
    expect(loc?.options).toEqual(["base"]);
    await game.p1.play("baron");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.battlefields()).toHaveLength(3);
  });

  test("the Pit is a third battlefield OWNED by its creator P1 (439.4) but UNCONTROLLED as created (439.4.b — not a permanent, 171); its 'Units can move here from anywhere' passive is already on it (170.8, 187.9)", async () => {
    const game = await baronPlayed();
    const id = pit(game);
    expect(game.cardsAt("battlefieldRow")).toContain(id);
    expect(game.state(id)).toMatchObject({ cardType: "battlefield", name: "Baron Pit", owner: P1 });
    expect(game.state(id).keywords).toContain("AcceptsMoveFromAnywhere");
    // Battlefield control lives on the battlefield state, and a created battlefield starts with none.
    expect(game.gameState.battlefields[id]?.controller).toBeNull();
  });

  test("Baron is AT the Pit (entered the board there — a zone change, not a Move: P1's units-moved count stays 0, 446), exhausted as a normally played unit, 12 Might", async () => {
    const game = await baronPlayed();
    const id = pit(game);
    expect(game.zoneOf("baron")).toBe(`battlefield-${id}`);
    expect(game.locationOf("baron")).toBe(id);
    expect(game.state("baron")).toMatchObject({ controller: P1, isExhausted: true, might: 12, owner: P1 });
    expect(game.p1.units(id)).toEqual(["baron"]);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
  });

  test("P1's unit stands at a battlefield P1 doesn't control → Contested by P1 (190.3.a.1); no opposing units → no Combat, so the Cleanup begins a NON-combat Showdown at the Pit with P1 (turn player) holding Focus (323.8, 323.12, 345)", async () => {
    const game = await baronPlayed();
    const id = pit(game);
    expect(game.gameState.battlefields[id]).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: id, focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("baron").combatRole ?? null).toBeNull();
  });

  test("A and B are untouched by any of this: A is P2's, uncontested, Poro (2 Might, ready) and the facedown still there; B is P2's with the Scout", async () => {
    const game = await baronPlayed();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("poro")).toMatchObject({ isReady: true, might: 2, zone: "battlefield-bfA" });
    expect(game.zoneOf("blade")).toBe("facedown-bfA");
    expect(game.zoneOf("scout")).toBe("battlefield-bfB");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});

describe("(b) P2 rides the Poro from A straight into the Pit mid-showdown", () => {
  test("with P1 holding Focus P2 cannot act; once P1 passes Focus, P2 (Focus + priority) IS offered Ride the Wind ([Action] in a showdown) with Poro and Scout as its friendly-unit candidates", async () => {
    const game = await baronPlayed();
    expect(game.p2.can("cast", "ride")).toBe(false);
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(true);
    const field = game.p2.option("cast", "ride")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["poro", "scout"]);
  });

  test("the move's destination is chosen as the spell is played: battlefield A → the PIT is a legal destination for this effect-move (447 — 144.4 limits Standard Moves only; the Pit's passive allows it anyway); A itself (where Poro already is) is not offered", async () => {
    const game = await baronPlayed();
    const id = pit(game);
    await game.p1.passFocus();
    await game.p2.cast("ride", { targets: "poro" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key) : [];
    expect(dests).toContain(`battlefield-${id}`);
    expect(dests).toContain("base");
    expect(dests).not.toContain("battlefield-bfA");
    await game.p2.pick(`battlefield-${id}`);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ride", controller: P2, targets: ["poro"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("poro")).toBe("battlefield-bfA"); // nothing moves until it resolves
  });

  test("P2 pass, P1 pass → Ride the Wind resolves: the Poro is at the Pit, READY, and P2's units-moved count ticked (it WAS a move, 447)", async () => {
    const game = await poroRodeIn();
    const id = pit(game);
    expect(game.zoneOf("poro")).toBe(`battlefield-${id}`);
    expect(game.state("poro").isReady).toBe(true);
    expect(game.p2.units(id)).toEqual(["poro"]);
    expect(game.p2.units("bfA")).toEqual([]);
  });

  test("opposing units now stand at the Contested Pit → Combat is staged and the ongoing Non-Combat Showdown BECOMES a Combat Showdown there (323.9, 323.14, 460.1): P1 (who applied Contested) attacks with Baron, P2 defends with the Poro — now 3 Might with [Shield] (323.2.a)", async () => {
    const game = await poroRodeIn();
    const id = pit(game);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: id, defendingPlayer: P2, isCombatShowdown: true });
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toHaveLength(1); // the same, single showdown
    expect(game.state("baron")).toMatchObject({ combatRole: "attacker", might: 12 });
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.gameState.battlefields[id]).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    // The spell's chain closed → Focus passed on to P1 (347.1.b); it is P1's showdown decision.
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("in that same Cleanup A is re-checked on its own: Open state (empty chain) and no Showdown/Combat AT A → P2, with no unit left there, loses control of A IMMEDIATELY — mid-showdown elsewhere — and A is Uncontrolled (323.6); P2's facedown at A is trashed (323.7); B untouched", async () => {
    const game = await poroRodeIn();
    expect(showdown(game)?.isCombatShowdown).toBe(true); // still mid-showdown at the Pit
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.trash()).toContain("blade");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("scout")).toBe("battlefield-bfB");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});

describe("(c) the combat at the Pit resolves", () => {
  test("both pass Focus → Baron 12 vs Poro 2 + Shield 1: the Poro takes 12 and dies (P2's trash); Baron takes 3, survives, and is healed to 0 by the Combat Cleanup", async () => {
    const game = await combatResolved();
    const id = pit(game);
    const dealt = (t: string) => (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === t).reduce((s, r) => s + r.amount, 0);
    expect(dealt("poro")).toBe(12);
    expect(dealt("baron")).toBe(3);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.trash()).toContain("poro");
    expect(game.state("baron")).toMatchObject({ combatRole: null, damage: 0, might: 12, zone: `battlefield-${id}` });
    expect(showdown(game)).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("466.5/466.5.d: P1 (units remaining) establishes control of the Baron Pit = a Conquer → P1 scores exactly 1 (a token battlefield scores like any other); the Pit is P1's, not contested, nothing staged", async () => {
    const game = await combatResolved();
    const id = pit(game);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields[id]).toMatchObject({ contested: false, controller: P1, showdownComplete: true });
    expect(game.gameState.battlefields[id]?.contestedBy).toBeUndefined();
  });

  test("final board elsewhere: A — controller none, uncontested, empty; B — still P2's with the Scout, uncontested; still three battlefields (the Pit stays)", async () => {
    const game = await combatResolved();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.cardsAt("battlefield-bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("scout")).toBe("battlefield-bfB");
    expect(game.battlefields()).toHaveLength(3);
  });
});

describe("(d) P2's next turn: Standard Moves into the Pit 'from anywhere'; the Pit itself is untouchable", () => {
  test("the Pit (P1's, holding Baron) is still on the board on P2's turn 3; A is still uncontrolled; B is P2's (P2 scored B's hold point at its Beginning Phase)", async () => {
    const game = await p2NextTurn();
    const id = pit(game);
    expect(game.battlefields()).toHaveLength(3);
    expect(game.gameState.battlefields[id]).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("baron")).toBe(`battlefield-${id}`);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("the non-Ganking Scout at battlefield B IS offered a Standard Move to the Pit (the Pit's passive adds 'from anywhere' to 144.4.a/b) — and to base — but NOT to battlefield A (battlefield → battlefield needs Ganking, 144.4.c)", async () => {
    const game = await p2NextTurn();
    const id = pit(game);
    const unitsFor = (dest: string) => {
      const f = game.p2.option(`standardMove:to:${dest}`)?.fields.find((x) => x.name === "unitIds");
      return [...new Set((f?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    };
    expect(unitsFor(id)).toContain("scout");
    expect(unitsFor("base")).toContain("scout");
    expect(unitsFor("bfA")).not.toContain("scout");
    expect((await game.p2.try((p) => p.move("scout", "bfA"))).ok).toBe(false);
    expect(game.zoneOf("scout")).toBe("battlefield-bfB");
  });

  test("executing B → Pit: the Scout arrives at the Pit (P1's, Baron there) → Contested by P2, a combat showdown opens with P2 attacking; B, now empty of P2 units, is lost by P2 in the same Cleanup (323.6)", async () => {
    const game = await p2NextTurn();
    const id = pit(game);
    await game.p2.move("scout", id);
    expect(game.zoneOf("scout")).toBe(`battlefield-${id}`);
    expect(game.gameState.unitsMovedThisTurn?.[P2] ?? 1).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields[id]).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: id, defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("baron").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: null });
  });

  test("nothing treats the Pit as a unit / permanent: with the pool topped up, Vengeance ('Kill a unit') offers P2's Scout but never the Pit — nor the enemy Baron, who can't be chosen by enemy spells (170.3, 171, 757); no target-taking option in P2's whole menu names the Pit except as a move DESTINATION", async () => {
    const game = await p2NextTurn({ probes: true });
    const id = pit(game);
    await game.p2.do("addResources", { energy: 9, power: { fury: 2, order: 2 } });
    expect(game.p2.can("cast", "vengeance")).toBe(true);
    const field = game.p2.option("cast", "vengeance")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toContain("scout");
    expect(offered).not.toContain(id);
    expect(offered).not.toContain("baron");
    for (const o of game.p2.legal()) {
      for (const f of o.fields) {
        if (f.name !== "location" && f.name !== "toBattlefield" && f.name !== "destination") {
          const vals = (f.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as unknown[]);
          expect(vals).not.toContain(id);
          expect(vals).not.toContain(`battlefield-${id}`);
        }
      }
    }
  });

  test("'Kill all gear' (Thermo Beam) resolves and the Pit — a battlefield TOKEN, not a gear token — is still on the board with Baron on it; it cannot be killed (170.3) and stays for the rest of the game", async () => {
    const game = await p2NextTurn({ probes: true });
    const id = pit(game);
    await game.p2.do("addResources", { energy: 9, power: { fury: 2, order: 2 } });
    await game.p2.cast("beam");
    await game.settle();
    expect(game.zoneOf("beam")).toBe("trash");
    expect(game.battlefields()).toContain(id);
    expect(game.has(id)).toBe(true);
    expect(game.cardsAt("battlefieldRow")).toContain(id);
    expect(game.gameState.battlefields[id]).toMatchObject({ controller: P1 });
    expect(game.zoneOf("baron")).toBe(`battlefield-${id}`);
    // …and it survives yet another full turn cycle.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.battlefields()).toContain(id);
    expect(game.zoneOf("baron")).toBe(`battlefield-${id}`);
    expect(game.violations()).toEqual([]);
  });
});
