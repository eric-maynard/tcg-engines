/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow] · Action · [Hidden]
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are there.
 *      Otherwise, conquer.) Lose control of that unit and recall it at end of turn. (Send it to base. This
 *      isn't a move.)"
 *   × Vilemaw's Lair (ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *   (units: P2's Vanguard Sergeant ogn-219-298 — vanilla 4 — and Shipyard Skulker ogn-175-298 — vanilla 3.)
 *
 * Rules: 477.1.a (take control = layer-1 control change, no zone change), 190.3.a ("moves or OTHERWISE
 * becomes present" under a non-controller → Contested → Combat because other enemies are there), 466.5.d /
 * 469.1 (attacker wins → establish control = Conquer, +1), 358.3.a (a prevented game action does not make
 * the card / choice illegal — it is skipped on resolution), 054.1 / 055 / 359.3.e.6 ("can't" beats "can";
 * the impossible move instruction is ignored — the Lair binds the unit under its NEW controller too),
 * 317.1 (Ending Step: "at end of turn" effects), 455 / 456.1 / 456.3 / 458.1 (a Recall relocates to its
 * controller's base, is NOT a Move, fires no move triggers, cannot be prevented by movement restrictions,
 * keeps damage/statuses), 323.7 (Cleanup: permanents in a base other than their controller's are
 * recalled), 190.4.c / 323.6 (no units there in an Open state → control lapses at the next Cleanup).
 *
 * Board (P1's turn): the Lair is a LIVE Vilemaw's Lair controlled by P2 with an EXHAUSTED Vanguard Sergeant
 * (4) and a Shipyard Skulker (3). P1 holds Hostile Takeover + Flash and exactly 7 energy + [rainbow]×2.
 * Variant (d): the same board on a vanilla (inert) battlefield.
 *
 * Question / expected:
 *   (a) HT on the Sergeant: P1 controls it (owner P2), READIED; the Skulker is another enemy there → the
 *       Lair is Contested and a Combat starts with P1 attacking; 4 vs 3 → Skulker dies (P2's trash), the
 *       Sergeant takes 3, survives, is healed; P1 conquers the Lair, +1. Sergeant stays there, still READY.
 *   (b) Flash choosing the (now friendly) Sergeant at the Lair is LEGAL (358.3.a) and is paid/trashed, but on
 *       resolution the Lair forbids the move → ignored; the Sergeant stays at the Lair.
 *   (c) End of turn: control reverts to P2 and the Sergeant is RECALLED — the Lair cannot stop a recall
 *       (456.3) — to P2's base (455), READY, 0 damage; no move trigger fires (456.1). The Lair is left with
 *       no P1 unit → UNCONTROLLED entering P2's turn; P1 keeps its conquer point but cannot Hold it later.
 *   (d) Vanilla battlefield: Flash DOES move the Sergeant to P1's base (its current controller's base)
 *       mid-turn; at end of turn control reverts and the recall / 323.7 puts it in P2's base, ready.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const LAIR = "ogn-295-298";
const FLASH = "ogs-011-024";
const SERGEANT = "ogn-219-298";
const SKULKER = "ogn-175-298";

/** Inline stand-in for the Sergeant that also says "When I move, draw 1." — a 456.1 move-trigger probe. */
const PROBE_SERGEANT = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Probe Sergeant",
};

type Opts = { lair?: boolean; probe?: boolean };

/** P1's turn. P2 holds "lair" (live Vilemaw's Lair unless `lair:false`) with an exhausted Sergeant (4) + Skulker (3). */
function board(opts: Opts = {}) {
  const live = opts.lair ?? true;
  return scenario()
    .resources(P1, { energy: 5 + 2, power: { rainbow: 2 } }) // Hostile Takeover 5+[R][R], Flash 2
    .battlefield("lair", live ? { controller: P2, def: LAIR, inert: false } : { controller: P2 })
    .unit(P2, "lair", opts.probe ? PROBE_SERGEANT : SERGEANT, "sarge", { exhausted: true })
    .unit(P2, "lair", SKULKER, "skulker")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P1, FLASH, "flash");
}

