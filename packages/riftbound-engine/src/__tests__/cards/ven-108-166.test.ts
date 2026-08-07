/**
 * Forgotten Relic — ven-108-166 · Gear · Chaos · 5 energy (no power)
 *
 *   When you play this or at the start of your Beginning Phase, [Burn 1]. When you burn a unit this
 *   way, do this: Give a friendly unit +[Might] equal to the burned card's Might this turn.
 *   (To Burn 1, put the top card of your Main Deck into your trash.)
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. Two independent trigger conditions (383.2.a): the play effect (383.4.a) AND "at the start of
 *     YOUR Beginning Phase" (315.1) — never the opponent's. On your turn the burn happens BEFORE the Draw
 *     Phase, so the card you then draw is the one that was second from the top.
 *  2. rule 440.1 — Burn moves cards Main Deck → trash. It always burns the RELIC CONTROLLER's deck (never
 *     the opponent's) and exactly one card.
 *  3. "When you burn a UNIT this way, do this:" is a reflexive follow-up (440.1.a) keyed on the TYPE of the
 *     burned card: a spell/gear burned → nothing; a unit burned → +Might equal to that card's PRINTED Might
 *     (it is in the trash — no modifiers apply) to ONE friendly unit on the board, this turn only (317.2.c).
 *  4. "this way" — only the Relic's own burn counts. A unit burned by some other effect (Kennen's [Burn 2])
 *     while the Relic sits on the board gives nothing.
 *  5. rule 440.4 / 431 — burning with an EMPTY Main Deck is a Burn Out: trash is recycled into the deck,
 *     an opponent gains 1 point, then the burn completes against the refilled deck.
 *  6. It is a triggered chain item (383.3): nothing is burned until both players pass.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-108-166";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit
const VENGEANCE = "ogn-229-298"; // a SPELL to sit on top of the deck (4 + [order][order]: Kill a unit.)
const KENNEN = "ven-113-166"; // Chaos unit, 3 + [chaos]: When you play me, [Burn 2].
const BIG_UNIT = { cardType: "unit", domain: "chaos", energyCost: 6, might: 6, name: "Six-Might Bruiser", rulesText: "" } as const;

/** P1 has the Relic in hand (5 energy), a 2-Might ally in base and a known deck (top first). */
function withDeck(top: readonly (string | typeof BIG_UNIT)[], aliases: readonly string[]) {
  return scenario()
    .resources(P1, { energy: 5 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
    .deck(P1, top, aliases)
    .deck(P2, [SKULKER, SKULKER], ["p2top", "p2second"])
    .hand(P1, CARD, "relic");
}

async function playRelicAndResolve(game: Game): Promise<void> {
  await game.p1.play("relic");
  await game.settle();
  // If the (currently missing) "+Might to a friendly unit" follow-up asks for a recipient, name the ally.
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("ally");
    await game.settle();
  } else if (d?.kind === "yes-no" && d.seat === P1) {
    await game.p1.yes();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
  }
}

describe("Forgotten Relic (ven-108-166)", () => {
  test("registry payload: a play-self-OR-beginning-phase trigger whose effect burns exactly 1 of YOUR cards", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "chaos", energyCost: 5, name: "Forgotten Relic" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    const trig = abilities.find((a) => a.type === "triggered") as { trigger?: { event?: string }; effect?: unknown } | undefined;
    expect(trig?.trigger?.event?.split("-or-").sort()).toEqual(["beginning-phase", "play-self"]);
    const json = JSON.stringify(trig?.effect);
    expect(json).toContain('"mill"');
    expect(json).toContain('"amount":1');
    expect(json).not.toContain('"opponent"');
  });

  test("registry payload should also encode the 'when you burn a UNIT this way → +Might equal to its Might to a friendly unit this turn' follow-up (440.1.a)", async () => {
    // Expected: somewhere in the abilities a unit-typed follow-up granting modify-might (turn) sized by the burned card's Might.
    // Actual: abilities = [ { trigger, effect: { type: "mill", amount: 1 } } ] — the second sentence is dropped entirely.
    const def = (await loadDefaultCardPool()).get(CARD);
    const json = JSON.stringify(def?.abilities ?? []);
    expect(json).toContain("modify-might");
    expect(json).toMatch(/"duration":"turn"/);
    expect(json).toMatch(/unit/);
  });

  test("cost: 5 energy, no power — lands in base as gear; 4 energy (even with chaos power) is not enough", async () => {
    const game = await withDeck([SKULKER, SKULKER], ["top", "second"]).build();
    await game.p1.play("relic");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("relic")).toBe("base");
    expect(game.p1.gear()).toContain("relic");
    const poor = await scenario().resources(P1, { energy: 4, power: { chaos: 3 } }).hand(P1, CARD, "relic").build();
    expect(poor.p1.can("play", "relic")).toBe(false);
  });

  test("When you play this: a TRIGGERED item goes on the chain and nothing is burned until it resolves; then exactly YOUR top card goes to YOUR trash", async () => {
    const game = await withDeck([VENGEANCE, SKULKER, SKULKER], ["top", "second", "third"]).build();
    await game.p1.play("relic");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "relic", controller: P1, triggered: true })]);
    expect(game.zoneOf("top")).toBe("mainDeck");
    await game.settle();
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.p1.trash()).toEqual(["top"]);
    expect(game.p1.deck().slice(0, 2)).toEqual(["second", "third"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.deck()[0]).toBe("p2top");
    expect(game.decision()?.kind).toBe("action");
    expect(game.violations()).toEqual([]);
  });

  test("At the start of YOUR Beginning Phase: burns your top card before the draw — top → trash, the second card is the one drawn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, CARD, "relic")
      .unit(P1, "base", { might: 2 }, "ally")
      .deck(P1, [VENGEANCE, SKULKER, SKULKER], ["top", "second", "third"])
      .deck(P2, [SKULKER, SKULKER], ["p2top", "p2second"])
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "relic", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.zoneOf("second")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p2.trash()).toEqual([]);
  });

  test("only YOUR Beginning Phase: across the opponent's turn start nothing of yours (or theirs) is burned", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .gear(P1, CARD, "relic")
      .deck(P1, [VENGEANCE, SKULKER], ["top", "second"])
      .deck(P2, [SKULKER, SKULKER, SKULKER], ["p2top", "p2second", "p2third"])
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.p2.trash()).toEqual([]); // P2 drew p2top; nothing was burned
    expect(game.zoneOf("p2top")).toBe("hand");
    expect(game.p2.deck()[0]).toBe("p2second");
  });

  test("burning a SPELL this way gives no Might to anyone (the follow-up is unit-only)", async () => {
    const game = await withDeck([VENGEANCE, SKULKER], ["top", "second"]).build();
    await playRelicAndResolve(game);
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.state("ally").might).toBe(2);
    expect(game.state("theirs").might).toBe(2);
    expect(game.decision()?.kind).toBe("action");
  });

  test("burning a UNIT this way gives a friendly unit +Might equal to the burned card's printed Might (6) this turn, and only this turn", async () => {
    // Expected: Six-Might Bruiser is burned → Ally (2) becomes 8 until end of turn; the enemy unit is never a recipient.
    // Actual: only the burn happens; the "when you burn a unit this way" follow-up is not implemented.
    const game = await withDeck([BIG_UNIT, SKULKER], ["bruiser", "second"]).build();
    await playRelicAndResolve(game);
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.state("theirs").might).toBe(2);
    expect(game.state("ally")).toMatchObject({ baseMight: 2, might: 8 });
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("the Beginning-Phase burn of a unit (Shipyard Skulker, 3 Might) also feeds the follow-up: Ally is 5 during that turn", async () => {
    // Expected: P1's turn starts → burn Skulker (3) → Ally 2 → 5 for P1's turn. Actual: burn only.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, CARD, "relic")
      .unit(P1, "base", { might: 2 }, "ally")
      .deck(P1, [SKULKER, VENGEANCE], ["top", "second"])
      .script(P1, ["ally"])
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("top")).toBe("trash");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").might).toBe(5);
  });

  test("'this way' — a unit burned by ANOTHER effect (Kennen's [Burn 2]) while the Relic is on the board gives nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .gear(P1, CARD, "relic")
      .unit(P1, "base", { might: 2 }, "ally")
      .deck(P1, [BIG_UNIT, SKULKER, VENGEANCE], ["bruiser", "skulker", "third"])
      .hand(P1, KENNEN, "kennen")
      .build();
    await game.p1.play("kennen", { to: "base" });
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("ally").might).toBe(2);
    expect(game.state("kennen").might).toBe(4);
  });

  test("burned unit but NO friendly unit on the board: the burn still happens and nothing else is asked", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P2, "base", { might: 2 }, "theirs")
      .deck(P1, [BIG_UNIT, SKULKER], ["bruiser", "second"])
      .hand(P1, CARD, "relic")
      .build();
    await game.p1.play("relic");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.state("theirs").might).toBe(2); // an enemy unit is never "friendly"
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
  });

  test("Burn with an EMPTY Main Deck → Burn Out (431.2 / 440.4): trash recycled into the deck, the opponent gains 1 point, then 1 card is burned", async () => {
    const game = await scenario()
      .fillDecks({ main: 0, runes: 12 })
      .resources(P1, { energy: 5 })
      .trash(P1, SKULKER, "t1")
      .trash(P1, SKULKER, "t2")
      .trash(P1, SKULKER, "t3")
      .hand(P1, CARD, "relic")
      .build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.points()).toBe(0);
    await game.p1.play("relic");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    // 3 recycled in, 1 burned back out.
    expect(game.p1.deck()).toHaveLength(2);
    expect(game.p1.trash()).toHaveLength(1);
    expect(game.isOver()).toBe(false);
  });

  test("the opponent may respond to the play trigger; killing the ally in response does not stop the burn", async () => {
    const game = await withDeck([VENGEANCE, SKULKER], ["top", "second"])
      .resources(P2, { energy: 4, power: { order: 2 } })
      .hand(P2, { abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }], cardType: "spell", domain: "order", energyCost: 0, name: "Test Snuff", timing: "reaction" }, "snuff")
      .build();
    await game.p1.play("relic");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("snuff", { targets: "ally" });
    expect(game.chain()).toHaveLength(2);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.p1.deck()[0]).toBe("second");
  });
});
