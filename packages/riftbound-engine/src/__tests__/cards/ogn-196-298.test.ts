/**
 * Soulgorger — ogn-196-298 · Unit · Chaos · 8 energy + [chaos][chaos] · 5 Might
 *
 *   When you play me, you may play a unit from your trash, ignoring its Energy cost.
 *   (You must still pay its Power cost.)
 *
 * Rules: optional ("you may") triggered ability on play; 356.1.b (ignoring a cost component only
 * skips that component — the Power cost is still added and paid); the played unit is played
 * normally otherwise (enters exhausted, 143.4; its own play triggers fire).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-196-298";
const SKULKER = "ogn-175-298"; // 3 energy, no power, 3 Might vanilla
const WURM = "ogn-011-298"; // Magma Wurm: 8 energy + [fury], 8 Might
const INCINERATE = "ogs-003-024"; // a spell (not a unit)

function board(power: Record<string, number> = { chaos: 2, fury: 1 }) {
  return scenario()
    .resources(P1, { energy: 8, power })
    .hand(P1, CARD, "sg")
    .trash(P1, SKULKER, "skulker")
    .trash(P1, WURM, "wurm")
    .trash(P1, INCINERATE, "spell")
    .trash(P2, SKULKER, "theirs");
}

describe("Soulgorger (ogn-196-298)", () => {
  test("cost: 8 energy + 2 chaos deducted; 5 Might; unaffordable with 1 chaos or 7 energy", async () => {
    const game = await board({ chaos: 2 }).build();
    await game.p1.play("sg");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("sg")).toBe("base");
    expect(game.state("sg").might).toBe(5);
    const oneChaos = await scenario().resources(P1, { energy: 8, power: { chaos: 1 } }).hand(P1, CARD, "sg").build();
    expect(oneChaos.p1.can("play", "sg")).toBe(false);
    const low = await scenario().resources(P1, { energy: 7, power: { chaos: 2 } }).hand(P1, CARD, "sg").build();
    expect(low.p1.can("play", "sg")).toBe(false);
  });

  test("'you may': playing Soulgorger asks its controller whether to use the ability; declining plays nothing", async () => {
    const game = await board().build();
    await game.p1.play("sg");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sg", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sg" } });
    await game.p1.no();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("wurm")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 1 } });
  });

  test.failing("BUG: accepting lets you pick a UNIT from YOUR trash and plays it for 0 energy", async () => {
    // Expected: after "yes" P1 picks among their trash units only (skulker | wurm — not the spell, not
    // P2's unit); picking the Skulker plays it to base exhausted with P1's energy still 0.
    // Actual: the play-from-trash effect resolves as a no-op — no pick, the unit stays in the trash.
    const game = await board().build();
    await game.p1.play("sg");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["skulker", "wurm"]);
    await game.p1.pick("skulker");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.state("skulker").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 1 } });
  });

  test.failing("BUG: the Power cost must still be paid — Magma Wurm from trash costs its [fury] but no energy", async () => {
    // Expected: picking the Wurm plays it (8 energy ignored) and deducts the 1 fury. Actual: nothing is played.
    const game = await board().build();
    await game.p1.play("sg");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("wurm");
    await game.settle();
    expect(game.zoneOf("wurm")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
  });

  test.failing("BUG: without the matching Power the Wurm cannot be played from trash (only the Skulker is offered)", async () => {
    // Expected: with no fury in the pool the Wurm is not a legal pick. Actual: no pick is offered at all.
    const game = await board({ chaos: 2 }).build();
    await game.p1.play("sg");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(["skulker"]);
  });
});
