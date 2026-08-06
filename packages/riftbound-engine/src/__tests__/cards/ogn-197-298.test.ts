/**
 * Teemo, Scout — ogn-197-298 · Champion Unit · Chaos · 2 energy · 1 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When you play me, give me +3 [Might] this turn.
 *
 * Rule 811: Hidden — pay one power of any domain to hide facedown at a
 * battlefield you control; from the next turn on it may be played from there
 * for 0 (gaining Reaction), and a hidden permanent is played TO that
 * battlefield (811.1.d.1). Playing from hidden is still "playing me".
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-197-298";

describe("Teemo, Scout (ogn-197-298)", () => {
  test("played from hand for 2 energy: enters the base and gets +3 Might (1 → 4) this turn", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "teemo").build();
    await game.p1.play("teemo");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("base");
    expect(game.state("teemo").baseMight).toBe(1);
    expect(game.state("teemo").might).toBe(4);
  });

  test("'this turn': the +3 Might is gone on the next turn", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "teemo").build();
    await game.p1.play("teemo");
    await game.settle();
    expect(game.state("teemo").might).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("teemo").might).toBe(1);
  });

  test("[Hidden]: hide at a battlefield you control for one power of any domain; energy untouched, no chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "teemo")
      .build();
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.chain()).toHaveLength(0);
  });

  test("[Hidden]: cannot hide at a battlefield you don't control, or without a power to pay", async () => {
    const notMine = await scenario().resources(P1, { power: { chaos: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "teemo").build();
    expect(notMine.p1.can("hide", "teemo")).toBe(false);
    const broke = await scenario().resources(P1, { energy: 5 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "teemo").build();
    expect(broke.p1.can("hide", "teemo")).toBe(false);
  });

  test("[Hidden]: not playable from facedown the turn it was hidden; on a later turn it plays for 0 to THAT battlefield with +3 Might", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "guard") // holds bf1 so the hidden card stays
      .hand(P1, CARD, "teemo")
      .build();
    await game.p1.hide("teemo", "bf1");
    expect(game.p1.can("reveal", "teemo")).toBe(false);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played for 0
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    expect(game.state("teemo").might).toBe(4); // "When you play me" also fires from hidden
  });

  test("[Hidden] gains Reaction: on the opponent's later turn it can be played from facedown in response to their spell", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "guard")
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P1, CARD, "teemo")
      .hand(P2, "ogn-004-298", "cleave") // [Action] 1-energy spell
      .build();
    await game.p1.hide("teemo", "bf1");
    await game.advanceTurn(); // → P2's turn
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").might).toBe(4);
  });

  test("cost: not playable from hand with 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "teemo").build();
    expect(game.p1.can("play", "teemo")).toBe(false);
  });
});
