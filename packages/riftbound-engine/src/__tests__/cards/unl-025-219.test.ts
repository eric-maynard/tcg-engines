/**
 * Undying Legion — unl-025-219 · Unit · Fury · 3 energy (no power) · 3 might
 *
 *   [Legion][>] You may play me from your trash for [3][fury].
 *   (Get the effect if you've played another card this turn.)
 *
 * Rules: 812 (Legion = "if you have played another card this turn, this card gains [Text]";
 * 812.1.c the other card must have been FINALIZED by YOU this turn), 366.1 (this very card is the
 * rulebook example of a passive that self-describes its zone: it only applies while Undying
 * Legion is IN THE TRASH), 419.4.b (a countered/finalized card still counts as "played"),
 * 355.2.a (a unit is played to base / a battlefield you control and enters exhausted), 124 (a card
 * that goes board → trash is a new object, so its own earlier play counts as "another card").
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. The [3][fury] is an ALTERNATIVE cost that exists only for the trash play. From hand the card
 *     is a plain 3-energy unit with no power pip, Legion or not.
 *  2. Legion needs ANOTHER card finalized by YOU this turn: channeling/tapping runes is not playing
 *     a card; the opponent playing a card does nothing for you; last turn's plays have expired.
 *  3. The permission is a play, not a return: it uses unit timing (your turn, Neutral Open — not
 *     during the opponent's turn, not inside a showdown), pays the alt cost, enters exhausted, and
 *     itself counts as a card played (feeding other Legion cards).
 *  4. Alt cost affordability: 3 energy but no fury → not offered; fury via a second domain does not
 *     substitute (the pip is [fury], not [rainbow]).
 *  5. Full loop: play X, play Undying Legion from hand, it dies in combat, replay it from the trash
 *     the same turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-025-219";
const CHEAP = { cardType: "unit", domain: "fury", energyCost: 1, might: 1, name: "Cheap Recruit" } as const;

/** Undying Legion in P1's trash, a 1-cost unit in hand to turn Legion on, 3 energy + 1 fury spare after it. */
function inTrash(res: { energy?: number; power?: Record<string, number> } = { energy: 4, power: { fury: 1 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P1 })
    .trash(P1, CARD, "ul")
    .hand(P1, CHEAP, "cheap");
}

