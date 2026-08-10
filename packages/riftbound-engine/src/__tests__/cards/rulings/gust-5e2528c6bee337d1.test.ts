/**
 * Ruling 5e2528c6bee337d1 — Gust (OGN-169 → ogn-169-298) · Reaction spell · Chaos · [1]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Shakedown (OGN-033 → ogn-033-298) · Reaction spell · Fury · [2][fury] "Choose an enemy unit. Deal 6 to it unless
 *     its controller has you draw 2."
 *   Examples from the ruling: Teemo, Scout (ogn-197-298, "When you play me, give me +3 [Might] this turn"), Darius,
 *   Trifarian (ogn-027-298, "When you play your second card in a turn, give me +2 [Might] this turn and ready me"),
 *   Vi, Destructive (ogn-036-298, "Recycle 1 from your trash: Give me +1 [Might] this turn").
 *
 * Q: Can opponents play Reaction spells in response to triggered/activated abilities of permanents (Teemo's play
 *    trigger, Darius's trigger, Vi's activated ability)?
 * A: Yes. You cannot react to a permanent being played, but its abilities go on the chain as their own items and can
 *    be responded to: Gust Teemo before he gets his Might, Shakedown Darius before +2, Shakedown in response to Vi.
 * Rules: 538 (permanents can't be responded to), triggered/activated abilities are chain items (reaction window).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const SHAKEDOWN = "ogn-033-298";
const TEEMO_SCOUT = "ogn-197-298";
const DARIUS_TRIFARIAN = "ogn-027-298";
const VI_DESTRUCTIVE = "ogn-036-298";

describe("Ruling 5e2528c6bee337d1 — you can't react to a permanent, but you CAN react to its triggered/activated abilities", () => {
  test("Teemo, Scout played to P1's battlefield: no window while the UNIT is pending (he is already on the board when anyone gets priority); his play trigger is a chain item P2 answers with Gust — Teemo (1 Might) goes back to hand before ever getting +3", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, TEEMO_SCOUT, "teemo")
      .resources(P1, { energy: 2 })
      .hand(P2, GUST, "gust")
      .resources(P2, { energy: 1 })
      .build();
    await game.p1.play("teemo", { to: "bf1" });
    // First moment anyone can act: Teemo is ON the battlefield (the permanent itself was never respondable) …
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    // … and what sits on the chain is his TRIGGERED ability, not the unit.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
    expect(game.state("teemo").might).toBe(1); // +3 not applied yet
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "teemo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("hand"); // returned before the +3 could matter
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Darius, Trifarian's 'second card' trigger is on the chain: P2 can Shakedown him in response, BEFORE the +2 Might / ready apply", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DARIUS_TRIFARIAN, "darius", { exhausted: true })
      .hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Pawn" }, "pawn1")
      .hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Pawn" }, "pawn2")
      .hand(P2, SHAKEDOWN, "shakedown")
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .build();
    await game.p1.play("pawn1", { to: "base" });
    await game.settle();
    await game.p1.play("pawn2", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    expect(game.state("darius")).toMatchObject({ isReady: false, might: 5 }); // trigger not resolved yet
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "shakedown")).toBe(true);
    await game.p2.cast("shakedown", { targets: "darius" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["darius", "shakedown"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // Shakedown resolves first (LIFO): Darius's controller (P1) picks "deal 6" → Darius (still 5 Might) dies before his +2.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    const deal6 = d?.kind === "pick" ? d.options.find((o) => /Deal 6/i.test(o.label)) : undefined;
    expect(deal6).toBeDefined();
    await game.p1.pick(deal6!.key);
    expect(game.zoneOf("darius")).toBe("trash");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Vi, Destructive's ACTIVATED ability is likewise a chain item: P2 gets priority and can Shakedown her in response before the +1 resolves", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VI_DESTRUCTIVE, "vi")
      .trash(P1, "ogn-175-298", "fodder")
      .hand(P2, SHAKEDOWN, "shakedown")
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .build();
    await game.p1.activate("vi");
    expect(game.zoneOf("fodder")).toBe("mainDeck"); // cost: recycled 1 from trash
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: false })]);
    expect(game.state("vi").might).toBe(3); // +1 not applied yet
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "shakedown")).toBe(true);
    await game.p2.cast("shakedown", { targets: "vi" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vi", "shakedown"]);
    expect(game.state("vi").might).toBe(3);
  });
});
