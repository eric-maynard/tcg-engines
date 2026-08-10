/**
 * Brush — unl-t03 · Battlefield TOKEN · no domain
 *
 *   Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].
 *   When you score here, you may replace this with the battlefield it replaced.
 *
 * Rules: 187.8 (the Brush token's two abilities, verbatim), 143.1 / 185.2.c (tags), 476 (a static
 * "+1 [Might]" lives in the arithmetic layer and is continuously re-evaluated: it follows the unit
 * in and out of "here"), 053.3 ("here" = at THIS battlefield only — either side's units), 468 / 469
 * (Score = Conquer OR Hold), 438.7 ("replace [the token] with the battlefield it replaced" = Swap
 * Back: the token stops existing and the original card returns from Banishment to the same slot,
 * inheriting statuses — 438.7.b; nothing in Banishment to swap to → it can never swap back, 438.7.c).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Tag-scoped, not side-scoped: an ENEMY Poro standing in the Brush is 3 as well; a tagless unit
 *     beside it stays at printed Might; a Poro in a base or at another battlefield gets nothing.
 *  2. "have +1" once per unit, not per matching tag: a Cat-and-Dog unit is +1, not +2.
 *  3. It stacks with combat keywords in the arithmetic layer: Daring Poro (Assault) attacking INTO the
 *     Brush is 2+1+1 = 4 and beats a 3 it would merely trade with elsewhere; Stalwart Poro (Shield)
 *     defending in the Brush is 4 and kills a 3-Might raider it would otherwise only trade with.
 *  4. The bonus is positional and immediate: it appears the moment a Poro moves in (before combat
 *     damage) and is gone the moment it is recalled home.
 *  5. Clause 2 is a "you may" SCORE trigger for whoever scores here (hold OR conquer) and only does
 *     something if a replaced battlefield waits in Banishment. Engine status: only the static is
 *     authored — the swap-back trigger is absent (BUG tests below).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-t03";
const STALWART_PORO = "ogn-052-298"; // 2 Might · Poro · [Shield] (+1 while defending)
const DARING_PORO = "ogn-210-298"; // 2 Might · Poro · [Assault] (+1 while attacking)
const BIRD = "unl-t02"; // 1 Might Bird token · [Deflect]
const IVERN = "unl-051-219"; // Ivern, Nurturer · 4 Might · Ivern tag
const NAVORI_PIT = "ogn-283-298"; // a real battlefield to sit in Banishment as "the battlefield it replaced"

/** A Brush at `brush` controlled by `ctrl`, abilities live. */
const withBrush = (ctrl: typeof P1 | typeof P2 | null = P1) => scenario().battlefield("brush", { controller: ctrl, def: CARD, inert: false });