/** Cast Hostile Takeover on the Sergeant and let exactly the spell resolve (both pass priority once). */
async function takeoverResolved(opts: Opts = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("ht", { targets: "sarge" });
  expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
  return game;
}

/** …and play the combat out with nobody acting in the showdown. */
async function conquered(opts: Opts = {}): Promise<Game> {
  const game = await takeoverResolved(opts);
  const r = await game.settle();
  expect(r.reason).toBe("open");
  return game;
}

/** …then P1 Flashes the stolen Sergeant and everything settles again. */
async function flashed(opts: Opts = {}): Promise<Game> {
  const game = await conquered(opts);
  await game.p1.cast("flash", { targets: ["sarge"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.zoneOf("flash")).toBe("trash");
  return game;
}

describe("Hostile Takeover at Vilemaw's Lair × Flash — the Lair blocks the move but never the end-of-turn recall", () => {
  // ── premise ──────────────────────────────────────────────────────────────────────────────────

  test("premise: both P2 units at the live Lair carry 'can't move to base'; HT offers exactly the two enemy units at a battlefield", async () => {
    const game = await board().build();
    expect(game.state("sarge")).toMatchObject({ controller: P2, isExhausted: true, might: 4, owner: P2, zone: "battlefield-lair" });
    expect(game.state("sarge").keywords).toContain("NoMoveToBase");
    expect(game.state("skulker").keywords).toContain("NoMoveToBase");
    const field = game.p1.option("cast", "ht")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat().sort()).toEqual(["sarge", "skulker"]);
    expect(game.gameState.battlefields.lair).toMatchObject({ contested: false, controller: P2 });
  });

  // ── (a) immediately after Hostile Takeover ──────────────────────────────────────────────────

  test("(a) on resolution P1 controls the Sergeant (owner P2), it is READIED, still at the Lair; the Skulker is another enemy there → the Lair is Contested by P1 and a Combat has begun: Sergeant attacker, Skulker defender, P1 holds Focus (477.1.a, 190.3.a)", async () => {
    const game = await takeoverResolved();
    expect(game.state("sarge")).toMatchObject({ combatRole: "attacker", controller: P1, isReady: true, location: "lair", owner: P2 });
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", controller: P2 });
    expect(game.gameState.battlefields.lair).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(a) combat 4 vs 3: the Skulker dies to P2's trash; the Sergeant survives, is healed (0 damage), stays at the Lair STILL READY (combat does not exhaust); P1 conquers the Lair and scores 1", async () => {
    const game = await conquered();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.trash()).toContain("skulker");
    expect(game.state("sarge")).toMatchObject({ combatRole: null, controller: P1, damage: 0, isReady: true, location: "lair", owner: P2 });
    expect(game.gameState.battlefields.lair).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["lair"]);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Flash on the stolen Sergeant at the Lair ────────────────────────────────────────────

  test("(b) Flash: the now-FRIENDLY Sergeant at the Lair is a legal choice (358.3.a) — the cast is accepted, 2 energy paid, Flash on the chain targeting it", async () => {
    const game = await conquered();
    expect(game.state("sarge").keywords).toContain("NoMoveToBase"); // the Lair binds it under its new controller too
    const field = game.p1.option("cast", "flash")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("sarge");
    await game.p1.cast("flash", { targets: ["sarge"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P1, targets: ["sarge"] })]);
  });

  test("(b) on resolution 'Units can't move from here to base' makes the move impossible → ignored (054.1, 359.3.e.6): the Sergeant stays READY at the Lair under P1, P1 keeps the Lair, Flash → trash, no refund", async () => {
    const game = await flashed();
    expect(game.state("sarge")).toMatchObject({ controller: P1, isReady: true, location: "lair" });
    expect(game.p1.base()).not.toContain("sarge");
    expect(game.gameState.battlefields.lair).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) end of turn: recall past the Lair, to P2's base ─────────────────────────────────────

  test("(c) end of P1's turn: control reverts to P2 and the Sergeant is RECALLED despite the Lair (456.3) — to P2's base (455), not P1's; READY and undamaged (458.1); the Lair's grant is gone with it", async () => {
    const game = await flashed();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sarge")).toMatchObject({ controller: P2, damage: 0, isReady: true, location: "base", owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("sarge");
    expect(game.p1.base()).not.toContain("sarge");
    expect(game.state("sarge").keywords).not.toContain("NoMoveToBase"); // "from here" no longer applies in base
    expect(game.cardsAt("lair")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) the same holds WITHOUT the Flash attempt (the recall never depended on it): stuck-at-the-Lair Sergeant still goes home to P2 at end of turn", async () => {
    const game = await conquered();
    await game.advanceTurn();
    expect(game.state("sarge")).toMatchObject({ controller: P2, isReady: true, location: "base" });
    expect(game.p2.base()).toContain("sarge");
  });

  test("(c) the Lair is left with no P1 unit → UNCONTROLLED entering P2's turn (190.4.c / 323.6); P1 keeps the conquer point; nobody Holds it — not P2 now, not P1 at its next Beginning Phase", async () => {
    const game = await flashed();
    await game.advanceTurn(); // → P2
    expect(game.gameState.battlefields.lair?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    await game.advanceTurn(); // → P1's next turn: Beginning Phase passed with nothing to Hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.lair?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("(c) the EOT relocation is not a Move (456.1): with a 'When I move, draw 1' Sergeant stand-in nothing is drawn all turn — not for the steal, the combat, the ignored Flash, nor the recall (P2's hand grows only by its turn draw)", async () => {
    const game = await flashed({ probe: true });
    expect(game.state("sarge")).toMatchObject({ controller: P1, location: "lair" }); // same story as the real Sergeant
    expect(game.p1.hand()).toEqual([]); // ht + flash played, nothing drawn
    const p2Hand = game.p2.hand().length;
    await game.advanceTurn();
    expect(game.state("sarge")).toMatchObject({ controller: P2, location: "base" });
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // exactly P2's Draw-Phase card
    expect(game.chain()).toEqual([]);
  });

  // ── (d) contrast: vanilla battlefield ───────────────────────────────────────────────────────

  test("(d) on a vanilla battlefield the same line conquers identically, and Flash DOES move the stolen Sergeant — to P1's base (its CURRENT controller's), ready; the emptied battlefield lapses to uncontrolled", async () => {
    const game = await conquered({ lair: false });
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.state("sarge").keywords).not.toContain("NoMoveToBase");
    await game.p1.cast("flash", { targets: ["sarge"] });
    await game.settle();
    expect(game.state("sarge")).toMatchObject({ controller: P1, isReady: true, location: "base", owner: P2 });
    expect(game.p1.base()).toContain("sarge");
    expect(game.p2.base()).not.toContain("sarge");
    expect(game.gameState.battlefields.lair?.controller ?? null).toBeNull();
  });

  test("(d) …at end of turn P1 loses control of a unit sitting in P1's base → HT's recall / Cleanup 323.7 relocate it to P2's base: P2-controlled, ready, undamaged at the start of P2's turn", async () => {
    const game = await flashed({ lair: false });
    expect(game.p1.base()).toContain("sarge");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sarge")).toMatchObject({ controller: P2, damage: 0, isReady: true, location: "base", owner: P2 });
    expect(game.p2.base()).toContain("sarge");
    expect(game.p1.base()).not.toContain("sarge");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(d) move-trigger contrast on the vanilla battlefield: the successful Flash IS a move → the probe Sergeant draws P1 (its controller) exactly 1; the EOT relocation to P2's base draws nobody anything", async () => {
    const game = await conquered({ lair: false, probe: true });
    expect(game.p1.hand()).toEqual(["flash"]);
    await game.p1.cast("flash", { targets: ["sarge"] });
    await game.settle();
    expect(game.locationOf("sarge")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1); // −flash, +1 drawn off the move trigger
    const p2Hand = game.p2.hand().length;
    await game.advanceTurn();
    expect(game.p2.base()).toContain("sarge");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // turn draw only
  });
});
