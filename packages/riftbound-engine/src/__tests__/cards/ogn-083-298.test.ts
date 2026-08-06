/**
 * Consult the Past — ogn-083-298 · Spell · Mind · 4 energy
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Draw 2.
 *
 * Hidden (rule 811): on your turn pay 1 power of any domain to hide this at a
 * battlefield you control; from the next turn on it may be played from there
 * ignoring its base cost.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-083-298";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn. (1 energy)

describe("Consult the Past (ogn-083-298)", () => {
  test("Draw 2 for 4 energy; the spell goes to trash; not castable with 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "ctp").build();
    await game.p1.cast("ctp");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("ctp")).toBe("trash");
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ctp").build();
    expect(poor.p1.can("cast", "ctp")).toBe(false);
  });

  test("[Reaction]: playable on the opponent's turn in response to their spell, resolving first", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 1 })
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "ctp")
      .build();
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "ctp")).toBe(true);
    await game.p1.cast("ctp");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ctp")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("cleave")).toBe("chain");
  });

  test("[Hidden]: hide at a battlefield you control for 1 power of any domain (energy untouched); no chain opens", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "ctp")
      .build();
    await game.p1.hide("ctp", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    expect(game.zoneOf("ctp")).toBe("facedown-bf1");
    expect(game.state("ctp").isHidden).toBe(true);
    expect(game.chain()).toHaveLength(0);
  });

  test("[Hidden]: cannot hide without a power to pay or at a battlefield you don't control", async () => {
    const noPower = await scenario().resources(P1, { energy: 4 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "ctp").build();
    expect(noPower.p1.can("hide", "ctp")).toBe(false);
    const notMine = await scenario().resources(P1, { power: { mind: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "ctp").build();
    expect(notMine.p1.can("hide", "ctp")).toBe(false);
  });

  test("[Hidden]: not playable from facedown the turn it is hidden; on a later turn it plays for 0 and draws 2", async () => {
    const game = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "guard") // keeps control of bf1 across turns
      .hand(P1, CARD, "ctp")
      .build();
    await game.p1.hide("ctp", "bf1");
    expect(game.p1.can("reveal", "ctp")).toBe(false);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    const handBefore = game.p1.hand().length;
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.reveal("ctp");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ctp"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // base cost ignored
    await game.settle();
    expect(game.zoneOf("ctp")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
  });
});
