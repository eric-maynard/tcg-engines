/**
 * Interaction: "look at the top N … you may reveal a <TYPE> … and draw it" when the deck holds ZERO
 * cards of the type the ability hunts for — plus the deck-size edge of looking at more cards than
 * remain.
 *
 *   Double Trouble (unl-032-219) — spell, "[Repeat] [2]. Look at the top 3 cards of your Main Deck.
 *                                   You may reveal a unit from among them and draw it. Recycle the rest."
 *   Fate Weaver    (unl-064-219) — unit, "When you play me, look at the top 4 … You may reveal a
 *                                   spell with Energy cost [4] or more … and draw it. Recycle the rest."
 *   Ivern, Nurturer(unl-051-219) — unit, "When you play me or when I hold, look at the top 3 … You may
 *                                   reveal a unit … and draw it. Recycle the rest. Then if you revealed
 *                                   a Bird, Cat, Dog, or Poro, do this: [Buff] a friendly unit."
 *
 * Questions: does an empty candidate set open a selection prompt with no options (a hang risk), or
 * skip straight to the recycle? Does Ivern's "if you revealed a …" rider evaluate to false cleanly
 * against an empty revealed-set instead of dereferencing a null card? And does [Repeat]ing Double
 * Trouble with fewer cards in the deck than it looks at cause a Burn Out?
 *
 * Rules: 359.3.e.11 (follow as much as possible, ignore the rest), 358.3.a (impossible instructions
 * are skipped on resolution), 416 (Recycle → bottom of the Main Deck), 431.1.c / 431.1.c.1 (looking
 * at more cards than the deck holds looks at as many as possible and does NOT Burn Out; dependent
 * sub-instructions that lack cards are ignored).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DOUBLE_TROUBLE = "unl-032-219";
const FATE_WEAVER = "unl-064-219";
const IVERN = "unl-051-219";

const CHEAP_SPELL = "ogn-004-298"; // Cleave — spell, Energy cost 1
const BIG_SPELL = "ogn-014-298"; // Sky Splitter — spell, Energy cost 8
const PLAIN_UNIT = "ogn-003-298"; // Chemtech Enforcer — unit, no Bird/Cat/Dog/Poro tag
const PORO = "ogn-052-298"; // Stalwart Poro — unit, tag Poro

function spellDeck(defs: readonly string[], aliases: readonly string[]) {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 9, power: { calm: 5, mind: 5, rainbow: 5 } })
    .deck(P1, [...defs], [...aliases])
    .fillDecks(false);
}

describe("Look-and-reveal with no card of the hunted type (Double Trouble / Fate Weaver / Ivern)", () => {
  // ------------------------------------------------------------ Double Trouble
  test("no unit among the top 3: NO prompt is opened at all, and 'Recycle the rest' still puts every looked-at card on the bottom (359.3.e.11 / 416)", async () => {
    const game = await spellDeck(
      [CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL],
      ["d1", "d2", "d3", "d4", "d5"],
    )
      .hand(P1, DOUBLE_TROUBLE, "dt")
      .build();
    await game.p1.cast("dt");
    const settled = await game.settle();
    expect(settled.reason).toBe("open"); // never "unanswered": no empty-choice modal
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.hand()).toEqual([]); // spent Double Trouble, drew nothing
    expect(game.p1.deck()).toEqual(["d4", "d5", "d3", "d2", "d1"]); // d1–d3 recycled to the bottom
    expect(game.zoneOf("dt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("affirmative contrast: seed ONE unit and the prompt appears with exactly that option (declinable), the draw happens, the remainder recycles", async () => {
    const game = await spellDeck([CHEAP_SPELL, PLAIN_UNIT, CHEAP_SPELL, CHEAP_SPELL], ["d1", "unit1", "d3", "d4"])
      .hand(P1, DOUBLE_TROUBLE, "dt")
      .build();
    await game.p1.cast("dt");
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P1);
    expect(d?.options?.map((o) => o.key)).toEqual(["unit1"]);
    expect(d?.allowDecline).toBe(true); // "you may"
    expect(d?.min).toBe(0);
    await game.p1.pick("unit1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["unit1"]);
    expect(game.p1.deck()).toEqual(["d4", "d3", "d1"]); // the two unpicked ones went to the bottom
  });

  test("431.1.c — [Repeat] [2] looking at 3 with only 1 card left looks at that 1 and does NOT Burn Out; the dependent draw is simply ignored (431.1.c.1)", async () => {
    const game = await spellDeck([CHEAP_SPELL], ["only"]).hand(P1, DOUBLE_TROUBLE, "dt").build();
    await game.p1.cast("dt", { repeat: 1 });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.isOver()).toBe(false); // no Burn Out, so no burn-out win for the opponent
    expect(game.winner()).toBeUndefined();
    expect(game.p1.deck()).toEqual(["only"]); // looked at and recycled, twice
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ------------------------------------------------------------ Fate Weaver
  test("Fate Weaver with no spell costing [4] or more: resolves with no prompt, no draw, and all four recycled", async () => {
    const game = await spellDeck(
      [CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL],
      ["e1", "e2", "e3", "e4", "e5"],
    )
      .hand(P1, FATE_WEAVER, "fw")
      .build();
    await game.p1.play("fw");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toEqual(["e5", "e4", "e3", "e2", "e1"]);
    expect(game.locationOf("fw")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("Fate Weaver affirmative contrast: one Energy-8 spell in the four is offered, alone, and is drawn", async () => {
    const game = await spellDeck(
      [CHEAP_SPELL, BIG_SPELL, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL],
      ["e1", "big", "e3", "e4", "e5"],
    )
      .hand(P1, FATE_WEAVER, "fw")
      .build();
    await game.p1.play("fw");
    await game.settle();
    expect(game.decision()?.options?.map((o) => o.key)).toEqual(["big"]);
    await game.p1.pick("big");
    await game.settle();
    expect(game.p1.hand()).toEqual(["big"]);
    expect(game.p1.deck()).toEqual(["e5", "e4", "e3", "e1"]);
  });

  // ------------------------------------------------------------ Ivern
  test("Ivern: a unit IS revealed but carries none of the tags — the rider is FALSE and no [Buff] happens", async () => {
    const game = await spellDeck([PLAIN_UNIT, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL], ["u1", "c2", "c3", "c4"])
      .hand(P1, IVERN, "ivern")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    await game.p1.play("ivern");
    await game.settle();
    await game.p1.pick("u1");
    const settled = await game.settle();
    expect(settled.reason).toBe("open"); // no buff-target prompt follows
    expect(game.p1.hand()).toEqual(["u1"]);
    expect(game.state("buddy").isBuffed).toBe(false);
    expect(game.state("ivern").isBuffed).toBe(false);
    expect(game.p1.deck()).toEqual(["c4", "c3", "c2"]);
  });

  test("Ivern: NO unit revealed at all — the rider is evaluated against an EMPTY revealed-set, returns false, and nothing throws", async () => {
    const game = await spellDeck([CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL], ["c1", "c2", "c3", "c4"])
      .hand(P1, IVERN, "ivern")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    await game.p1.play("ivern");
    const settled = await game.settle();
    expect(settled.reason).toBe("open"); // neither a reveal prompt nor a buff prompt
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("buddy").isBuffed).toBe(false);
    expect(game.p1.deck()).toEqual(["c4", "c3", "c2", "c1"]);
    expect(game.locationOf("ivern")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("Ivern affirmative contrast: a Poro is revealed, drawn, and the rider fires — [Buff] a friendly unit", async () => {
    const game = await spellDeck([PORO, CHEAP_SPELL, CHEAP_SPELL, CHEAP_SPELL], ["poro", "c2", "c3", "c4"])
      .hand(P1, IVERN, "ivern")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    await game.p1.play("ivern");
    await game.settle();
    expect(game.decision()?.options?.map((o) => o.key)).toEqual(["poro"]);
    await game.p1.pick("poro");
    await game.settle();
    const buffTarget = game.decision();
    expect(buffTarget?.kind).toBe("pick");
    expect(buffTarget?.options?.map((o) => o.key).sort()).toEqual(["buddy", "ivern"]);
    await game.p1.pick("buddy");
    await game.settle();
    expect(game.p1.hand()).toEqual(["poro"]);
    expect(game.state("buddy").isBuffed).toBe(true);
    expect(game.state("buddy").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
