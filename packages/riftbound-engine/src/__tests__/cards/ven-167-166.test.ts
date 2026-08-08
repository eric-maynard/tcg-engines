/**
 * Vi, Destructive — ven-167-166 · Champion Unit (Vi) · Fury · 2 energy + [fury] · 3 Might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   Recycle 1 from your trash: Give me +1 [Might] this turn.
 *
 * Rules: 810 (Ganking only ADDS battlefield→battlefield to the Standard Move — still a Standard Move,
 * so it exhausts and needs a ready unit), 416.3 (Recycle as a COST must be fully payable — empty
 * trash → the ability cannot be activated; the rule's own example is this card), 416.1.c/416.5
 * (recycled cards go to the bottom of THEIR OWNER's Main Deck; the payer picks which card), 145.2 /
 * 381 (a unit's activated ability: only on your turn, in an Open state, never inside a showdown),
 * 145.2.a.1 (once activated it sits on the chain like a spell — the opponent gets priority).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. "from YOUR trash": cards in the opponent's trash never enable or pay the cost.
 *  2. The payer names WHICH trash card is recycled; it lands on the bottom of the deck, not banished,
 *     and nothing else is paid (no energy, no power, Vi does not exhaust).
 *  3. Repeatable while fuel lasts (+1 per activation, summed), then switches off; all of it is
 *     "this turn" and is gone after the turn passes.
 *  4. Timing negative space: opponent's turn, mid-showdown (even holding Focus), and while her own
 *     activation is still on the chain (Closed state) — never offered.
 *  5. Ganking + pump together: from bf1, pump to 4 and gank into a 3-Might defender at bf2 — she
 *     wins and conquers where an unpumped Vi only trades (and the battlefield she left empty
 *     becomes uncontrolled at the next cleanup); an exhausted Vi cannot gank at all.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-167-166";
const JUNK = "ogn-175-298"; // Shipyard Skulker — vanilla trash fodder

const recycle = (id: string) => ({ params: { recycleIds: [id] } });

describe("Vi, Destructive (ven-167-166)", () => {
  test("registry payload: Ganking keyword + one activated ability costing exactly 'recycle 1' that gives self +1 Might this turn; 2 + [fury], 3 Might, champion Vi", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 2, isChampion: true, might: 3, name: "Vi, Destructive", powerCost: ["fury"], tags: ["Vi"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Ganking", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { recycle: 1 }, effect: { amount: 1, duration: "turn", target: "self", type: "modify-might" }, type: "activated" });
    const cost = (def?.abilities?.[1] as { cost: Record<string, unknown> }).cost;
    expect(cost.energy ?? 0).toBe(0);
    expect(cost.exhaust ?? false).toBe(false);
  });

  test("cost: 2 energy + 1 fury; enters the base exhausted at 3 Might with Ganking; missing the fury pip or 1 energy short → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "vi").build();
    await game.p1.play("vi");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    await game.settle();
    expect(game.state("vi")).toMatchObject({ isExhausted: true, keywords: ["Ganking"], might: 3, zone: "base" });
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "v").build()).p1.can("play", "v")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { fury: 2 } }).hand(P1, CARD, "v").build()).p1.can("play", "v")).toBe(false);
  });

  test("[Ganking]: a ready Vi may move battlefield → battlefield (a vanilla unit beside her may not); it is a Standard Move, so she exhausts — and an exhausted Vi cannot gank", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "vi")
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .build();
    expect(game.p1.can("gank", "vi")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("vi", "bf2");
    expect(game.locationOf("vi")).toBe("bf2");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.locationOf("plain")).toBe("bf1");
    const tired = await scenario().battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: null }).unit(P1, "bf1", CARD, "vi", { exhausted: true }).build();
    expect(tired.p1.can("gank", "vi")).toBe(false);
  });

  test("activation: recycling the named trash card is the whole cost (no energy, no power, no exhaust); it is a non-triggered chain item P2 may answer; +1 Might once it resolves; the card is on the bottom of MY deck", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P1, "base", CARD, "vi").trash(P1, JUNK, "j1").trash(P1, JUNK, "j2").build();
    await game.p1.activate("vi", undefined, recycle("j2"));
    expect(game.p1.trash()).toEqual(["j1"]); // cost paid up front, and it was MY choice which one
    expect(game.p1.deck().at(-1)).toBe("j2");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("vi")).toMatchObject({ isExhausted: false, might: 3 }); // not resolved yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("vi")).toMatchObject({ baseMight: 3, might: 4 });
    expect(game.chain()).toEqual([]);
  });

  test("'from YOUR trash' (416.3): with cards only in the OPPONENT's trash — or no trash at all — the ability is not offered", async () => {
    const theirs = await scenario().unit(P1, "base", CARD, "vi").trash(P2, JUNK, "theirs").build();
    expect(theirs.p1.can("activate", "vi")).toBe(false);
    expect((await theirs.p1.try((p) => p.activate("vi", 1, recycle("theirs")))).ok).toBe(false);
    expect(theirs.zoneOf("theirs")).toBe("trash");
    const empty = await scenario().unit(P1, "base", CARD, "vi").build();
    expect(empty.p1.can("activate", "vi")).toBe(false);
  });

  test("repeatable while fuel lasts: three trash cards → three activations → 6 Might, trash empty, deck grew by 3, then no longer offered", async () => {
    const game = await scenario().unit(P1, "base", CARD, "vi").trash(P1, JUNK, "j1").trash(P1, JUNK, "j2").trash(P1, JUNK, "j3").build();
    const deck0 = game.p1.deck().length;
    await game.p1.activate("vi", undefined, recycle("j1"));
    await game.settle();
    await game.p1.activate("vi", undefined, recycle("j2"));
    await game.settle();
    await game.p1.activate("vi"); // one card left: nothing to choose (416.5)
    await game.settle();
    expect(game.state("vi").might).toBe(6);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deck0 + 3);
    expect(game.p1.can("activate", "vi")).toBe(false);
  });

  test("'this turn': +2 from two activations is gone once the turn passes (3 Might on P2's turn and still 3 on my next turn)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "vi").trash(P1, JUNK, "j1").trash(P1, JUNK, "j2").build();
    await game.p1.activate("vi", undefined, recycle("j1"));
    await game.settle();
    await game.p1.activate("vi");
    await game.settle();
    expect(game.state("vi").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("vi").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("vi").might).toBe(3);
  });

  test("timing negative space (145.2 / 381): not on the opponent's turn, not while holding Focus in a showdown, not while her own activation is still on the chain", async () => {
    const oppTurn = await scenario().active(P2).unit(P1, "base", CARD, "vi").trash(P1, JUNK, "j1").build();
    expect(oppTurn.p1.can("activate", "vi")).toBe(false);

    const showdown = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4 }, "d").unit(P1, "base", CARD, "vi").trash(P1, JUNK, "j1").build();
    await showdown.p1.move("vi", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("activate", "vi")).toBe(false);

    const chained = await scenario().unit(P1, "base", CARD, "vi").trash(P1, JUNK, "j1").trash(P1, JUNK, "j2").build();
    await chained.p1.activate("vi", undefined, recycle("j1"));
    expect(chained.chain()).toHaveLength(1);
    expect(chained.p1.can("activate", "vi")).toBe(false); // Closed state
    await chained.settle();
    expect(chained.p1.can("activate", "vi")).toBe(true); // Open again
  });

  test("pump + Ganking: from bf1 she pumps to 4, ganks into a 3-Might defender at bf2, kills it, survives (3 < 4) and conquers bf2 — and the bf1 she vacated becomes uncontrolled (cleanup step 4)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "bf1", CARD, "vi")
      .trash(P1, JUNK, "j1")
      .build();
    await game.p1.activate("vi");
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    await game.p1.gank("vi", "bf2");
    expect(game.state("vi")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("vi")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(1);
  });

  test("control: the same gank WITHOUT pumping is a 3-vs-3 trade — both die and bf2 is not conquered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "bf1", CARD, "vi")
      .build();
    await game.p1.gank("vi", "bf2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });
});
