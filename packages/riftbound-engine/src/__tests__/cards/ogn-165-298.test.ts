/**
 * Cemetery Attendant — ogn-165-298 · Unit · Chaos · 3 energy + [chaos] · 3 might
 *
 *   When you play me, return a unit from your trash to your hand.
 *
 * Rules: play-self triggered ability (383); "a unit from your trash" — only unit cards, only the
 * controller's own trash; not "you may", so with a legal card it must return one.
 *
 * Engine status: the trigger currently resolves by returning the Attendant ITSELF to hand and
 * never looks at the trash — every effect test below is a BUG marker.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-165-298";
const SKULKER = "ogn-175-298"; // vanilla unit
const CLEAVE = "ogn-004-298"; // a spell

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .trash(P1, SKULKER, "deadA")
    .trash(P1, { might: 5, name: "Big Corpse" }, "deadB")
    .trash(P1, CLEAVE, "spell")
    .trash(P2, SKULKER, "theirs")
    .hand(P1, CARD, "ca");
}

describe("Cemetery Attendant (ogn-165-298)", () => {
  test("cost: 3 energy + 1 chaos for a 3-might unit; play puts its trigger on the chain; unaffordable without the chaos or with 2 energy", async () => {
    const game = await board().build();
    await game.p1.play("ca");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("ca")).toBe("base");
    expect(game.state("ca").might).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ca", controller: P1, triggered: true })]);
    const noPower = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ca").build();
    expect(noPower.p1.can("play", "ca")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "ca").build();
    expect(lowEnergy.p1.can("play", "ca")).toBe(false);
  });

  test("the play trigger returns the chosen unit from your trash to your hand", async () => {
    // Expected: deadB moves trash → hand, the Attendant stays on the board.
    // Actual: return-to-hand resolves against the source card; the trash is untouched.
    const game = await board().build();
    await game.p1.play("ca", { answers: ["deadB"] });
    game.script(P1, ["deadB"]);
    await game.settle();
    expect(game.zoneOf("ca")).toBe("base");
    expect(game.zoneOf("deadB")).toBe("hand");
    expect(game.p1.hand()).toContain("deadB");
    expect(game.zoneOf("deadA")).toBe("trash");
  });

  test("only UNITS in YOUR trash are offered as choices — not spells, not the opponent's trash", async () => {
    // Expected: a pick prompt for P1 listing exactly deadA/deadB. Actual: no prompt at all.
    const game = await board().build();
    await game.p1.play("ca");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P1);
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["deadA", "deadB"]);
    await game.p1.pick("deadA");
    await game.settle();
    expect(game.zoneOf("deadA")).toBe("hand");
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("with no unit in your trash the Attendant still stays in play and nothing is returned", async () => {
    // Expected: the trigger has no legal card and does nothing; Attendant remains in base.
    // Actual: the Attendant bounces itself back to hand.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .trash(P1, CLEAVE, "spell")
      .trash(P2, SKULKER, "theirs")
      .hand(P1, CARD, "ca")
      .build();
    await game.p1.play("ca");
    await game.settle();
    expect(game.zoneOf("ca")).toBe("base");
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });
});
