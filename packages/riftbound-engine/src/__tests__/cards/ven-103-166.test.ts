/**
 * Shadows of the Past — ven-103-166 · Spell · Chaos · 3 energy + [chaos]
 *
 *   Return up to 2 units from trashes to their owners' hands.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "trashES" (plural): the pool is EVERY player's trash — two of mine, two of theirs, or one of each.
 *  2. "their OWNERS' hands": an opponent's unit goes back to the OPPONENT's hand even though I cast the
 *     spell; nothing ever lands in the caster's hand unless the caster owns it.
 *  3. "up to 2": zero, one or two — castable with both trashes empty (355: an "up to" choice may be empty),
 *     capped at two even with three candidates.
 *  4. "units" only: spells and gear lying in a trash are not eligible (355.9.a — the target is "a unit card
 *     in a trash").
 *  5. Cost/timing: 3 energy + a chaos pip; standard speed (own turn, Neutral Open only).
 *  6. Natural partner — Diana, No Longer Human (ven-183, Chaos): "When you play a spell, give me +2" fires
 *     when Shadows resolves regardless of how many units it returned (359.3.e.10) — and Shadows can also
 *     fetch a dead Diana back to hand.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-103-166";
const DIANA = "ven-183-166"; // Chaos champion unit · When you play a spell, give me +2 Might this turn
const SKULKER = "ogn-175-298"; // Shipyard Skulker · vanilla 3-Might unit
const CLEAVE = "ogn-004-298"; // a spell (not a unit)
const HAVEN = "ogn-143-298"; // Pirate's Haven · gear (not a unit)

/** P1 (3 energy + chaos) holds Shadows; P1's trash: 2 units + a spell; P2's trash: 2 units + a gear. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .hand(P1, CARD, "shadows")
    .trash(P1, SKULKER, "mineA")
    .trash(P1, { might: 1, name: "Fallen Squire" }, "mineB")
    .trash(P1, CLEAVE, "mySpell")
    .trash(P2, SKULKER, "theirsA")
    .trash(P2, { might: 6, name: "Fallen Giant" }, "theirsB")
    .trash(P2, HAVEN, "theirGear");
}

const targetsOf = (game: Game) => game.p1.option("cast", "shadows")?.fields.find((f) => f.arg === "targets");

describe("Shadows of the Past (ven-103-166)", () => {
  test("costs 3 energy + [chaos]: deducted on cast, one chain item, spell ends in P1's trash; 2 energy or no chaos pip → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: [] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shadows", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("shadows")).toBe("trash");
    expect((await board().resources(P1, { energy: 2, power: { chaos: 1 } }).build()).p1.can("cast", "shadows")).toBe(false);
    expect((await board().resources(P1, { energy: 3, power: { chaos: 0 } }).build()).p1.can("cast", "shadows")).toBe(false);
  });

  test("timing: standard speed — not on the opponent's turn; 'up to 2' — castable even with both trashes EMPTY (zero is a legal count)", async () => {
    expect((await board().active(P2).build()).p1.can("cast", "shadows")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "shadows").build();
    expect(empty.p1.can("cast", "shadows")).toBe(true);
    await empty.p1.cast("shadows");
    await empty.settle();
    expect(empty.zoneOf("shadows")).toBe("trash");
    expect(empty.p1.hand()).toEqual([]);
  });

  // BUG — expected: the choice ranges over UNIT cards in BOTH trashes (mineA, mineB, theirsA, theirsB) — the
  // spell (mySpell) and the gear (theirGear) are never offered — with at most two picks. Actual: the card
  // reached the engine with no abilities, so no targets field exists at all.
  test("eligible picks are exactly the four unit cards across both trashes (no spell, no gear), max 2", async () => {
    const game = await board().build();
    const field = targetsOf(game);
    expect(field).toBeDefined();
    expect(field?.max).toBe(2);
    const flat = new Set((field?.options ?? []).flat() as string[]);
    expect(flat).toEqual(new Set(["mineA", "mineB", "theirsA", "theirsB"]));
    expect((await game.p1.try((p) => p.cast("shadows", { targets: ["mySpell"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("shadows", { targets: ["theirGear"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("shadows", { targets: ["mineA", "mineB", "theirsA"] }))).ok).toBe(false);
  });

  // BUG — expected: two of my own dead units come back to MY hand; my trash keeps only the spell (+ Shadows itself).
  test("returns two units from my trash to my hand", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: ["mineA", "mineB"] });
    await game.settle();
    expect([...game.p1.hand()].sort()).toEqual(["mineA", "mineB"]);
    expect([...game.p1.trash()].sort()).toEqual(["mySpell", "shadows"]);
    expect(game.p2.hand()).toEqual([]);
  });

  // BUG — expected: "trashes … their owners' hands" — one from each trash: mine to my hand, THEIRS TO THEIR hand
  // (never to the caster's hand).
  test("one from each trash — mineA → P1's hand, theirsB → P2's hand (owner, not caster)", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: ["mineA", "theirsB"] });
    await game.settle();
    expect(game.p1.hand()).toEqual(["mineA"]);
    expect(game.p2.hand()).toEqual(["theirsB"]);
    expect(game.state("theirsB").owner).toBe(P2);
    expect(game.p2.trash()).not.toContain("theirsB");
    expect([...game.p2.trash()].sort()).toEqual(["theirGear", "theirsA"]);
  });

  // BUG — expected: "up to 2" includes exactly one.
  test("'up to' — a single pick is legal: only theirsA moves (to P2's hand), everything else stays", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: ["theirsA"] });
    await game.settle();
    expect(game.p2.hand()).toEqual(["theirsA"]);
    expect(game.p1.hand()).toEqual([]);
    expect([...game.p1.trash()].sort()).toEqual(["mineA", "mineB", "mySpell", "shadows"]);
  });

  test("partner (359.3.e.10): with Diana, No Longer Human on my board, casting Shadows — even returning nothing — is 'playing a spell' → Diana +2 this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P1, "base", DIANA, "diana")
      .hand(P1, CARD, "shadows")
      .build();
    expect(game.state("diana").might).toBe(3);
    await game.p1.cast("shadows");
    await game.settle();
    expect(game.zoneOf("shadows")).toBe("trash");
    expect(game.state("diana").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("diana").might).toBe(3);
  });

  // BUG — expected: a dead champion unit is still "a unit in a trash" — Shadows fetches Diana back to her owner's hand.
  test("a champion unit in the trash (Diana) is a legal pick and returns to hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .trash(P1, DIANA, "deadDiana")
      .hand(P1, CARD, "shadows")
      .build();
    await game.p1.cast("shadows", { targets: ["deadDiana"] });
    await game.settle();
    expect(game.zoneOf("deadDiana")).toBe("hand");
    expect(game.p1.hand()).toEqual(["deadDiana"]);
  });

  // BUG (parse) — expected: one `spell` ability returning up to two unit cards from ANY trash to their owners'
  // hands (a return-to-hand effect over `{type:"unit", location:"trash"}` with an up-to-2 quantity). Actual:
  // `abilities` is absent — the parser produced nothing for this sentence.
  test("registry payload — spell effect 'return-to-hand', unit targets in trash (any owner), up to 2", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 3, name: "Shadows of the Past", powerCost: ["chaos"], timing: "standard" });
    const abilities = (def?.abilities ?? []) as { type?: string; effect?: { type?: string; target?: Record<string, unknown> } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.type).toBe("spell");
    expect(abilities[0]?.effect?.type).toBe("return-to-hand");
    expect(abilities[0]?.effect?.target).toMatchObject({ location: "trash", type: "unit" });
    expect(abilities[0]?.effect?.target?.controller).not.toBe("friendly"); // "trashes" — not just yours
    expect(JSON.stringify(abilities[0]?.effect)).toContain("2");
  });
});
