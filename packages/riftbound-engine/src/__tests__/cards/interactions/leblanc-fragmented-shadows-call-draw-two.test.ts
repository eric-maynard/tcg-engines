/**
 * Interaction: LeBlanc, Fragmented (unl-172-219) · Champion Unit · Order · 3 · 3 Might
 *     "[Assault]  /  [Deathknell][>] Draw 1. If it's your Beginning Phase, draw 2 instead."
 *   × Shadow's Call (unl-165-219) · Spell · Order · 2 · Action
 *     "Choose a friendly unit without [Temporary]. Give it [Temporary]. Draw 2.
 *      (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] · Action — "Kill a unit."
 *   (+ Sprite token unl-t07 — a printed-[Temporary] unit — for the targeting probe.)
 *
 * Question: P1's LeBlanc sits alone at bf1 (P1 controls). On P1's turn P1 casts Shadow's Call on her (draw 2, she
 * gains Temporary).
 *   (a) P1's NEXT turn: Awaken → Beginning Step → Scoring. When does she die, is the Deathknell resolved while it is
 *       still P1's Beginning Phase (→ draw 2), does P1 score the hold at bf1, and how many cards has P1 drawn by Main
 *       Phase (Deathknell + Draw Phase)?
 *   (b) Contrast: P2 Vengeances her on P2's turn — how many cards?
 *   (c) Contrast: she dies in combat during P1's own Main Phase — how many?
 *   (d) Can Shadow's Call be cast on a unit that already has Temporary (her, or a Sprite token)?
 *
 * Rules: 816.1.b / 816.1.c (Temporary = triggered "at the start of controller's Beginning Phase, before scoring, kill
 * this"), 315.1 / 315.2.a / 315.2.b (Beginning Phase = Awaken … Beginning Step … Scoring Step), 428.1.a.1.b /
 * 808.1.d.2 / 808.1.c (Deathknell pends as she dies and resolves as a chain item), 469.2 (Hold needs a unit there at
 * the Scoring Step), 124.1 (granted keyword gone in the trash), 187.2 (tokens), 383.3.
 *
 * Expected: (a) Temporary item on the chain at the start of P1's Beginning Phase (P2 may respond) → resolves → she is
 * in P1's trash, Deathknell item on the chain, phase still "beginning" → resolves → +2 cards; Scoring: no unit at bf1 →
 * no point, bf1 uncontrolled; Draw Phase +1 → P1 enters Main having drawn 3 this turn, 0 points. (b) draw 1 (P2's
 * turn); her Temporary never fires afterwards. (c) draw 1. (d) No — neither an already-Temporary LeBlanc nor a Sprite
 * is offered; with no legal unit the spell is not castable at all.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEBLANC = "unl-172-219";
const SHADOWS_CALL = "unl-165-219";
const VENGEANCE = "ogn-229-298";
const SPRITE_TOKEN = "unl-t07";

/** P1's turn 2. LeBlanc alone at bf1 (P1 controls). P1: 2 energy + Shadow's Call ×2 in hand. P2: Vengeance in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEBLANC, "lb")
    .hand(P1, SHADOWS_CALL, "call")
    .hand(P1, SHADOWS_CALL, "call2")
    .hand(P2, VENGEANCE, "veng");
}

/** Cast Shadow's Call on LeBlanc and let it resolve. */
async function called(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("call", { targets: "lb" });
  await game.settle();
  expect(game.zoneOf("call")).toBe("trash");
  return game;
}

