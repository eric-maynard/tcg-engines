/**
 * Endless Riches — ven-022-166 · Gear · Fury · 5 energy + [fury]
 *
 *   When you play this, banish your hand and trash, then [Burn 7].
 *   Skip your Draw Phase.
 *   You may play cards from your trash.
 *   If a card would go to your trash from anywhere other than your Main Deck, banish it instead.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Order inside the play trigger: hand AND trash are banished FIRST, THEN Burn 7 (440.1: top of
 *     Main Deck → trash). A burn comes FROM the Main Deck, so clause 4 does NOT replace it — the 7
 *     burned cards are exactly the new "hand" you play from. Anything else headed for your trash
 *     (discards, your dead units, your resolved spells, even this gear if killed) is banished.
 *  2. 440.4 — Burn 7 with fewer than 7 in deck: burn what is there, Burn Out (431: shuffle trash
 *     into deck, an opponent gains 1 point), then burn the rest.
 *  3. "Skip your Draw Phase" removes the whole phase (315.4): no draw and therefore no Burn Out from
 *     an empty deck; Awaken/Beginning/Channel still happen. Only YOUR draw phase — the opponent draws.
 *  4. "You may play cards from your trash" is a zone permission only: costs, timing and targeting
 *     are unchanged; it covers units, gear AND spells; only your own trash; only while you control
 *     this. A spell cast from trash resolves and would go back to trash from the CHAIN → banished.
 *  5. "your trash" is ownership-based (cards go to their OWNER's trash): an enemy unit you kill
 *     still goes to its owner's trash un-replaced.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-022-166";
const FILLER = "ogn-175-298"; // Shipyard Skulker · 3 energy · chaos · vanilla 3-Might unit
const CLEAVE = "ogn-004-298"; // Action spell · 1 energy · fury · give a unit Assault 3 this turn
const ARMORY = "ogn-023-298"; // fury gear · 2 energy
const ENFORCER = "ogn-003-298"; // fury unit · 2 energy · "When you play me, discard 1."

const DECK8 = Array.from({ length: 8 }, () => FILLER);
const NAMES8 = Array.from({ length: 8 }, (_, i) => `d${i + 1}`);

/** P1 about to play Endless Riches: 2 other cards in hand, 1 in trash, 10-card deck (d1..d8 + 2 filler). */
function prePlay() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .hand(P1, CARD, "riches")
    .hand(P1, FILLER, "h1")
    .hand(P1, FILLER, "h2")
    .trash(P1, FILLER, "t1")
    .deck(P1, DECK8, NAMES8);
}

/** Riches already on the board under P1. */
function withRiches() {
  return scenario().gear(P1, CARD, "riches").battlefield("bf1", { controller: P2 });
}

