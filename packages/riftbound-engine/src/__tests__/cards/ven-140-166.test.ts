/**
 * Shuriken Flip — ven-140-166 · Spell · Fury/Calm · 1 energy + 1 power (hybrid fury|calm pip)
 *
 *   Deal 2 to up to one enemy unit at a battlefield, then move a friendly unit.
 *   [Flow] [3][rainbow] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. "up to one" (355.13): zero targets is a legal way to play it (e.g. purely for the move), and the
 *     spell is playable with no enemy unit at any battlefield at all. Target legality is a conjunction:
 *     ENEMY + unit + AT A BATTLEFIELD (an enemy unit in its base, or a friendly unit, is never offered).
 *  2. "then move a friendly unit" is a second, MANDATORY instruction sequenced after the damage: the
 *     caster picks one of their units and a destination; a move into an enemy-held battlefield stages a
 *     combat once the spell has left the chain — and the 2 damage just dealt is still marked for it.
 *  3. 2 damage is exactly lethal on a 2-Might unit, one short on a 3-Might unit.
 *  4. [Flow] (829): from the TRASH only, for the ALTERNATE cost [3][rainbow] (not 1+pip); after it
 *     resolves it is BANISHED (delayed replacement, 829.1.b.1), so it can be flowed once. From hand it
 *     still costs 1 + pip and goes to the trash (ready to be flowed later). Flow changes neither timing
 *     nor targeting permissions (829.1.b.2): no [Action]/[Reaction] → never in a showdown / enemy turn,
 *     and the "up to one" zero-target play must be just as legal from the trash.
 *  5. Hybrid pip on a two-domain card (135.2.e.6.c): fury OR calm power pays; mind does not.
 */

import { describe, expect, test } from "bun:test";
import type { SeatHandle } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-140-166";

const targetsOf = (seat: SeatHandle, card: string) =>
  (seat.option("cast", card)?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];

