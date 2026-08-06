/**
 * Sabotage — ogn-156-298 · Spell (Action) · Body · 1 energy + [body]
 *
 *   Choose an opponent. They reveal their hand. Choose a non-unit card from it, and
 *   recycle that card.
 *
 * Recycle (rule 409): put the card on the bottom of its owner's Main Deck.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SABOTAGE = "ogn-156-298";
const UNIT = "ogn-175-298"; // Shipyard Skulker (unit)
const SPELL = "ogn-004-298"; // Cleave (spell)
const GEAR = "ogn-143-298"; // Pirate's Haven (gear)

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .hand(P1, SABOTAGE, "sab")
    .hand(P2, UNIT, "theirUnit")
    .hand(P2, SPELL, "theirSpell")
    .hand(P2, GEAR, "theirGear");
}

describe("Sabotage (ogn-156-298)", () => {
  test("costs 1 energy + 1 body power; goes to trash after resolving", async () => {
    const game = await board().build();
    await game.p1.cast("sab");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("theirSpell");
      await game.settle();
    }
    expect(game.zoneOf("sab")).toBe("trash");
  });

  test("not affordable without the body power or with 0 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 1 }).hand(P1, SABOTAGE, "sab").hand(P2, SPELL).build();
    expect(noPower.p1.can("cast", "sab")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 0, power: { body: 1 } }).hand(P1, SABOTAGE, "sab").hand(P2, SPELL).build();
    expect(noEnergy.p1.can("cast", "sab")).toBe(false);
  });

  test("on resolution the caster chooses among the opponent's NON-UNIT cards only", async () => {
    const game = await board().build();
    await game.p1.cast("sab");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(new Set(offered)).toEqual(new Set(["theirSpell", "theirGear"]));
  });

  test("the chosen card is recycled to the bottom of the opponent's main deck; the rest stay in hand", async () => {
    const game = await board().build();
    await game.p1.cast("sab");
    await game.settle();
    await game.p1.pick("theirGear");
    await game.settle();
    expect(game.zoneOf("theirGear")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("theirGear");
    expect(new Set(game.p2.hand())).toEqual(new Set(["theirUnit", "theirSpell"]));
    expect(game.p2.trash()).toEqual([]);
  });

  test("opponent holding only units: nothing can be chosen, hand is untouched, spell still goes to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 1 } })
      .hand(P1, SABOTAGE, "sab")
      .hand(P2, UNIT, "u1")
      .hand(P2, UNIT, "u2")
      .build();
    await game.p1.cast("sab");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      // Only a decline / empty pick may be offered — never a unit.
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect(new Set(game.p2.hand())).toEqual(new Set(["u1", "u2"]));
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
  });

  test("Action timing: not castable on the opponent's turn", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "sab")).toBe(false);
  });
});