describe("Endless Riches (ven-022-166)", () => {
  test("costs 5 energy + [fury]; resolves to P1's base as gear; 4 energy or no fury power → not playable", async () => {
    const game = await prePlay().build();
    expect(game.p1.can("play", "riches")).toBe(true);
    await game.p1.play("riches");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("riches")).toBe("base");
    expect(game.p1.gear()).toContain("riches");
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
  });

  // BUG — expected: hand (h1,h2) and trash (t1) are banished, then d1..d7 are burned into the trash,
  // leaving d8 + 2 filler in the deck. Actual: the whole trigger is an unparsed `raw` no-op.
  test("'When you play this' — banish hand and trash, THEN Burn 7 (the burned cards stay in trash: they came from the Main Deck) (440.1)", async () => {
    const game = await prePlay().build();
    await game.p1.play("riches");
    await game.settle({ policy: "first" });
    expect([...game.p1.banishment()].sort()).toEqual(["h1", "h2", "t1"]);
    expect(game.p1.hand()).toEqual([]);
    expect([...game.p1.trash()].sort()).toEqual(["d1", "d2", "d3", "d4", "d5", "d6", "d7"]);
    expect(game.p1.deck()).toHaveLength(3);
    expect(game.p1.deck()[0]).toBe("d8");
    expect(game.p2.points()).toBe(0); // no burn out with 10 cards
  });

  // BUG — expected per 440.4 / 431.2: burn 4, Burn Out (shuffle those 4 back, P2 +1 point), burn 3 more.
  test("Burn 7 with only 4 cards in deck burns 4, Burns Out (opponent +1 point), then burns the remaining 3 (440.4)", async () => {
    const game = await scenario()
      .fillDecks({ main: 4, runes: 12 })
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .hand(P1, CARD, "riches")
      .build();
    expect(game.p1.deck()).toHaveLength(4);
    await game.p1.play("riches");
    await game.settle({ policy: "first" });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.trash()).toHaveLength(3);
    expect(game.p1.deck()).toHaveLength(1);
  });

  // BUG — expected: P1's next turn has no Draw Phase (hand stays empty) but still channels 2 runes;
  // P2's draw phase is untouched. Actual: P1 draws as usual.
  test("'Skip your Draw Phase' — no card drawn on your turn (channel still happens); the opponent still draws", async () => {
    const game = await withRiches().active(P1).build();
    const p2Hand = game.p2.hand().length;
    await game.advanceTurn(); // → P2's turn: P2 draws normally
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    const runes = game.p1.runes().length;
    await game.advanceTurn(); // → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(runes + 2);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("'You may play cards from your trash': a unit in your trash is playable for its normal cost and lands in base; without Riches it is not; the opponent gains nothing", async () => {
    const game = await withRiches().resources(P1, { energy: 3 }).resources(P2, { energy: 3 }).trash(P1, FILLER, "sk").trash(P2, FILLER, "theirs").build();
    expect(game.p1.can("play", "sk")).toBe(true);
    expect(game.p1.can("play", "theirs")).toBe(false);
    await game.p1.play("sk");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("sk")).toBe("base");
    expect(game.p1.units("base")).toContain("sk");
    await game.advanceTurn();
    expect(game.p2.can("play", "theirs")).toBe(false); // P2 controls no Riches
    const noRiches = await scenario().resources(P1, { energy: 3 }).trash(P1, FILLER, "sk").build();
    expect(noRiches.p1.can("play", "sk")).toBe(false);
  });

  test("trash plays keep their costs: a 3-cost unit in trash with only 2 energy is not offered", async () => {
    const game = await withRiches().resources(P1, { energy: 2 }).trash(P1, FILLER, "sk").build();
    expect(game.p1.can("play", "sk")).toBe(false);
  });

  // BUG — expected: gear is a "card" too (rule 101), so Unlicensed Armory in the trash is playable.
  // Actual: only playUnit / playSpell consult the play-from-trash grant; playGear does not.
  test("gear in your trash is also playable with Riches on board", async () => {
    const game = await withRiches().resources(P1, { energy: 2 }).trash(P1, ARMORY, "arm").build();
    expect(game.p1.can("play", "arm")).toBe(true);
    await game.p1.play("arm");
    await game.settle();
    expect(game.zoneOf("arm")).toBe("base");
  });

  test("a spell can be cast from your trash (normal cost, normal targeting) and resolves", async () => {
    const game = await withRiches().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").trash(P1, CLEAVE, "cleave").build();
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("cleave")).toBe("chain");
    await game.settle();
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });

  // BUG — expected: the resolved spell heads to trash from the CHAIN (not the Main Deck) → banished
  // instead (clause 4). Actual: it goes back to the trash (and is re-castable forever).
  test("a spell cast from trash is banished after it resolves, not returned to the trash (replacement clause)", async () => {
    const game = await withRiches().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").trash(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("banishment");
  });

  // BUG — expected: P1's unit that dies would go to P1's trash from the board → banished instead;
  // P2's dead unit goes to P2's trash as normal (it is not "your trash"). Actual: both go to trash.
  test("your unit that dies in combat is banished instead of trashed; the enemy casualty still goes to its owner's trash", async () => {
    const game = await withRiches().unit(P1, "base", { might: 2 }, "mine").unit(P2, "bf1", { might: 2 }, "theirs").build();
    await game.p1.move("mine", "bf1");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
  });

  // BUG — expected: a discard moves hand → trash, which clause 4 turns into hand → banishment.
  test("a card you discard from hand is banished instead (Chemtech Enforcer's 'discard 1')", async () => {
    const game = await withRiches().resources(P1, { energy: 2 }).hand(P1, ENFORCER, "ce").hand(P1, FILLER, "fod").build();
    await game.p1.play("ce");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ce")).toBe("base");
    expect(game.zoneOf("fod")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
  });

  // BUG — expected four abilities matching the four printed sentences. Actual: one `raw` trigger.
  test("parsed abilities should be play-self trigger (banish hand+trash → burn 7), skip-draw static, play-from-trash permission, to-trash→banish replacement", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "fury", energyCost: 5, name: "Endless Riches", powerCost: ["fury"] });
    const abilities = (def?.abilities ?? []) as { type?: string; trigger?: { event?: string }; effect?: { type?: string }; replaces?: string }[];
    expect(abilities).toHaveLength(4);
    expect(abilities[0]).toMatchObject({ trigger: { event: "play-self" }, type: "triggered" });
    expect(abilities[0]?.effect?.type).not.toBe("raw");
    expect(JSON.stringify(abilities[0]?.effect)).toMatch(/banish/);
    expect(JSON.stringify(abilities[0]?.effect)).toMatch(/burn/);
    expect(abilities.filter((a) => a.type === "static").length).toBeGreaterThanOrEqual(2);
    expect(abilities.some((a) => a.type === "replacement")).toBe(true);
  });
});
