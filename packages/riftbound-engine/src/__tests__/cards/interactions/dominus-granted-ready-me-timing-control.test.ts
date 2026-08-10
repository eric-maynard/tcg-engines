/**
 * Interaction: Dominus (ven-142-166) · Spell · Fury/Body · 4 · [Action]
 *     "This turn, double a unit's Might and give it '[rainbow][rainbow]: Ready me.'"
 *   × Vi, Destructive (ogn-036-298) · Champion Unit · Fury · 3 Might
 *     "[Ganking] … Recycle 1 from your trash: Give me +1 [Might] this turn."   (no timing tag)
 *
 * Question (P1's turn):
 *   (a) Open State: P1 casts Dominus on P1's own EXHAUSTED Vi (1 card in trash, 2 power of mixed
 *       domains). Does "[rainbow][rainbow]: Ready me" show up for P1, when is the power taken, can P2
 *       react before Vi readies?
 *   (b) P1 is in a combat showdown at bf2 (P1 has Focus) and casts Dominus there on the attacking Vi.
 *       While the showdown is open, can P1 activate the granted Ready me / Vi's printed Recycle
 *       ability? After combat ends (still P1's turn)?
 *   (c) P1 casts Dominus on P2's unit Z: who controls the granted ability, does it ever appear for P1,
 *       can P2 use it during P1's turn, what is left of it on P2's next turn?
 *   (d) Vi's "Recycle 1 from your trash" with an EMPTY trash / with exactly one card.
 *
 * Rules: 191.4.a (an ability's controller = its source's controller — the granted ability lives on the
 * UNIT), 381 (activated abilities: controller's turn, Open State only), 343.1.b (card abilities cannot
 * be played during a Showdown by default), 404.1 (costs are paid as the ability is activated), 406.4
 * (other players may React before resolution), 347.1 (only legally-timed plays inside a showdown),
 * 416.3 / 402.3 (a Recycle cost that cannot be completed makes the ability un-activatable).
 *
 * Expected: (a) yes — enumerated for P1 while 2 power of ANY domains is available; both power are gone
 * the moment it is activated, P2 holds priority with the item on the chain and Vi still exhausted, then
 * Vi readies; Vi is 6 Might. (b) neither ability is offered inside the showdown; both are once combat has
 * closed. (c) P2 controls it; never offered to P1; P2 cannot use it on P1's turn; gone on P2's turn.
 * (d) empty trash → not enumerated; one card → once, then gone.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DOMINUS = "ven-142-166";
const VI = "ogn-036-298";
const JUNK = "ogn-175-298"; // vanilla card to sit in the trash
const VI_ABILITY = 1; // Vi: #0 = Ganking keyword, #1 = the Recycle activated ability

/**
 * P1's turn 2. Vi exhausted in P1's base, one junk card in P1's trash, exactly Dominus' 4 energy plus
 * 2 power of MIXED domains (fury + body). P2 holds bf2 with a 5-Might Wall and has an exhausted vanilla
 * Z in base. bf1 is P2's and empty of units (irrelevant filler so Ganking has somewhere to point).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1, body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", VI, "vi", { exhausted: true })
    .trash(P1, JUNK, "junk")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 3, name: "Zed" }, "z", { exhausted: true })
    .hand(P1, DOMINUS, "dom");
}

/** The `activate` menu variants a seat is offered for `unit`, split into the granted Ready-me and Vi's printed Recycle. */
function activations(game: Game, seat: "p1" | "p2", unit: string) {
  const variants = game[seat]
    .legal()
    .filter((o) => o.verb === "activate" && o.card === unit)
    .flatMap((o) => o.variants);
  // The grant names Dominus as its source; Vi's printed ability is every other variant (with a single
  // card in trash the recycle choice is forced and carries no `recycleIds` param at all).
  const isReadyMe = (v: (typeof variants)[number]) => (v.params as { sourceCardId?: string }).sourceCardId === "dom";
  const readyMe = variants.filter(isReadyMe);
  const recycle = variants.filter((v) => !isReadyMe(v));
  return { all: variants, readyMe, recycle };
}

/** Activate the granted "[rainbow][rainbow]: Ready me" hosted on `unit` (source = Dominus). */
async function activateReadyMe(game: Game, seat: "p1" | "p2", unit: string): Promise<void> {
  const opt = game[seat].legal().find((o) => o.verb === "activate" && o.card === unit);
  expect(opt).toBeDefined();
  await game[seat].choose(opt!.key, { source: "dom" });
}