describe("Brush (unl-t03)", () => {
  test("registry payload: a domainless BATTLEFIELD whose first ability is a static +1 [Might] for units HERE carrying any of the five tags", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Brush" });
    expect(def?.domain === undefined || def?.domain === "colorless" || (Array.isArray(def?.domain) && def.domain.length === 0)).toBe(true);
    expect(def?.abilities?.[0]).toEqual({
      effect: { amount: 1, target: { filter: { tag: ["Bird", "Cat", "Dog", "Poro", "Ivern"] }, location: "here", type: "unit" }, type: "modify-might" },
      type: "static",
    });
  });

  test("registry payload — the SECOND printed ability ('When you score here, you may replace this with the battlefield it replaced', 187.8 / 438.7) must exist as an optional score-here trigger", async () => {
    // Expected: abilities[1] ≈ { type: "triggered", optional: true, trigger: { event: "score", on: "controller", location: "here" },
    // effect: { type: "swap-back" | "replace", … } }. Actual: the hand-authored list holds only the static.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[1]).toMatchObject({ optional: true, trigger: { event: "score" }, type: "triggered" });
  });

  test("static, clause by clause: friendly Poro here 2→3, ENEMY Poro here 2→3, Bird token here 1→2, Ivern here 4→5 — while a tagless unit here, a Poro in base and a Poro at another battlefield keep printed Might", async () => {
    const game = await withBrush(P1)
      .battlefield("plain", { controller: P1 })
      .unit(P1, "brush", STALWART_PORO, "poro")
      .unit(P2, "brush", DARING_PORO, "enemyPoro")
      .unit(P1, "brush", BIRD, "bird")
      .unit(P1, "brush", IVERN, "ivern")
      .unit(P1, "brush", { might: 2, name: "Recruit" }, "tagless")
      .unit(P1, "base", STALWART_PORO, "homePoro")
      .unit(P1, "plain", STALWART_PORO, "farPoro")
      .build();
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 3, staticMightBonus: 1 });
    expect(game.state("enemyPoro")).toMatchObject({ baseMight: 2, might: 3 });
    expect(game.state("bird").might).toBe(2);
    expect(game.state("ivern")).toMatchObject({ baseMight: 4, might: 5 });
    expect(game.state("tagless")).toMatchObject({ might: 2, staticMightBonus: 0 });
    expect(game.state("homePoro").might).toBe(2);
    expect(game.state("farPoro").might).toBe(2);
    expect(game.state("poro").isBuffed).toBe(false); // a static modifier, not a buff counter
  });

  test("Cat and Dog tags count too, and 'have +1' is per UNIT not per tag: a Cat is +1, a Cat-Dog is still only +1", async () => {
    const game = await withBrush(P2)
      .unit(P2, "brush", { might: 1, name: "Alley Cat", tags: ["Cat"] }, "cat")
      .unit(P2, "brush", { might: 3, name: "Good Dog", tags: ["Dog"] }, "dog")
      .unit(P2, "brush", { might: 2, name: "Chimera", tags: ["Cat", "Dog"] }, "catdog")
      .unit(P2, "brush", { might: 2, name: "Yordle", tags: ["Yordle"] }, "other")
      .build();
    expect(game.state("cat").might).toBe(2);
    expect(game.state("dog").might).toBe(4);
    expect(game.state("catdog")).toMatchObject({ might: 3, staticMightBonus: 1 });
    expect(game.state("other").might).toBe(2);
  });

  test("an inert copy (abilities stripped by the harness) grants nothing — the +1 really comes from the Brush text, not from the tag", async () => {
    const game = await scenario().battlefield("brush", { controller: P1, def: CARD, inert: true }).unit(P1, "brush", STALWART_PORO, "poro").build();
    expect(game.state("poro").might).toBe(2);
  });

  test("positional and immediate (476): Daring Poro is 2 in base, 4 the moment it attacks INTO an enemy Brush (Assault +1, Brush +1) — it kills the 3-Might guard and conquers; at a plain field the same attack only trades", async () => {
    const control = await scenario()
      .battlefield("plain", { controller: P2 })
      .unit(P2, "plain", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", DARING_PORO, "poro")
      .build();
    await control.p1.move("poro", "plain");
    expect(control.state("poro").might).toBe(3);
    await control.settle();
    expect(control.zoneOf("poro")).toBe("trash");
    expect(control.zoneOf("guard")).toBe("trash");
    expect(control.gameState.battlefields.plain?.controller).not.toBe(P1);

    const game = await withBrush(P2).unit(P2, "brush", { might: 3, name: "Guard" }, "guard").unit(P1, "base", DARING_PORO, "poro").build();
    expect(game.state("poro").might).toBe(2);
    await game.p1.move("poro", "brush");
    expect(game.state("poro")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("guard").might).toBe(3); // tagless defender: no help from the Brush
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-brush");
    // rule 466.7 — Combat Cleanup is the LAST step of the combat, so the conquer's own score trigger is still on
    // the chain here and the Poro keeps its Attacker designation (with Assault) until that item is answered.
    await game.p1.no(); // decline the Brush's score trigger → the chain drains and the combat ends
    expect(game.state("poro").might).toBe(3); // combat over: Assault off, Brush still on
    expect(game.gameState.battlefields.brush?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("defending in the Brush: Stalwart Poro is 2 + Shield 1 + Brush 1 = 4 and kills a 3-Might raider outright (elsewhere 3 vs 3 would trade)", async () => {
    const game = await withBrush(P1)
      .active(P2)
      .unit(P1, "brush", STALWART_PORO, "poro")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.state("poro").might).toBe(3);
    await game.p2.move("raider", "brush");
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-brush");
    expect(game.state("poro").damage).toBe(0);
    expect(game.gameState.battlefields.brush?.controller).toBe(P1);
  });

  test("leaving 'here' drops the bonus at once: a Poro recalled from the Brush to base is 2 again, and the one that stayed is still 3", async () => {
    const game = await withBrush(P1).unit(P1, "brush", STALWART_PORO, "leaver").unit(P1, "brush", STALWART_PORO, "stayer").build();
    expect([game.state("leaver").might, game.state("stayer").might]).toEqual([3, 3]);
    await game.p1.move("leaver", "base");
    await game.settle();
    expect(game.zoneOf("leaver")).toBe("base");
    expect(game.state("leaver")).toMatchObject({ might: 2, staticMightBonus: 0 });
    expect(game.state("stayer").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("holding the Brush scores normally (+1 in my Beginning Phase) and — with NOTHING it replaced in Banishment (438.7.c) — play simply continues to my main phase with the Brush still on the map", async () => {
    const game = await withBrush(P1).turn(2).active(P2).unit(P1, "brush", STALWART_PORO, "poro").build();
    game.script(P1, [(d) => (d.kind === "yes-no" ? "no" : undefined)]); // tolerate a future optional prompt
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.battlefields()).toEqual(["brush"]);
    expect(game.state("poro").might).toBe(3);
  });

  test("'When you score here, you may replace this with the battlefield it replaced' — on HOLDING the Brush with the replaced Navori Fighting Pit in Banishment, P1 is offered the swap-back; 'yes' brings the Pit back to that slot under P1's control and the Brush token ceases to exist (438.7.b)", async () => {
    // Expected: after P2 ends the turn P1 holds (+1) and gets a yes/no sourced from the Brush; yes →
    // battlefields = the Pit (controller P1, my Poro standing on it at printed 2 Might), "pit" no longer
    // in banishment, "brush" gone. Actual: no trigger exists — the phase runs straight to main.
    const game = await withBrush(P1).turn(2).active(P2).unit(P1, "brush", STALWART_PORO, "poro").banishment(P1, NAVORI_PIT, "pit").build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "brush" } });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("pit")).toBe("battlefieldRow");
    expect(game.has("brush") ? game.zoneOf("brush") : "gone").toBe("gone");
    const pitState = Object.values(game.gameState.battlefields).find((b) => b.id === "pit");
    expect(pitState?.controller).toBe(P1);
    expect(game.locationOf("poro")).toBe("pit");
    expect(game.state("poro").might).toBe(2); // the Pit has no Poro clause
  });

  test("the swap-back is offered on CONQUERING the Brush too (score = hold OR conquer, 468) and may be declined — 'no' keeps the Brush and its +1", async () => {
    // Expected: P1's Daring Poro walks onto the empty P2 Brush, conquers (+1) → yes/no from the Brush;
    // "no" → Brush stays, Pit stays banished, Poro is 3 here. Actual: no prompt at all.
    const game = await withBrush(P2).unit(P1, "base", DARING_PORO, "poro").banishment(P1, NAVORI_PIT, "pit").build();
    await game.p1.move("poro", "brush");
    await game.settle();
    expect(game.gameState.battlefields.brush?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "brush" } });
    await game.p1.no();
    await game.settle();
    expect(game.battlefields()).toEqual(["brush"]);
    expect(game.zoneOf("pit")).toBe("banishment");
    expect(game.state("poro").might).toBe(3);
  });
});
