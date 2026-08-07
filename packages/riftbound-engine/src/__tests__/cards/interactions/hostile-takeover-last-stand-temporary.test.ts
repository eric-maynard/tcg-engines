/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow] · Action
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   × Last Stand (ogn-069-298) · Spell · Calm · 3 + [calm] · Action
 *     "Double a friendly unit's Might this turn. Give it [Temporary]. (Kill it at the start of its
 *      controller's Beginning Phase, before scoring.)"
 *   × Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]x3 · Action  — contrast (c)
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   (+ Retreat ogn-104-298 · Reaction · "Return a friendly unit to its owner's hand. Its owner channels
 *      1 rune exhausted." for (d))
 *
 * Question: on P1's turn P1 resolves Hostile Takeover on P2's exhausted 4-Might X alone at battlefield A
 * (P1 takes control, readies it, conquers A), then Last Stand on X (8 Might, Temporary), and X takes 3
 * damage. P1's turn ends.
 *   (a) End of turn: who controls X, where is it, what Might/damage, does it still have Temporary?
 *   (b) Whose Beginning Phase kills it — P2's very next one or P1's next one? Whose trash?
 *   (c) Same play with Possession (permanent control, X in P1's base) — when does X die?
 *   (d) Can P2 save the card by Retreating X (e.g. in response to the Temporary trigger)? Does the
 *       returned card still carry Temporary?
 *
 * Rules: 317.1 (Ending Step: HT's "lose control … recall it" happens), 477.1.a (control is a layer-1
 * effect that simply ends), 455 / 456 / 458.1 (recall = to its controller's base, not a move, damage and
 * statuses untouched by the recall itself), 317.2.b / 317.2.c (Expiration: heal all units, then all
 * "this turn" effects expire → doubling ends), 801.3.a.3 (a keyword granted with no duration lasts while
 * the object stays on the board), 124 / 124.1 (only a change to/from a NON-board zone makes a new object
 * and strips granted keywords), 816.1 / 816.1.b / 816.1.c (Temporary is a TRIGGERED ability keyed to the
 * permanent's CURRENT controller's Beginning Phase, before scoring), 323.5 (killed → owner's trash),
 * 359.3.e.12 (an effect referencing an object that left the board does nothing), 740.1.a (friendly =
 * same controller — Retreat legality follows control).
 *
 * Expected: (a) control reverts to P2 and X is recalled to P2's base; healed (0), doubling gone (4 Might),
 * STILL Temporary. (b) Killed at the start of P2's very next Beginning Phase, before P2's scoring, into
 * P2's trash — who granted Temporary is irrelevant. (c) With Possession P1 stays controller: nothing on
 * P2's turn; X dies at the start of P1's next Beginning Phase (P2's trash). (d) Yes: Temporary uses the
 * chain, so P2 may Retreat X in response; it returns to P2's hand as a new object (no Temporary, no
 * damage, no +Might) and the pending kill does nothing; replayed later it has no Temporary.
 *
 * Modelling note: the "3 combat damage" is dealt by a plain 3-damage spell in P1's action phase so that
 * it is still marked at end of turn (a combat's own cleanup would already heal it, 466.1.a.1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const LAST_STAND = "ogn-069-298";
const POSSESSION = "ogn-203-298";
const RETREAT = "ogn-104-298";

/** Inline 1-energy action spell: deal 3 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** X: P2's exhausted 4-Might, 2-cost vanilla unit alone at battlefield A (P2's). */
const X_DEF = { energyCost: 2, might: 4, name: "Unit X" };

/** P1's turn 2. P1 holds the steal spell, Last Stand, a 3-damage Bolt and a Retreat; P2 holds a Retreat and 2 runes. */
function board(steal: "takeover" | "possession") {
  const s = scenario()
    .resources(P2, { energy: 0 })
    .battlefield("bfA", { controller: P2 })
    .unit(P2, "bfA", X_DEF, "X", { exhausted: true })
    .hand(P1, LAST_STAND, "ls")
    .hand(P1, BOLT, "bolt")
    .hand(P1, RETREAT, "p1Retreat")
    .hand(P2, RETREAT, "p2Retreat")
    .runes(P2, "mind", 2);
  return steal === "takeover"
    ? s.resources(P1, { energy: 5 + 3 + 1 + 1, power: { calm: 1, rainbow: 2 } }).hand(P1, HOSTILE_TAKEOVER, "steal")
    : s.resources(P1, { energy: 8 + 3 + 1 + 1, power: { calm: 1, chaos: 3 } }).hand(P1, POSSESSION, "steal");
}

/** Steal X, Last Stand it, deal it 3 — all resolved, still P1's turn 2 (open state). */
async function stolenDoubledDamaged(steal: "takeover" | "possession"): Promise<Game> {
  const game = await board(steal).build();
  await game.p1.cast("steal", { targets: "X" });
  await game.settle();
  await game.p1.cast("ls", { targets: "X" });
  await game.settle();
  await game.p1.cast("bolt", { targets: "X" });
  await game.settle();
  return game;
}

describe("Hostile Takeover × Last Stand — temporary control ends, Temporary stays; the unit dies on its NEW controller's turn", () => {
  // ---- premise ---------------------------------------------------------------------------------------

  test("premise: after Hostile Takeover + Last Stand + 3 damage, X is P1-controlled (owner P2) at A, ready→8 Might, 3 damage, has Temporary; P1 conquered A", async () => {
    const game = await stolenDoubledDamaged("takeover");
    const s = game.state("X");
    expect(s.controller).toBe(P1);
    expect(s.owner).toBe(P2);
    expect(s.zone).toBe("battlefield-bfA");
    expect(s.might).toBe(8);
    expect(s.damage).toBe(3);
    expect(s.keywords).toContain("Temporary");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, rainbow: 0 } }); // 1 left for Retreat
  });

  test("premise: 'Give it [Temporary]' has no stated duration — the grant is NOT a 'this turn' effect (801.3.a.3); only the doubling is", async () => {
    const game = await stolenDoubledDamaged("takeover");
    const temp = game.state("X").grantedKeywords.find((k) => k.keyword === "Temporary");
    expect(temp).toBeDefined();
    expect(temp?.duration).not.toBe("turn");
  });

  // ---- (a) end of P1's turn → start of P2's Beginning Phase ------------------------------------------

  // Expected: the first observable moment after P1's Ending/Expiration steps is the start of P2's
  // Beginning Phase with X's Temporary trigger ON THE CHAIN (816.1: a triggered ability). There X sits
  // in P2's base: controller P2 (HT's control ended, 477.1.a), recalled (455), healed (317.2.b), 4 Might
  // (doubling expired, 317.2.c) and STILL Temporary (recall/control change are not zone changes, 124.1).
  // Actual: the engine performs the Temporary kill directly inside the Beginning-Phase hook with no
  // chain item, so endTurn() runs straight into P2's main phase with X already in the trash.
  test("(a) P1 ends turn → P2's Beginning Phase opens with the Temporary trigger on the chain and X in P2's base: controller P2, 4 Might, 0 damage, still Temporary (317.1, 455, 317.2.b/c, 124.1, 816.1)", async () => {
    const game = await stolenDoubledDamaged("takeover");
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "X", triggered: true })]);
    const s = game.state("X");
    expect(s.zone).toBe("base");
    expect(s.controller).toBe(P2);
    expect(s.owner).toBe(P2);
    expect(s.might).toBe(4);
    expect(s.damage).toBe(0);
    expect(s.keywords).toContain("Temporary");
    expect(game.p2.units("base")).toContain("X");
    expect(game.cardsAt("bfA")).toEqual([]);
  });

  // ---- (b) whose Beginning Phase kills it --------------------------------------------------------------

  test("(b) Temporary reads the CURRENT controller (816.1.b/c): X is killed at the start of P2's very next turn — by P2's main phase it is in P2's (owner's) trash, not P1's (323.5)", async () => {
    const game = await stolenDoubledDamaged("takeover");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.trash()).toContain("X");
    expect(game.p1.trash()).not.toContain("X");
    expect(game.state("X").owner).toBe(P2);
    expect(game.p2.units()).not.toContain("X");
    expect(game.p1.units()).not.toContain("X");
  });

  test("(b) it did not wait for P1's next Beginning Phase (the granter is irrelevant) and contributed nothing to P2's scoring: P2 0 points, A empty", async () => {
    const game = await stolenDoubledDamaged("takeover");
    await game.advanceTurn(); // → P2: already dead here
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.cardsAt("bfA")).toEqual([]);
    expect(game.p1.points()).toBe(1); // only the turn-2 conquer
    // Net effect of Hostile Takeover + Last Stand: the unit is permanently gone before P2 could use it.
    expect(game.p2.legal().some((o) => o.card === "X")).toBe(false);
  });

  // ---- (c) contrast: Possession (permanent control) -----------------------------------------------------

  test("(c) Possession instead: X is recalled to P1's base under P1's control; Last Stand → 8 Might + Temporary; 3 damage marked", async () => {
    const game = await stolenDoubledDamaged("possession");
    const s = game.state("X");
    expect(s.controller).toBe(P1);
    expect(s.owner).toBe(P2);
    expect(s.zone).toBe("base");
    expect(game.p1.units("base")).toContain("X");
    expect(s.might).toBe(8);
    expect(s.damage).toBe(3);
    expect(s.keywords).toContain("Temporary");
    expect(game.p1.points()).toBe(0); // Possession recalls — no conquer
  });

  test("(c) Possession: nothing happens on P2's turn — X survives it in P1's base: still P1's, healed, back to 4 Might, still Temporary (317.2.b/c, 124.1, 816.1.c)", async () => {
    const game = await stolenDoubledDamaged("possession");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const s = game.state("X");
    expect(s.zone).toBe("base");
    expect(s.controller).toBe(P1);
    expect(s.damage).toBe(0);
    expect(s.might).toBe(4);
    expect(s.keywords).toContain("Temporary");
  });

  test("(c) Possession: X is killed at the start of P1's NEXT Beginning Phase, before P1 scores, and goes to its OWNER P2's trash (816.1.b, 323.5)", async () => {
    const game = await stolenDoubledDamaged("possession");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("X")).toBe("base");
    await game.advanceTurn(); // → P1 turn 4: Temporary fires for P1-controlled X
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.trash()).toContain("X");
    expect(game.p1.trash()).not.toContain("X");
    expect(game.p1.points()).toBe(0);
  });

  // ---- (d) saving the card with Retreat -----------------------------------------------------------------

  // Expected: Temporary is a triggered ability that uses the chain (816.1), so at the start of P2's
  // Beginning Phase P2 — now X's controller, so X is "friendly" (740.1.a) — may respond with Retreat:
  // X returns to P2's hand as a new object (124.1); the pending kill then references nothing on the
  // board and does nothing (359.3.e.12); replayed, X has no Temporary.
  // Actual: no chain item / priority window exists for the Temporary kill — X is already in the trash.
  test("(d) P2 Retreats X in response to the Temporary trigger on P2's turn → X to P2's hand, the kill fizzles; replayed later it has no Temporary (816.1, 124.1, 359.3.e.12)", async () => {
    const game = await stolenDoubledDamaged("takeover");
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "X", triggered: true })]);
    expect(game.zoneOf("X")).toBe("base");
    await game.p2.tapRune();
    expect(game.p2.can("cast", "p2Retreat")).toBe(true);
    await game.p2.cast("p2Retreat", { targets: "X" });
    await game.settle(); // Retreat resolves, then the Temporary item resolves against nothing
    expect(game.zoneOf("X")).toBe("hand");
    expect(game.p2.hand()).toContain("X");
    expect(game.state("X").keywords).not.toContain("Temporary");
    expect(game.phase()).toBe("main");
    // Replay it: a fresh object with no Temporary.
    await game.p2.tapRunes(2);
    await game.p2.play("X");
    await game.settle();
    expect(game.zoneOf("X")).toBe("base");
    expect(game.state("X").keywords).not.toContain("Temporary");
  });

  test("(d) P2 has no earlier window: during P1's turn X is P1-controlled, so it is not 'friendly' to P2 and P2's Retreat cannot choose it (740.1.a)", async () => {
    const game = await stolenDoubledDamaged("takeover");
    // Give P2 a Reaction window on P1's turn: P1 casts its own Retreat… but first check P2's menu when P2 gets priority.
    await game.p1.cast("p1Retreat", { targets: "X" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.tapRune();
    const field = game.p2.option("cast", "p2Retreat")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).not.toContain("X");
    await expect(game.p2.cast("p2Retreat", { targets: "X" })).rejects.toThrow();
  });

  test("(d, 124.1 facet) a Retreat that DOES reach X (here P1's, while P1 controls it) sends it to its OWNER P2's hand as a new object — no Temporary, no damage, no doubling", async () => {
    const game = await stolenDoubledDamaged("takeover");
    expect(game.p1.can("cast", "p1Retreat")).toBe(true);
    await game.p1.cast("p1Retreat", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("hand");
    expect(game.p2.hand()).toContain("X");
    expect(game.p1.hand()).not.toContain("X");
    const s = game.state("X");
    expect(s.keywords).not.toContain("Temporary");
    expect(s.grantedKeywords).toEqual([]);
    expect(s.damage).toBe(0);
    expect(s.might).toBe(4);
  });

  test("(d, 124.1 facet) replayed by P2 on its turn, that X has no Temporary and survives P2's following Beginning Phase; Hostile Takeover's end-of-turn clause found nothing to recall (359.3.e.12)", async () => {
    const game = await stolenDoubledDamaged("takeover");
    await game.p1.cast("p1Retreat", { targets: "X" });
    await game.settle();
    await game.advanceTurn(); // → P2 turn 3 (HT's delayed clause: X is not on the board — nothing happens)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("X")).toBe("hand");
    await game.p2.tapRunes(2);
    await game.p2.play("X");
    await game.settle();
    expect(game.zoneOf("X")).toBe("base");
    expect(game.state("X").controller).toBe(P2);
    expect(game.state("X").keywords).not.toContain("Temporary");
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2 turn 5: no Temporary → nothing to kill
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("X")).toBe("base");
    expect(game.p2.units("base")).toContain("X");
  });
});