describe("LeBlanc, Fragmented × Shadow's Call — the Temporary death lands inside 'your Beginning Phase' → draw 2", () => {
  test("setup: Shadow's Call on LeBlanc (no Temporary yet) is legal — P1 draws 2 and she gains [Temporary]", async () => {
    const game = await board().build();
    expect(game.state("lb").keywords).toEqual(["Assault", "Deathknell"]);
    const hand = game.p1.hand().length; // call + call2
    await game.p1.cast("call", { targets: "lb" });
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.state("lb").keywords).toContain("Temporary");
    expect(game.state("lb").grantedKeywords).toEqual([expect.objectContaining({ keyword: "Temporary" })]);
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
  });

  // ---- (a) P1's next Beginning Phase ---------------------------------------------------------------------

  test("(a) she survives P2's whole turn; at the START of P1's next turn the Temporary kill is a chain item under P1 in phase 'beginning' — she is not dead yet and P2 will get priority (816.1.b, 383.3)", async () => {
    const game = await called();
    await game.advanceTurn(); // → P2's main
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
    await game.p2.endTurn(); // → P1's turn begins
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", controller: P1, triggered: true })]);
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may react
  });

  test("(a) the Temporary item resolves: LeBlanc → P1's trash, and her Deathknell is now on the chain — STILL in the Beginning Phase (scoring has not happened: 0 points) (428.1.a.1.b, 808.1.d.2, 315.2)", async () => {
    const game = await called();
    await game.advanceTurn();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.p1.trash()).toContain("lb");
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0);
  });

  test("(a) Deathknell resolves inside P1's Beginning Phase → 'draw 2 instead': exactly +2 cards from it (not 1, not 3)", async () => {
    const game = await called();
    await game.advanceTurn();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Temporary resolves → Deathknell pending
    const before = game.p1.hand().length;
    const deckBefore = game.p1.deck().length;
    await game.p1.passPriority();
    // The moment P2 passes the Deathknell resolves and the turn runs on through Scoring/Channel/Draw to Main;
    // read the Deathknell's share off the deck right after it resolves by subtracting the Draw Phase's 1.
    await game.p2.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand().length - before).toBe(3); // 2 (Deathknell) + 1 (Draw Phase)
    expect(deckBefore - game.p1.deck().length).toBe(3);
  });

  test("(a) full walk: by P1's Main Phase P1 has drawn 3 this turn, scored NOTHING for bf1 (no unit there at the Scoring Step → uncontrolled), LeBlanc in trash without Temporary (469.2, 124.1)", async () => {
    const game = await called();
    const afterCall = game.p1.hand().length; // call2 + 2 drawn
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // P1's turn, everything settles passively
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(afterCall + 3);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.units()).toEqual([]);
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.state("lb").keywords).toEqual(["Assault", "Deathknell"]);
    expect(game.state("lb").grantedKeywords).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) control: WITHOUT Shadow's Call she simply holds bf1 at that Beginning Phase for +1 and P1 draws only the Draw Phase card", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  // ---- (b) Vengeance on P2's turn ------------------------------------------------------------------------

  test("(b) P2 Vengeances her during P2's Main Phase: Deathknell resolves on P2's turn → P1 draws exactly 1", async () => {
    const game = await called();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    const before = game.p1.hand().length;
    await game.p2.cast("veng", { targets: "lb" });
    await game.settle();
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.p1.hand().length - before).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("(b) …and the granted Temporary died with her: P1's next turn starts with an EMPTY chain (no kill item, no second Deathknell) and only the Draw Phase card", async () => {
    const game = await called();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    await game.p2.cast("veng", { targets: "lb" });
    await game.settle();
    const before = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand().length - before).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  // ---- (c) combat death in P1's Main Phase ------------------------------------------------------------------

  test("(c) she attacks a 5-Might wall from base during P1's Main Phase (Assault: 4 vs 5) and dies → Deathknell draws exactly 1 (Main Phase, not Beginning)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", LEBLANC, "lb")
      .hand(P1, SHADOWS_CALL, "call")
      .build();
    await game.p1.cast("call", { targets: "lb" }); // same premise: she carries Temporary; irrelevant to the count
    await game.settle();
    const before = game.p1.hand().length;
    await game.p1.move("lb", "bf2");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf2");
    expect(game.p1.hand().length - before).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  // ---- (d) targeting: "a friendly unit without [Temporary]" ------------------------------------------------

  test("(d) once LeBlanc has Temporary the second Shadow's Call has NO legal unit → it is not castable at all; naming her is rejected", async () => {
    const game = await called();
    expect(game.p1.energy()).toBe(2); // affordable — legality fails on the target, not the cost
    expect(game.p1.can("cast", "call2")).toBe(false);
    expect(game.p1.option("cast", "call2")).toBeUndefined();
    await expect(game.p1.cast("call2", { targets: "lb" })).rejects.toThrow();
    expect(game.zoneOf("call2")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("(d) a printed-[Temporary] Sprite token is never offered either; a plain friendly unit and the not-yet-Temporary LeBlanc are; enemy units are not (187.2)", async () => {
    const game = await board()
      .unit(P1, "base", SPRITE_TOKEN, "sprite")
      .unit(P1, "base", { might: 1, name: "Plain" }, "plain")
      .unit(P2, "base", { might: 1, name: "Theirs" }, "theirs")
      .build();
    expect(game.state("sprite").keywords).toContain("Temporary");
    const field = game.p1.option("cast", "call")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["lb", "plain"]);
    await expect(game.p1.cast("call", { targets: "sprite" })).rejects.toThrow();
    await expect(game.p1.cast("call", { targets: "theirs" })).rejects.toThrow();
    expect(game.zoneOf("call")).toBe("hand");
  });

  test("(d) after the first Call resolves on LeBlanc, the second may still go on the plain unit — just not on her again", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Plain" }, "plain").build();
    await game.p1.cast("call", { targets: "lb" });
    await game.settle();
    const field = game.p1.option("cast", "call2")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["plain"]);
    await game.p1.cast("call2", { targets: "plain" });
    await game.settle();
    expect(game.state("plain").keywords).toContain("Temporary");
  });
});
