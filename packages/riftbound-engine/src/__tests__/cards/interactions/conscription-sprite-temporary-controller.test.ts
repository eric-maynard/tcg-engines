/**
 * Interaction: Conscription (unl-140-219) · Spell · Chaos · 5+[chaos]x2
 *     "You may spend 5 XP as an additional cost to play this. Choose an enemy unit at a battlefield
 *      with 3 [Might] or less. … Take control of it, exhaust it, and recall it."
 *   × Sprite Call (ogn-094-298) · Spell · Mind · 3 · Hidden / Action
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]. (Kill it at the start of its
 *      controller's Beginning Phase, before scoring.)"
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · Reaction
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Question: P2 resolved Sprite Call on P2's turn (ready 3-Might Temporary Sprite) and put it at bf1.
 * On P1's turn P1 resolves Conscription (no XP; 3 Might qualifies) on it.
 *   (a) Baseline (P1 does nothing): when does the Sprite die?
 *   (b) After Conscription: where/what state is the Sprite, does it keep Temporary, and at the start
 *       of WHOSE Beginning Phase is it killed — P2's (creator) or P1's (controller)? Does P1 ever get
 *       to attack with it? Which trash?
 *   (c) P1 instead Retreats it: legal "friendly unit"? whose hand? does it survive? who channels?
 *   (d) Can P2 Retreat it while P1 controls it?
 *
 * Rules: 816.1.b / 816.1.c (Temporary triggers on the CURRENT controller's Beginning Phase, before
 * scoring), 477.1.a (take control = layer-1 controller change), 455 / 456 / 458.1 (recall is not a
 * move; state otherwise unchanged), 187.2 + 124.1 (Temporary is intrinsic to the token; board→board
 * keeps it), 183 (token owner = controller of the creating effect = P2), 186.1 (a token entering a
 * non-board zone ceases to exist), 323.5 / 056.2 (killed → owner's trash), 740.1.a / 740.1.b
 * (friendly = shares a controller; enemy otherwise — ownership irrelevant).
 *
 * Expected: (a) un-stolen it dies at the start of P2's next Beginning Phase, before P2 scores.
 * (b) P1 controls it, exhausted, in P1's base, owner still P2, still Temporary; nothing happens at
 * P2's next turn start; it is killed at the start of P1's NEXT Beginning Phase — P1 never reaches an
 * Action Phase with it (pure denial); as a token it ceases to exist (no card in either trash).
 * (c) Legal for P1; returns to its OWNER's (P2's) hand and ceases to exist there; P2 — not P1 —
 * channels 1 rune exhausted; P1 paid Retreat's 1 energy. (d) No: it is an enemy unit to P2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Seat } from "../../../harness";

const CONSCRIPTION = "unl-140-219";
const SPRITE_CALL = "ogn-094-298";
const RETREAT = "ogn-104-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P2's turn 2. P2 holds bf1 (empty) and has Sprite Call + 3 energy, plus a Retreat and a vanilla base
 * unit (so P2's Retreat is castable at all). P1 has Conscription + Retreat and a vanilla base unit;
 * P1's resources are added on P1's turn (pools empty at turn start). bf2 is an open battlefield.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2Other")
    .unit(P1, "base", { might: 2, name: "P1 Homebody" }, "p1Other")
    .hand(P2, SPRITE_CALL, "sc")
    .hand(P2, RETREAT, "p2Retreat")
    .hand(P1, CONSCRIPTION, "con")
    .hand(P1, RETREAT, "p1Retreat");
}

/** P2 resolves Sprite Call to bf1 on P2's turn; returns the game and the Sprite token id (still P2's turn). */
async function spriteAtBf1(): Promise<{ game: Game; tok: string }> {
  const game = await board().build();
  await game.p2.cast("sc");
  await game.settle();
  await game.p2.pick("battlefield-bf1");
  await game.settle();
  const tok = game.find({ name: "Sprite" });
  return { game, tok };
}

/** …then pass to P1's turn, fund P1 (5+[chaos][chaos] for Conscription, 1 for Retreat) and resolve Conscription on the Sprite. */
async function conscripted(): Promise<{ game: Game; tok: string }> {
  const { game, tok } = await spriteAtBf1();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 6, power: { chaos: 2 } });
  await game.p1.cast("con", { targets: tok });
  await game.settle();
  return { game, tok };
}

const tokenIn = (ids: string[]) => ids.filter((id) => id.startsWith("token-"));