describe("Dominus × Vi, Destructive — granted 'Ready me': timing and control", () => {
  // ---- (a) Open State, own exhausted Vi ------------------------------------------------------------

  test("(a) before Dominus only Vi's printed Recycle ability is offered; after Dominus resolves on the exhausted Vi she is 6 Might and the granted 'Ready me' IS in P1's legal actions (191.4.a)", async () => {
    const game = await board().build();
    expect(activations(game, "p1", "vi").readyMe).toHaveLength(0);
    expect(activations(game, "p1", "vi").recycle.length).toBeGreaterThan(0);
    await game.p1.cast("dom", { targets: "vi" });
    await game.settle();
    expect(game.zoneOf("dom")).toBe("trash");
    expect(game.state("vi")).toMatchObject({ baseMight: 3, controller: P1, isExhausted: true, might: 6 });
    expect(activations(game, "p1", "vi").readyMe).toHaveLength(1);
    // Mixed domains pay [rainbow][rainbow]: nothing has been spent yet just by being offered.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, fury: 1 } });
  });

  test("(a) activation pays BOTH power immediately (404.1), puts an ability item from Vi on the chain under P1, and Vi is still exhausted while it is pending", async () => {
    const game = await board().build();
    await game.p1.cast("dom", { targets: "vi" });
    await game.settle();
    await activateReadyMe(game, "p1", "vi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: false })]);
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) P2 gets priority to React before it resolves (406.4): after P1 passes it is P2's chain decision with Vi still exhausted; once P2 passes Vi readies", async () => {
    const game = await board().build();
    await game.p1.cast("dom", { targets: "vi" });
    await game.settle();
    await activateReadyMe(game, "p1", "vi");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
    expect(game.state("vi").isExhausted).toBe(true);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("vi")).toMatchObject({ isReady: true, might: 6 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) with only 1 power left after Dominus the granted ability is NOT enumerated (cost unpayable), while Vi's cost-free-in-resources Recycle ability still is", async () => {
    const game = await board().resources(P1, { energy: 4, power: { fury: 1, body: 0 } }).build();
    await game.p1.cast("dom", { targets: "vi" });
    await game.settle();
    expect(game.state("vi").might).toBe(6);
    expect(activations(game, "p1", "vi").readyMe).toHaveLength(0);
    expect(activations(game, "p1", "vi").recycle.length).toBeGreaterThan(0);
  });

  // ---- (b) inside a combat showdown ------------------------------------------------------------------

  test("(b) Dominus itself is [Action]: castable while P1 holds Focus in the bf2 combat showdown on the attacking Vi → 6 Might", async () => {
    const game = await board().unit(P1, "base", VI, "viAtk").build();
    await game.p1.move("viAtk", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "dom")).toBe(true);
    await game.p1.cast("dom", { targets: "viAtk" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("viAtk")).toMatchObject({ isExhausted: true, might: 6, zone: "battlefield-bf2" });
  });

  test("(b) while the showdown is still open (Focus back with P1, 2 power in pool, a card in trash) NEITHER the granted 'Ready me' NOR Vi's printed Recycle ability is enumerated, and forcing either is rejected (381, 343.1.b, 347.1)", async () => {
    const game = await board().unit(P1, "base", VI, "viAtk").build();
    await game.p1.move("viAtk", "bf2");
    await game.p1.cast("dom", { targets: "viAtk" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Dominus resolves, Focus passes to P2 (347.1.b)
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.resources().power).toEqual({ body: 1, fury: 1 });
    expect(game.p1.trash().length).toBeGreaterThan(0);
    const showdown = activations(game, "p1", "viAtk");
    expect(showdown.readyMe).toHaveLength(0);
    expect(showdown.recycle).toHaveLength(0);
    // The exhausted Vi back in base is not offered either — it is not about location, it is the state.
    expect(activations(game, "p1", "vi").all).toHaveLength(0);
    expect((await game.p1.try((p) => p.choose("activateAbility:viAtk#1", { source: "dom" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("viAtk", VI_ABILITY, { params: { recycleIds: ["junk"] } }))).ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("viAtk").isExhausted).toBe(true);
  });

  test("(b) once combat closes (6 kills the 5-Might Wall, Vi conquers bf2, back to P1's Neutral Open main phase) BOTH abilities become available; Ready me stands the exhausted attacker back up", async () => {
    const game = await board().unit(P1, "base", VI, "viAtk").build();
    await game.p1.move("viAtk", "bf2");
    await game.p1.cast("dom", { targets: "viAtk" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("viAtk")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("viAtk")).toMatchObject({ isExhausted: true, might: 6 });
    const open = activations(game, "p1", "viAtk");
    expect(open.readyMe).toHaveLength(1);
    expect(open.recycle.length).toBeGreaterThan(0);
    await activateReadyMe(game, "p1", "viAtk");
    await game.settle();
    expect(game.state("viAtk").isReady).toBe(true);
    expect(game.p1.power()).toBe(0);
    // …and the printed ability works too now: recycle the junk for +1 (6 → 7).
    await game.p1.activate("viAtk", VI_ABILITY, { params: { recycleIds: ["junk"] } });
    await game.settle();
    expect(game.state("viAtk").might).toBe(7);
    expect(game.zoneOf("junk")).toBe("mainDeck");
    // Ready again with Ganking: she may act again this turn (move on to bf1).
    expect(game.p1.can("gank", "viAtk")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) cast on the ENEMY unit Z -----------------------------------------------------------------

  test("(c) Dominus on P2's exhausted Z doubles it (3 → 6) and hosts the grant on Z under P2's control; it NEVER appears in P1's legal actions and P1's 2 power stay untouched (191.4.a)", async () => {
    const game = await board().build();
    await game.p1.cast("dom", { targets: "z" });
    await game.settle();
    expect(game.state("z")).toMatchObject({ controller: P2, isExhausted: true, might: 6, owner: P2 });
    expect((game.state("z").meta as { grantedAbilities?: unknown[] }).grantedAbilities).toEqual([
      expect.objectContaining({ duration: "turn", sourceCardId: "dom" }),
    ]);
    expect(activations(game, "p1", "z").all).toHaveLength(0);
    expect((await game.p1.try((p) => p.choose("activateAbility:z#1", { source: "dom" }))).ok).toBe(false);
    expect(game.p1.resources().power).toEqual({ body: 1, fury: 1 });
    expect(game.state("z").isExhausted).toBe(true);
  });

  test("(c) P2 — even holding 2 rainbow power — cannot activate it during P1's turn (381): not offered, and a forced raw activation is rejected with nothing on the chain", async () => {
    const game = await board().resources(P2, { power: { rainbow: 2 } }).build();
    await game.p1.cast("dom", { targets: "z" });
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(activations(game, "p2", "z").all).toHaveLength(0);
    expect((await game.p2.try((p) => p.choose("activateAbility:z#1", { source: "dom" }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.do("activateAbility", { abilityIndex: 1, cardId: "z", playerId: P2, sourceCardId: "dom" }))).ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p2.power()).toBe(2);
    expect(game.state("z").isExhausted).toBe(true);
  });

  test("(c) 'this turn': on P2's next turn Z is a plain 3 again, the grant is gone from Z, and even with 2 fresh power and Z exhausted P2 is offered no 'Ready me'", async () => {
    const game = await board().build();
    await game.p1.cast("dom", { targets: "z" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("z")).toMatchObject({ might: 3, mightModifier: 0 });
    expect((game.state("z").meta as { grantedAbilities?: unknown[] }).grantedAbilities ?? []).toEqual([]);
    await game.p2.do("addResources", { power: { rainbow: 2 } });
    await game.p2.move("z", "bf1"); // exhaust Z (bf1 is P2's own, empty)
    await game.settle();
    expect(game.state("z").isExhausted).toBe(true);
    expect(activations(game, "p2", "z").all).toHaveLength(0);
  });

  // ---- (d) Vi's Recycle cost with an empty / one-card trash ------------------------------------------

  test("(d) EMPTY trash: Vi's 'Recycle 1 from your trash' cannot be paid → not enumerated at all, and forcing it is rejected (416.3, 402.3)", async () => {
    const game = await scenario().unit(P1, "base", VI, "vi").build();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.can("activate", "vi")).toBe(false);
    expect(activations(game, "p1", "vi").all).toHaveLength(0);
    expect((await game.p1.try((p) => p.activate("vi", VI_ABILITY))).ok).toBe(false);
    expect(game.state("vi").might).toBe(3);
  });

  test("(d) exactly ONE card in trash: activatable once (+1 Might, the card is recycled to the bottom of the deck), after which it disappears from legalActions", async () => {
    const game = await scenario().unit(P1, "base", VI, "vi").trash(P1, JUNK, "junk").build();
    expect(game.p1.can("activate", "vi")).toBe(true);
    await game.p1.activate("vi", VI_ABILITY);
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    expect(game.zoneOf("junk")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("junk");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.can("activate", "vi")).toBe(false);
    expect(activations(game, "p1", "vi").all).toHaveLength(0);
  });
});