describe("Undying Legion (unl-025-219)", () => {
  test("registry payload: a 3-cost / 3-might Fury unit with ONE Legion keyword ability that plays THIS card from the trash", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 3, might: 3, name: "Undying Legion" });
    expect(def?.powerCost).toBeUndefined(); // no printed power pip — the [fury] lives only in the alt cost
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { from: "trash", type: "play" }, keyword: "Legion", type: "keyword" });
  });

  test("the printed alternative cost [3][fury] is missing from the parsed Legion ability (silent mis-parse)", async () => {
    // Expected: the ability payload carries the alt cost (3 energy + a fury pip) so the engine can charge it.
    // Actual: `{ effect: { from: "trash", target, type: "play" }, keyword: "Legion" }` — no cost anywhere.
    const def = (await loadDefaultCardPool()).get(CARD);
    const json = JSON.stringify(def?.abilities?.[0] ?? {});
    expect(json).toMatch(/"energy":3/);
    expect(json).toMatch(/fury/);
  });

  test("from hand it is a plain 3-energy unit: no fury needed, no Legion needed; enters base exhausted at 3 might; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ul").build();
    await game.p1.play("ul");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("ul")).toBe("base");
    expect(game.state("ul")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    const poor = await scenario().resources(P1, { energy: 2, power: { fury: 3 } }).hand(P1, CARD, "ul").build();
    expect(poor.p1.can("play", "ul")).toBe(false);
  });

  test("negative space: with NO other card played this turn it just sits in the trash — not playable even with 3 energy + fury", async () => {
    const game = await inTrash().build();
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.p1.can("play", "ul")).toBe(false);
    // Tapping/channeling runes is not "playing a card" (812.1.c) — still off.
    const runes = await inTrash({ energy: 0, power: { fury: 1 } }).runes(P1, "fury", 3).build();
    await runes.p1.tapRunes(3);
    expect(runes.p1.energy()).toBe(3);
    expect(runes.p1.can("play", "ul")).toBe(false);
  });

  test("Legion on — after you play another card this turn, Undying Legion in your trash becomes playable (812.1.b.1, 366.1)", async () => {
    // Expected: once Cheap Recruit is finalized, playUnit(ul) is offered from the trash.
    // Actual: the engine only honours board-wide "play from trash" grants; the card's own Legion permission is never read.
    const game = await inTrash().build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.zoneOf("cheap")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.p1.can("play", "ul")).toBe(true);
  });

  test("playing it from the trash costs exactly [3] + [fury], lands it in base exhausted, and counts as a card played", async () => {
    const game = await inTrash({ energy: 5, power: { fury: 2 } }).build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    // bf1 is P1's, so the play has two legal destinations — the harness needs an explicit one.
    await game.p1.play("ul", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle();
    expect(game.zoneOf("ul")).toBe("base");
    expect(game.state("ul")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.p1.trash()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("the trash play may go to a battlefield you control, like any unit play (355.2.a)", async () => {
    const game = await inTrash().build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    await game.p1.play("ul", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("ul")).toBe("battlefield-bf1");
  });

  test("alt cost is [3][fury]: Legion on but no fury power (or only 2 energy left) → still not playable from the trash", async () => {
    const noFury = await inTrash({ energy: 4, power: { calm: 2 } }).build();
    await noFury.p1.play("cheap", { to: "base" });
    await noFury.settle();
    expect(noFury.p1.can("play", "ul")).toBe(false);
    const shortEnergy = await inTrash({ energy: 3, power: { fury: 1 } }).build();
    await shortEnergy.p1.play("cheap", { to: "base" }); // leaves 2 energy
    await shortEnergy.settle();
    expect(shortEnergy.p1.energy()).toBe(2);
    expect(shortEnergy.p1.can("play", "ul")).toBe(false);
  });

  test("only YOUR plays count and only on YOUR turn: the opponent playing a card on their turn never unlocks your trash copy", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .resources(P2, { energy: 1 })
      .trash(P1, CARD, "ul")
      .hand(P2, CHEAP, "theirs")
      .build();
    await game.p2.play("theirs", { to: "base" });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.p1.can("play", "ul")).toBe(false); // not your turn, and not your card play anyway
    expect(game.p1.legal().some((o) => o.card === "ul")).toBe(false);
  });

  test("'this turn' expires: a card played LAST turn does not keep Legion on — at the start of your next turn the trash copy is locked again", async () => {
    const game = await inTrash({ energy: 1 }).build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1, fresh turn: 2 runes channeled, nothing played yet
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3, power: { fury: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "ul")).toBe(false);
  });

  test("full loop — play X, play Undying Legion from hand, it dies attacking, then replay it from the trash the same turn for [3][fury]", async () => {
    // Expected: after the lost combat ul is in the trash; two cards were played this turn, so it is offered again and
    // the second play charges 3 energy + 1 fury. Actual: never offered from the trash.
    const game = await scenario()
      .resources(P1, { energy: 7, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .hand(P1, CHEAP, "cheap")
      .hand(P1, CARD, "ul")
      .build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    await game.p1.play("ul", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    // Units enter exhausted; ready it via the sandbox so it can attack this turn.
    await game.p1.do("readyCard", { cardId: "ul" });
    await game.p1.move("ul", "bf1");
    await game.settle();
    expect(game.zoneOf("ul")).toBe("trash"); // 3 < 5
    expect(game.p1.can("play", "ul")).toBe(true);
    await game.p1.play("ul", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("ul")).toBe("base");
  });

  test("an ENEMY Undying Legion in the opponent's trash is never playable by you, whatever you have played (only the owner plays it)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .trash(P2, CARD, "theirs")
      .hand(P1, CHEAP, "cheap")
      .build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.p1.can("play", "theirs")).toBe(false);
    expect(game.zoneOf("theirs")).toBe("trash");
  });
});
