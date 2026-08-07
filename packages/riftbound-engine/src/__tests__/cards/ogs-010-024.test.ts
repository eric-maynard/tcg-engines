/**
 * Annie, Stubborn — ogs-010-024 · Champion Unit · Chaos · 4 energy + [chaos] · 3 might
 *
 *   When you play me, return a spell from your trash to your hand.
 *
 * Rules: play-self triggered ability (383); "a spell from your trash" — only spell cards, only the
 * controller's own trash; not "you may", so with a legal card it must return one.
 *
 * Engine status: the trigger currently resolves by returning Annie HERSELF to hand and never looks
 * at the trash — every effect test below is a BUG marker.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-010-024";
const CLEAVE = "ogn-004-298"; // spell
const LOSSES = "ogn-179-298"; // spell
const SKULKER = "ogn-175-298"; // unit

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .trash(P1, CLEAVE, "spellA")
    .trash(P1, LOSSES, "spellB")
    .trash(P1, SKULKER, "deadUnit")
    .trash(P2, CLEAVE, "theirs")
    .hand(P1, CARD, "annie");
}

describe("Annie, Stubborn (ogs-010-024)", () => {
  test("cost: 4 energy + 1 chaos for a 3-might unit; play puts her trigger on the chain; unaffordable without chaos or with 3 energy", async () => {
    const game = await board().build();
    await game.p1.play("annie");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("annie")).toBe("base");
    expect(game.state("annie").might).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "annie", controller: P1, triggered: true })]);
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "annie").build();
    expect(noPower.p1.can("play", "annie")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "annie").build();
    expect(lowEnergy.p1.can("play", "annie")).toBe(false);
  });

  test("the play trigger returns the chosen spell from your trash to your hand", async () => {
    // Expected: spellB moves trash → hand and Annie stays on the board.
    // Actual: return-to-hand resolves against the source card; the trash is untouched.
    const game = await board().build();
    await game.p1.play("annie");
    game.script(P1, ["spellB"]);
    await game.settle();
    expect(game.zoneOf("annie")).toBe("base");
    expect(game.zoneOf("spellB")).toBe("hand");
    expect(game.p1.hand()).toContain("spellB");
    expect(game.zoneOf("spellA")).toBe("trash");
  });

  test("only SPELLS in YOUR trash are offered — not units, not the opponent's trash", async () => {
    // Expected: a pick prompt for P1 listing exactly spellA/spellB. Actual: no prompt at all.
    const game = await board().build();
    await game.p1.play("annie");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["spellA", "spellB"]);
    await game.p1.pick("spellA");
    await game.settle();
    expect(game.zoneOf("spellA")).toBe("hand");
    expect(game.zoneOf("deadUnit")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("with no spell in your trash Annie still stays in play and nothing is returned", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .trash(P1, SKULKER, "deadUnit")
      .trash(P2, CLEAVE, "theirs")
      .hand(P1, CARD, "annie")
      .build();
    await game.p1.play("annie");
    await game.settle();
    expect(game.zoneOf("annie")).toBe("base");
    expect(game.zoneOf("deadUnit")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });
});