describe("Conscription × Sprite Call × Retreat — a stolen Temporary token follows its CONTROLLER's clock but its OWNER's hand", () => {
  test("setup: Sprite Call gives P2 a READY 3-Might Sprite token with Temporary at bf1, owned and controlled by P2 (183)", async () => {
    const { game, tok } = await spriteAtBf1();
    expect(game.state(tok)).toMatchObject({ controller: P2, isReady: true, isToken: true, location: "bf1", might: 3, owner: P2 });
    expect(game.state(tok).keywords).toContain("Temporary");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.p2.energy()).toBe(0);
  });

  // ---- (a) baseline ------------------------------------------------------------------------------

  test("(a) baseline: un-stolen, the Sprite survives P1's whole turn (not its controller's Beginning Phase)", async () => {
    const { game, tok } = await spriteAtBf1();
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok)).toBe(true);
    expect(game.locationOf(tok)).toBe("bf1");
    expect(game.state(tok).controller).toBe(P2);
  });

  test("(a) baseline: it is killed at the start of P2's NEXT Beginning Phase, before scoring — gone by P2's main phase, ceased to exist (186.1), and P2 did not score bf1 off it (816.1.b)", async () => {
    const { game, tok } = await spriteAtBf1();
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2: Beginning Phase kills it before scoring
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.has(tok)).toBe(false);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(tokenIn(game.p2.trash())).toEqual([]);
    expect(game.p2.points()).toBe(0);
  });

  // ---- (b) Conscription ----------------------------------------------------------------------------

  test("(b) Conscription (unpaid mode) may choose the 3-Might enemy Sprite at bf1; costs 5 energy + 2 chaos", async () => {
    const { game, tok } = await spriteAtBf1();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 6, power: { chaos: 2 } });
    expect(targetsOffered(game, P1, "con")).toEqual([tok]); // p1Other is friendly, p2Other is in a base
    await game.p1.cast("con", { targets: tok });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["con"]);
  });

  test("(b) after Conscription: P1 controls it, owner still P2, EXHAUSTED, in P1's base (recalled, not moved), 3 Might, undamaged; spell → P1's trash (477.1.a, 455, 458.1)", async () => {
    const { game, tok } = await conscripted();
    expect(game.state(tok)).toMatchObject({ controller: P1, damage: 0, isExhausted: true, location: "base", might: 3, owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain(tok);
    expect(game.p2.units()).not.toContain(tok);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.zoneOf("con")).toBe("trash");
    expect(game.p1.trash()).toContain("con");
  });

  test("(b) it STILL has Temporary — intrinsic to the token; control change + recall are not zone changes (187.2, 124.1)", async () => {
    const { game, tok } = await conscripted();
    expect(game.state(tok).keywords).toContain("Temporary");
    expect(game.state(tok).isToken).toBe(true);
  });

  test("(b) P1 cannot attack with it this turn: it is exhausted, so no move with it is legal", async () => {
    const { game, tok } = await conscripted();
    expect(game.state(tok).isExhausted).toBe(true);
    const r = await game.p1.try((p) => p.move(tok, "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf(tok)).toBe("base");
  });

  test("(b) at the start of P2's next turn NOTHING happens to it — P2 no longer controls it (816.1.c): still in P1's base under P1's control", async () => {
    const { game, tok } = await conscripted();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has(tok)).toBe(true);
    expect(game.state(tok)).toMatchObject({ controller: P1, location: "base", owner: P2 });
    expect(game.state(tok).keywords).toContain("Temporary");
  });

  test("(b) it is killed at the start of P1's NEXT Beginning Phase — by P1's main phase it no longer exists, so P1 never gets an Action Phase with it (816.1.b/c, 186.1)", async () => {
    const { game, tok } = await conscripted();
    await game.advanceTurn(); // → P2
    expect(game.has(tok)).toBe(true);
    await game.advanceTurn(); // → P1: Temporary fires in P1's Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.has(tok)).toBe(false);
    expect(game.p1.units()).not.toContain(tok);
    expect(game.p1.units()).toEqual(["p1Other"]);
  });

  test("(b) as a killed TOKEN it ceases to exist — no token card is left in P1's trash nor in P2's (183 owner = P2, then 186.1)", async () => {
    const { game } = await conscripted();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(tokenIn(game.p1.trash())).toEqual([]);
    expect(tokenIn(game.p2.trash())).toEqual([]);
    expect(game.findAll({ name: "Sprite" })).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) P1 Retreats the conscripted Sprite ------------------------------------------------------

  test("(c) P1's Retreat offers the conscripted Sprite as a FRIENDLY unit (740.1.a: shares a controller; ownership irrelevant) alongside P1's own unit", async () => {
    const { game, tok } = await conscripted();
    expect(game.p1.can("cast", "p1Retreat")).toBe(true);
    expect(targetsOffered(game, P1, "p1Retreat").sort()).toEqual(["p1Other", tok].sort());
    expect(targetsOffered(game, P1, "p1Retreat")).not.toContain("p2Other");
  });

  test("(c) resolving it: the Sprite returns to its OWNER's (P2's) hand and, being a token, ceases to exist — neither hand gains a card; P1 paid 1 energy; Retreat → P1's trash (183, 186.1)", async () => {
    const { game, tok } = await conscripted();
    const p1Hand0 = game.p1.hand().length;
    const p2Hand0 = game.p2.hand().length;
    expect(game.p1.energy()).toBe(1);
    await game.p1.cast("p1Retreat", { targets: tok });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.has(tok)).toBe(false);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Retreat left P1's hand; the Sprite did not arrive here
    expect(tokenIn(game.p1.hand())).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand0); // arrived in P2's hand and vanished
    expect(tokenIn(game.p2.hand())).toEqual([]);
    expect(game.p1.units("base")).toEqual(["p1Other"]);
    expect(game.zoneOf("p1Retreat")).toBe("trash");
  });

  test("(c) 'its OWNER channels 1 rune exhausted' → P2 (owner) gains 1 exhausted rune from P2's rune deck; P1 (caster/controller) channels nothing", async () => {
    const { game, tok } = await conscripted();
    const p1Runes0 = game.p1.runes().length;
    const p1Exh0 = game.p1.runes({ ready: false }).length;
    const p2Runes0 = game.p2.runes().length;
    const p2Deck0 = game.p2.runeDeck().length;
    await game.p1.cast("p1Retreat", { targets: tok });
    await game.settle();
    expect(game.p2.runes()).toHaveLength(p2Runes0 + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.runeDeck()).toHaveLength(p2Deck0 - 1);
    expect(game.p1.runes()).toHaveLength(p1Runes0);
    expect(game.p1.runes({ ready: false })).toHaveLength(p1Exh0);
  });

  test("(c) contrast: P1 Retreats its OWN unit → it goes to P1's hand and P1 is the one who channels 1 exhausted rune", async () => {
    const { game } = await conscripted();
    const p1Runes0 = game.p1.runes().length;
    const p2Runes0 = game.p2.runes().length;
    await game.p1.cast("p1Retreat", { targets: "p1Other" });
    await game.settle();
    expect(game.zoneOf("p1Other")).toBe("hand");
    expect(game.p1.hand()).toContain("p1Other");
    expect(game.p1.runes()).toHaveLength(p1Runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.runes()).toHaveLength(p2Runes0);
  });

  // ---- (d) P2 cannot Retreat it while P1 controls it -----------------------------------------------

  test("(d) on P2's turn, P2's Retreat ('a friendly unit') is offered P2's own Homebody but NOT the P1-controlled Sprite; naming it is rejected (740.1.b)", async () => {
    const { game, tok } = await conscripted();
    await game.advanceTurn(); // → P2's open main phase; the Sprite is still in P1's base
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has(tok)).toBe(true);
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("cast", "p2Retreat")).toBe(true);
    const offered = targetsOffered(game, P2, "p2Retreat");
    expect(offered).toContain("p2Other");
    expect(offered).not.toContain(tok);
    await expect(game.p2.cast("p2Retreat", { targets: tok })).rejects.toThrow();
    expect(game.state(tok)).toMatchObject({ controller: P1, location: "base" });
    expect(game.zoneOf("p2Retreat")).toBe("hand");
  });

  test("(d) nor in a closed state on P1's turn: with P1's Retreat on the chain, P2 (holding priority) is still not offered the Sprite for P2's Retreat", async () => {
    const { game, tok } = await conscripted();
    await game.p2.do("addResources", { energy: 1 });
    await game.p1.cast("p1Retreat", { targets: "p1Other" }); // opens a chain
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "p2Retreat")).toBe(true); // Reaction, p2Other is a legal friendly target
    expect(targetsOffered(game, P2, "p2Retreat")).toEqual(["p2Other"]);
    await expect(game.p2.cast("p2Retreat", { targets: tok })).rejects.toThrow();
    expect(game.state(tok).controller).toBe(P1);
  });
});
