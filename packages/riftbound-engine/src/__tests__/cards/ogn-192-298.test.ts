/**
 * Mindsplitter — ogn-192-298 · Unit · Chaos · 7 energy + 2 [chaos] · 7 Might
 *
 *   When you play me, choose an opponent. They reveal their hand. Choose a card
 *   from it, and they discard that card.
 *
 * Rules: 383.4.a (Play Effects go on the chain after the unit enters the board),
 * 424 (Reveal is temporary; cards stay in their zone), 422.1 (Discard: hand → owner's
 * trash), 422.4 (with an empty hand the discard instruction is ignored).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-192-298";
const SKULKER = "ogn-175-298";
const CLEAVE = "ogn-004-298";

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .hand(P2, SKULKER, "theirUnit")
    .hand(P2, CLEAVE, "theirSpell")
    .hand(P1, SKULKER, "myOther")
    .hand(P1, CARD, "ms");
}

describe("Mindsplitter (ogn-192-298)", () => {
  test("costs 7 energy + 2 chaos and is a 7-Might unit; unaffordable with only 1 chaos", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("ms")).toBe("base");
    expect(game.state("ms").might).toBe(7);
    const short = await scenario().resources(P1, { energy: 7, power: { chaos: 1 } }).hand(P1, CARD, "ms").build();
    expect(short.p1.can("play", "ms")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 6, power: { chaos: 2 } }).hand(P1, CARD, "ms").build();
    expect(lowEnergy.p1.can("play", "ms")).toBe(false);
  });

  test("When you play me: the play effect goes on the chain as a triggered item from Mindsplitter", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ms", controller: P1, triggered: true })]);
  });

  test("on resolution the opponent's whole hand is revealed and P1 picks one; the opponent discards exactly that card", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["theirSpell", "theirUnit"]); // whole hand, nothing of P1's
    await game.p1.pick("theirSpell");
    await game.settle();
    expect(game.zoneOf("theirSpell")).toBe("trash");
    expect(game.state("theirSpell").owner).toBe(P2);
    expect(game.p2.trash()).toEqual(["theirSpell"]);
    expect(game.p2.hand()).toEqual(["theirUnit"]);
    expect(game.p1.hand()).toEqual(["myOther"]); // chooser's own hand untouched
    expect(game.decision()?.kind).toBe("action");
  });

  test("the choice is mandatory — P1 cannot decline to pick a card", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    await game.settle();
    expect((game.decision() as PickDecision).allowDecline).toBe(false);
    const r = await game.p1.try((p) => p.decline());
    expect(r.ok).toBe(false);
  });

  test("opponent with an empty hand: the effect resolves with nothing to choose or discard (rule 422.4)", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { chaos: 2 } }).hand(P1, CARD, "ms").build();
    await game.p1.play("ms");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("ms")).toBe("base");
  });
});
