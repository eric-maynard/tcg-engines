/**
 * Teemo, Strategist — ogn-121-298 · Champion Unit · Mind · 2 energy + 1 mind power · 2 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When I defend, choose an enemy unit here and reveal the top 5 cards of your
 *   Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this
 *   way, then recycle the revealed cards.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-121-298";
const FILLER = "ogn-175-298"; // no Hidden
const CONSULT = "ogn-083-298"; // spell with [Hidden]
const FAE = "ogn-097-298"; // unit with [Hidden]

/** P2 to act; Teemo defends bf1; P1's top 5 = 3 Hidden + 2 plain, then c6. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "teemo")
    .unit(P2, "base", { might: 6 }, "a1")
    .unit(P2, "base", { might: 6 }, "a2")
    .unit(P2, "base", { might: 3 }, "bystander")
    .deck(P1, [CONSULT, FILLER, FAE, CONSULT, FILLER, FILLER], ["c1", "c2", "c3", "c4", "c5", "c6"]);
}

describe("Teemo, Strategist (ogn-121-298)", () => {
  test("cost: 2 energy + 1 mind for a 2-Might unit; unaffordable short of either", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "teemo").build();
    await game.p1.play("teemo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("teemo").might).toBe(2);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "teemo").build()).p1.can("play", "teemo")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { mind: 1 } }).hand(P1, CARD, "teemo").build()).p1.can("play", "teemo")).toBe(false);
  });

  test("when I defend: reveals the top 5, deals 1 per Hidden card revealed (3) to the enemy unit here, then recycles all 5", async () => {
    const game = await board().build();
    await game.p2.move("a1", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves; a1 is the only enemy unit here
    expect(game.state("a1").damage).toBe(3);
    expect(game.state("bystander").damage).toBe(0);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("c6");
    expect(deck.slice(-5).sort()).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(game.p1.hand()).toHaveLength(0); // revealed, not drawn
  });

  test("'choose an enemy unit here': with two attackers the defender picks one; units elsewhere are not offered", async () => {
    const game = await board().build();
    await game.p2.move(["a1", "a2"], "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d && d.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["a1", "a2"]);
    await game.p1.pick("a2");
    expect(game.state("a2").damage).toBe(3);
    expect(game.state("a1").damage).toBe(0);
  });

  test("no Hidden cards among the top 5 → no damage, but the 5 are still recycled", async () => {
    const plain = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "teemo")
      .unit(P2, "base", { might: 6 }, "a1")
      .deck(P1, [FILLER, FILLER, FILLER, FILLER, FILLER, CONSULT], ["c1", "c2", "c3", "c4", "c5", "c6"])
      .build();
    await plain.p2.move("a1", "bf1");
    await plain.p1.passPriority();
    await plain.p2.passPriority();
    expect(plain.state("a1").damage).toBe(0);
    expect(plain.p1.deck()[0]).toBe("c6");
    expect(plain.p1.deck().slice(-5).sort()).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  test("only when I DEFEND: Teemo attacking puts no Teemo trigger on the chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6 }, "holder")
      .unit(P1, "base", CARD, "teemo")
      .deck(P1, [CONSULT, CONSULT, CONSULT, CONSULT, CONSULT], ["c1", "c2", "c3", "c4", "c5"])
      .build();
    await game.p1.move("teemo", "bf1");
    expect(game.chain().some((i) => i.cardId === "teemo")).toBe(false);
    await game.settle();
    expect(game.state("holder").damage).toBeLessThanOrEqual(2); // only Teemo's 2 combat Might, no trigger damage
    expect(game.p1.deck()[0]).toBe("c1");
  });

  test("[Hidden]: may be hidden from hand at a battlefield you control for 1 power of any domain", async () => {
    const game = await scenario().resources(P1, { power: { fury: 1 } }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "teemo").build();
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p1.power()).toBe(0);
    expect(game.p1.can("reveal", "teemo")).toBe(false); // not the same turn
  });
});