/** P1: 4 energy, 2 fury. P2 holds bf1 with Big (3) and Small (2) and keeps Homebody (1) in base; P1's Ally (4) is in base; bf2 is P1's and empty. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
    .hand(P1, CARD, "flip")
    .trash(P1, CARD, "flipT");
}

describe("Shuriken Flip (ven-140-166)", () => {
  test("card data: 1-cost Fury/Calm spell with one hybrid pip, standard timing, a [Flow] keyword costed [3][rainbow]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["fury", "calm"], energyCost: 1, powerCost: ["rainbow"], timing: "standard" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toContainEqual({ cost: { energy: 3, power: ["rainbow"] }, keyword: "Flow", type: "keyword" });
    const spell = abilities.find((a) => a.type === "spell");
    expect(JSON.stringify(spell)).toContain('"upTo":1');
    expect(spell).toMatchObject({ effect: expect.objectContaining({}) });
  });

  test("the spell effect is a sequence — damage 2 (up to one enemy unit at a battlefield) THEN move a friendly unit", async () => {
    // Expected: effect { type: "sequence", effects: [ {type:"damage", amount:2, target:{controller:"enemy", location:"battlefield", quantity:{upTo:1}}}, {type:"move", target:{controller:"friendly", type:"unit"}} ] }.
    // Actual: a lone { type: "damage", … } — "then move a friendly unit" was dropped by the parser.
    const def = (await loadDefaultCardPool()).get(CARD);
    const spell = ((def?.abilities ?? []) as { type: string; effect?: { type?: string; effects?: { type?: string }[] } }[]).find((a) => a.type === "spell");
    expect(spell?.effect?.type).toBe("sequence");
    expect(spell?.effect?.effects?.map((e) => e.type)).toEqual(["damage", "move"]);
    expect(JSON.stringify(spell?.effect?.effects?.[1])).toContain("friendly");
  });

  test("from hand: costs 1 energy + 1 fury, deals 2 to the chosen enemy unit at a battlefield (3-Might Big survives with 2), spell goes to the TRASH", async () => {
    const game = await board().build();
    await game.p1.cast("flip", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flip", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("big").damage).toBe(2);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flip")).toBe("trash");
  });

  test("exactly lethal: 2 on the 2-Might Small kills it (owner's trash); Big untouched", async () => {
    const game = await board().build();
    await game.p1.cast("flip", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.p2.trash()).toContain("small");
    expect(game.state("big").damage).toBe(0);
  });

  test("targets are ENEMY units AT A BATTLEFIELD only, and 'up to one' offers the empty choice: {∅, big, small} — never Homebody (enemy base) or Ally (friendly)", async () => {
    const game = await board().build();
    const opts = targetsOf(game.p1, "flip");
    expect(opts).toHaveLength(3);
    expect(opts).toEqual(expect.arrayContaining([[], ["big"], ["small"]]));
    expect((await game.p1.try((p) => p.cast("flip", { targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("flip", { targets: "ally" }))).ok).toBe(false);
    expect(game.zoneOf("flip")).toBe("hand");
    // Choosing zero even though targets exist: cost paid, nobody is damaged.
    await game.p1.cast("flip", { targets: [] });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    await game.settle();
    expect(game.state("big").damage + game.state("small").damage + game.state("home").damage).toBe(0);
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flip")).toBe("trash");
  });

  test("'up to one' = zero is fine (355.13): with NO enemy unit at any battlefield the spell is still castable from hand, deals nothing, and is trashed", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { calm: 1 } }).battlefield("bf1", { controller: P1 }).unit(P2, "base", { might: 1 }, "home").unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "flip").build();
    expect(game.p1.can("cast", "flip")).toBe(true);
    await game.p1.cast("flip");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // calm pays the hybrid pip too
    await game.settle();
    expect(game.state("home").damage).toBe(0);
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flip")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
  });

  test("cost colours (hybrid fury|calm pip): fury pays, calm pays, rainbow pays, mind does NOT, and 0 energy is short", async () => {
    const mk = (energy: number, power: Record<string, number>) =>
      scenario().resources(P1, { energy, power }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "foe").hand(P1, CARD, "flip").build();
    expect((await mk(1, { fury: 1 })).p1.can("cast", "flip")).toBe(true);
    expect((await mk(1, { calm: 1 })).p1.can("cast", "flip")).toBe(true);
    expect((await mk(1, { rainbow: 1 })).p1.can("cast", "flip")).toBe(true);
    expect((await mk(1, { mind: 1 })).p1.can("cast", "flip")).toBe(false);
    expect((await mk(0, { fury: 1 })).p1.can("cast", "flip")).toBe(false);
    expect((await mk(1, {})).p1.can("cast", "flip")).toBe(false);
  });

  test("'then move a friendly unit' — after the 2 damage P1 must be asked to move one of their units; moving Ally base → its own bf2 completes the spell", async () => {
    // Expected: a P1 prompt (pick a friendly unit / destination) follows the damage; Ally ends at bf2, flip in trash.
    // Actual: the spell resolves after the damage with no move prompt; Ally never leaves base.
    const game = await board().build();
    await game.p1.cast("flip", { targets: "big" });
    await game.settle();
    expect(game.state("big").damage).toBe(2);
    expect(game.decision()).toMatchObject({ seat: P1 });
    expect(game.decision()?.kind).not.toBe("action");
    if (game.decision()?.kind === "pick") await game.p1.pick("ally");
    if (game.decision()?.kind === "pick") await game.p1.pick("bf2");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf2");
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flip")).toBe("trash");
  });

  test("the move happens even with ZERO damage targets — Ally leaves base", async () => {
    // Expected: Ally is somewhere other than base after resolving with the first-option policy. Actual: no move exists.
    const game = await board().build();
    await game.p1.cast("flip", { targets: [] });
    await game.settle({ policy: "first" });
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flip")).toBe("trash");
    expect(game.locationOf("ally")).not.toBe("base");
  });

  test("combo line — 2 to Big, then move the 4-Might Ally INTO bf1: the marked 2 carries into the staged combat (4 split 2/2 kills Big and Small; their 5 kills Ally) → bf1 ends empty and uncontrolled, nobody scores", async () => {
    // Expected: the move opens a combat right after the spell leaves the chain; with P1 assigning 2/2 both
    // defenders die (Big already had 2 of its 3), Ally takes 3+2=5 ≥ 4 and dies; 466.5.b → uncontrolled.
    // Actual: no move prompt, Ally stays in base, no combat.
    const game = await board().script(P1, [{ allocation: { big: 2, small: 2 }, kind: "distribute" }]).build();
    await game.p1.cast("flip", { targets: "big" });
    await game.settle();
    if (game.decision()?.kind === "pick") await game.p1.pick("ally");
    if (game.decision()?.kind === "pick") await game.p1.pick("bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flip")).toBe("trash");
  });

  test("exactly lethal THEN move — 2 kills the lone 2-Might defender first, so Ally moving into bf1 finds it empty: no combat, P1 establishes control and conquers for 1", async () => {
    // rule 370.1.a.2 — the sequenced instructions happen in printed order, so the damage (and the
    // resulting death) is fully applied before the move is performed. Ally therefore arrives at an
    // EMPTY enemy-held battlefield: no combat is staged (466.3.d needs units on both sides); the
    // arrival still Contests it (190.3.a) and opens a non-combat showdown (344.2), on whose close
    // P1 establishes control and conquers.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Lone" }, "lone")
      .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
      .hand(P1, CARD, "flip")
      .build();
    await game.p1.cast("flip", { targets: "lone" });
    await game.settle();
    expect(game.zoneOf("lone")).toBe("trash");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("flip")).toBe("trash");
  });

  test("one short — 2 on the 3-Might Foe leaves it standing, so Ally (2) moving into bf1 fights: the marked 2 finishes Foe while Foe's 3 kills Ally → bf1 ends uncontrolled, nobody scores", async () => {
    // rule 466.3.d — the move stages a combat because a defender is still there; the damage already
    // marked on Foe persists into it, so 2 more is lethal while Foe's full 3 Might kills the 2-Might
    // Ally. Both sides are wiped ⇒ nobody controls bf1 and no one conquers (466.5.b).
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "flip")
      .build();
    await game.p1.cast("flip", { targets: "foe" });
    await game.settle();
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("[Flow]: from the TRASH it costs the alternate [3] + 1 power (not 1 + pip), resolves normally (2 to Big), then is BANISHED instead of returning to the trash", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "flipT")).toBe(true);
    await game.p1.cast("flipT", { flow: true, targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.zoneOf("flipT")).toBe("chain");
    await game.settle();
    expect(game.state("big").damage).toBe(2);
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flipT")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("flipT");
    expect(game.p1.can("cast", "flipT")).toBe(false); // banished: gone for good
  });

  test("[Flow] cost gate: with only 2 energy the trash copy is NOT playable while the hand copy (1 + pip) still is", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "foe").hand(P1, CARD, "flip").trash(P1, CARD, "flipT").build();
    expect(game.p1.can("cast", "flipT")).toBe(false);
    expect(game.p1.can("cast", "flip")).toBe(true);
  });

  test("hand first, Flow later: the trashed copy from an earlier cast can be flowed the same turn for [3]+pip and ends banished (Big takes 2 + 2 and dies)", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1, calm: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Big" }, "big").hand(P1, CARD, "flip").build();
    await game.p1.cast("flip", { targets: "big" });
    await game.settle();
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("flip")).toBe("trash");
    expect(game.p1.can("cast", "flip")).toBe(true); // now offered from the trash via Flow
    await game.p1.cast("flip", { flow: true, targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash"); // 2 + 2 ≥ 4 within the same turn
    expect(game.zoneOf("flip")).toBe("banishment");
  });

  test("timing (829.1.b.2): no [Action]/[Reaction] — neither the hand copy nor the Flow copy is playable inside a showdown or on the opponent's chain", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "flip")).toBe(false);
    expect(game.p1.can("cast", "flipT")).toBe(false);
    const opp = await scenario().active(P2).resources(P1, { energy: 4, power: { fury: 2 } }).resources(P2, { energy: 2 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "foe").hand(P2, "ogs-003-024", "inc").hand(P1, CARD, "flip").trash(P1, CARD, "flipT").build();
    await opp.p2.cast("inc", { targets: "foe" });
    await opp.p2.passPriority();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("cast", "flip")).toBe(false);
    expect(opp.p1.can("cast", "flipT")).toBe(false);
  });

  test("Flow keeps the 'up to one' permission — with no enemy unit at any battlefield the trash copy must still be playable for [3]+pip (zero targets)", async () => {
    // Expected (355.13 + 829.1.b.2): can("cast", flipT) is true, exactly like the hand copy. Actual: the Flow
    // variant is only generated when at least one target exists.
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).battlefield("bf1", { controller: P1 }).unit(P2, "base", { might: 1 }, "home").unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "flip").trash(P1, CARD, "flipT").build();
    expect(game.p1.can("cast", "flip")).toBe(true);
    expect(game.p1.can("cast", "flipT")).toBe(true);
  });
});
