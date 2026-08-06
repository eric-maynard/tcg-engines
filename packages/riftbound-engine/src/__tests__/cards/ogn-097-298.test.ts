/**
 * Blastcone Fae — ogn-097-298 · Unit · Mind · 2 energy + 1 mind power · 2 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When you play me, give a unit -2 [Might] this turn, to a minimum of 1 [Might].
 *
 * Rule 811.1.d: played from facedown it enters at that battlefield and its
 * play-effect target must be chosen among units there.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-097-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5 }, "big")
    .unit(P2, "base", { might: 2 }, "small")
    .hand(P1, CARD, "fae");
}

describe("Blastcone Fae (ogn-097-298)", () => {
  test("cost: 2 energy + 1 mind for a 2-Might unit; unaffordable short of either", async () => {
    const game = await board().build();
    await game.p1.play("fae");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").might).toBe(2);
    expect((await board().resources(P1, { energy: 1 }).build()).p1.can("play", "fae")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "fae").build()).p1.can("play", "fae")).toBe(false);
  });

  test("when played, the chosen unit gets -2 Might this turn (5 → 3), and it wears off at end of turn", async () => {
    const game = await board().build();
    await game.p1.play("fae");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("big");
    await game.settle();
    expect(game.state("big").might).toBe(3);
    expect(game.state("small").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("big").might).toBe(5);
  });

  test("to a minimum of 1 Might: a 2-Might unit drops to 1, not 0", async () => {
    const game = await board().build();
    await game.p1.play("fae");
    await game.settle();
    await game.p1.pick("small");
    await game.settle();
    expect(game.state("small").might).toBe(1);
    expect(game.zoneOf("small")).toBe("base");
  });

  test("[Hidden]: hide for 1 power of any domain at a battlefield you control; not playable from there the same turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "fae")
      .build();
    await game.p1.hide("fae", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.zoneOf("fae")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "fae")).toBe(false);
  });

  test("[Hidden]: on a later turn plays for 0 AT that battlefield, and the -2 Might target must be a unit there (rule 811.1.d)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 4 }, "guard")
      .unit(P2, "bf2", { might: 5 }, "far")
      .hand(P1, CARD, "fae")
      .build();
    await game.p1.hide("fae", "bf1");
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.reveal("fae");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d && d.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["fae", "guard"]);
    await game.p1.pick("guard");
    await game.settle();
    expect(game.state("guard").might).toBe(2);
    expect(game.state("far").might).toBe(5);
  });
});
