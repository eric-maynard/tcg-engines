/**
 * Forecaster — sfd-065-221 · Unit · Mind · 2 energy · 2 might
 *
 *   Your Mechs have [Vision]. (When you play us, look at the top card of your Main Deck.
 *   You may recycle it.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *  1. Vision is a PLAY trigger (817.1.b "When this is played, predict"): the grant must already be
 *     live as the Mech enters the board, or nothing happens. A Mech already on the board when
 *     Forecaster arrives shows the keyword but gets no retroactive look.
 *  2. "Your" Mechs only — an opponent's Mech gets nothing, and the opponent is never prompted.
 *  3. Non-Mech friendly units (including a vanilla unit) get no Vision.
 *  4. Mech TOKENS are played too ("Play a 3 [Might] Mech unit token") → they must predict as well.
 *  5. The static ends the moment Forecaster leaves the board: a Mech played afterwards gets no look.
 *  6. Predict = look at the top card, may recycle it (436.1): accept → bottom of deck; decline →
 *     it stays on top; nothing is drawn either way; empty deck → no prompt, no burn out (436.4.a).
 *  7. Reminder text says "when you play US" — by templating convention Forecaster is itself a Mech
 *     and should predict on its own play (the card data carries no Mech tag → BUG test).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-065-221";
const BUBBLE_BOT = "sfd-062-221"; // real 3-cost Mind Mech: "When you play me, ready another friendly Mech."
const ASSEMBLY_RIG = "sfd-019-221"; // gear: [1][fury], Recycle a unit from your trash, [Exhaust]: Play a 3 [Might] Mech unit token
const FILLER = "ogn-175-298";
const MECH = { cardType: "unit", domain: "mind", energyCost: 1, might: 3, name: "Test Mech", tags: ["Mech"] };
const NOT_MECH = { cardType: "unit", domain: "mind", energyCost: 1, might: 3, name: "Test Yordle", tags: ["Yordle"] };

function withForecaster() {
  return scenario()
    .resources(P1, { energy: 3 })
    .unit(P1, "base", CARD, "fc")
    .hand(P1, MECH, "mech")
    .deck(P1, [FILLER, FILLER], ["top", "second"]);
}

describe("Forecaster (sfd-065-221)", () => {
  test("parsed abilities: one static granting the Vision keyword to friendly units tagged Mech", async () => {
    const abilities = (await import("../../../../riftbound-cards/src/data/all-cards")).getAllCards().find((c) => c.id === CARD)?.abilities as unknown as Record<string, unknown>[];
    expect(abilities).toEqual([
      { effect: { keyword: "Vision", target: { controller: "friendly", filter: { tag: "Mech" }, type: "unit" }, type: "grant-keyword" }, type: "static" },
    ]);
  });

  test("cost: 2 energy, no power, 2 Might, enters exhausted; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "fc").build();
    await game.p1.play("fc", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    if (game.decision()?.kind === "pick") await game.p1.decline(); // tolerate a self-Vision prompt (see BUG test)
    expect(game.zoneOf("fc")).toBe("base");
    expect(game.state("fc")).toMatchObject({ isExhausted: true, might: 2 });
    expect((await scenario().resources(P1, { energy: 1, power: { mind: 1 } }).hand(P1, CARD, "fc").build()).p1.can("play", "fc")).toBe(false);
  });

  test("static is continuous: a friendly Mech on the board shows Vision; an enemy Mech and a friendly non-Mech do not", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "fc")
      .unit(P1, "base", MECH, "mine")
      .unit(P1, "base", NOT_MECH, "yordle")
      .unit(P2, "base", MECH, "theirs")
      .build();
    expect(game.state("mine").keywords).toContain("Vision");
    expect(game.state("yordle").keywords).not.toContain("Vision");
    expect(game.state("theirs").keywords).not.toContain("Vision");
    expect(game.state("fc").might).toBe(2);
    expect(game.state("mine").might).toBe(3); // a keyword grant, not a Might change
  });

  test("playing a Mech with Forecaster out: its Vision trigger goes on the chain, then P1 looks at the top card and may recycle it (→ bottom)", async () => {
    const game = await withForecaster().build();
    await game.p1.play("mech", { to: "base" });
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mech", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1, source: { cardId: "mech" } });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["top"]);
    await game.p1.pick("top");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).toBe("second");
    expect(deck[deck.length - 1]).toBe("top");
    expect(game.p1.hand()).toEqual([]); // predict never draws
    expect(game.state("mech").keywords).toContain("Vision");
    expect(game.decision()?.kind).toBe("action"); // exactly one look
  });

  test("declining the recycle leaves the looked-at card on top and draws nothing", async () => {
    const game = await withForecaster().build();
    await game.p1.play("mech", { to: "base" });
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck().slice(0, 2)).toEqual(["top", "second"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
  });

  test("negative: without Forecaster the same Mech has no Vision — no trigger, no prompt", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, MECH, "mech").deck(P1, [FILLER], ["top"]).build();
    await game.p1.play("mech", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("mech").keywords).not.toContain("Vision");
    expect(game.p1.deck()[0]).toBe("top");
  });

  test("negative: a friendly NON-Mech unit played with Forecaster out gets no look", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "fc").hand(P1, NOT_MECH, "yordle").deck(P1, [FILLER], ["top"]).build();
    await game.p1.play("yordle", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.deck()[0]).toBe("top");
  });

  test("'YOUR Mechs': the opponent playing a Mech while you control Forecaster prompts nobody and touches neither deck", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "fc")
      .hand(P2, MECH, "theirs")
      .deck(P1, [FILLER], ["myTop"])
      .deck(P2, [FILLER], ["theirTop"])
      .build();
    await game.p2.play("theirs", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
    expect(game.state("theirs").keywords).not.toContain("Vision");
    expect(game.p1.deck()[0]).toBe("myTop");
    expect(game.p2.deck()[0]).toBe("theirTop");
  });

  test("a real Mech (Bubble Bot): both its own play trigger and the granted Vision trigger hit the chain; the look is offered once", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "fc").hand(P1, BUBBLE_BOT, "bb").deck(P1, [FILLER, FILLER], ["top", "second"]).build();
    await game.p1.play("bb", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((i) => i.cardId === "bb" && i.triggered)).toBe(true);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "bb" } });
    await game.p1.pick("top");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.deck()[0]).toBe("second");
  });

  test("Forecaster gone → grant gone: after it dies, a Mech played later has no Vision and gets no look", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "fc")
      .unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .hand(P1, MECH, "mech")
      .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("fc")).toBe("trash");
    await game.advanceTurn(); // → P1 (draws d1; pool emptied at end of turn, 2 runes channeled)
    expect(game.state("mech").keywords).not.toContain("Vision");
    await game.p1.tapRune();
    await game.p1.play("mech", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("mech").keywords).not.toContain("Vision");
    expect(game.p1.deck()[0]).toBe("d2");
  });

  test("no retroactive look: a Mech already on the board when Forecaster is played gains the keyword but predicts nothing", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", MECH, "old").hand(P1, CARD, "fc").deck(P1, [FILLER], ["top"]).build();
    expect(game.state("old").keywords).not.toContain("Vision");
    await game.p1.play("fc", { to: "base" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      // Only acceptable prompt here would be Forecaster's own (see BUG test) — never one sourced from "old".
      expect(game.decision()).not.toMatchObject({ source: { cardId: "old" } });
      await game.p1.decline();
      await game.settle();
    }
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("old").keywords).toContain("Vision");
    expect(game.p1.deck()[0]).toBe("top");
  });

  test("empty Main Deck: the Mech's Vision has nothing to look at — no prompt and no Burn Out (436.4.a)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .runeDeck(P1, ["ogn-089-298", "ogn-089-298"])
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "fc")
      .hand(P1, MECH, "mech")
      .build();
    expect(game.p1.deck()).toHaveLength(0);
    await game.p1.play("mech", { to: "base" });
    await game.settle();
    if (game.decision()?.kind === "pick") await game.p1.decline();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("mech")).toBe("base");
  });

  test("a Mech TOKEN is played too — Assembly Rig's 3-Might Mech token should predict on entering (817.1.b, 'Play a … Mech unit token')", async () => {
    // Expected: after the Rig's ability resolves and the Mech token is played to base, P1 is asked to
    // look at / recycle the top card. Actual: the token shows the Vision keyword but no trigger fires.
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", CARD, "fc")
      .gear(P1, ASSEMBLY_RIG, "rig")
      .trash(P1, FILLER, "corpse")
      .deck(P1, [FILLER, FILLER], ["top", "second"])
      .build();
    await game.p1.activate("rig");
    await game.settle();
    const token = game.p1.units("base").find((id) => game.state(id).isToken);
    expect(token).toBeDefined();
    expect(game.state(token!).keywords).toContain("Vision");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("top");
    await game.settle();
    expect(game.p1.deck()[0]).toBe("second");
  });

  test("'when you play US' — Forecaster is templated as a Mech itself and should predict on its own play (card data lacks the Mech tag)", async () => {
    // Expected: playing Forecaster puts its own Vision trigger on the chain and offers the top card.
    // Actual: no Mech tag on sfd-065-221 → no self-grant, no trigger.
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "fc").deck(P1, [FILLER, FILLER], ["top", "second"]).build();
    await game.p1.play("fc", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fc", triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "fc" } });
    expect(game.state("fc").keywords).toContain("Vision");
  });
});
