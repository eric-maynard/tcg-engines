/**
 * Zaunite Bouncer — ogn-188-298 · Unit · Chaos · 4 energy + [chaos][chaos] · 2 Might
 *
 *   When you play me, return another unit at a battlefield to its owner's hand.
 *
 * "another" excludes the Bouncer itself; "at a battlefield" excludes units in a base; the unit
 * may be friendly or enemy and goes to its OWNER's hand.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-188-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Big Foe" }, "foe")
    .unit(P2, "base", { might: 1, name: "Home Foe" }, "homeFoe")
    .unit(P1, "bf2", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 1, name: "Home Ally" }, "homeAlly")
    .hand(P1, CARD, "bouncer");
}

describe("Zaunite Bouncer (ogn-188-298)", () => {
  test("costs 4 energy + 2 chaos and enters exhausted as a 2-Might unit; unaffordable with 1 chaos or 3 energy", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("bouncer")).toBe("base");
    expect(game.state("bouncer").might).toBe(2);
    expect(game.state("bouncer").isExhausted).toBe(true);
    const lowPower = await board().resources(P1, { energy: 4, power: { chaos: 1 } }).build();
    expect(lowPower.p1.can("play", "bouncer")).toBe(false);
    const lowEnergy = await board().resources(P1, { energy: 3, power: { chaos: 2 } }).build();
    expect(lowEnergy.p1.can("play", "bouncer")).toBe(false);
  });

  test("When you play me: an enemy unit at a battlefield goes back to its owner's (P2's) hand", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p2.hand()).toContain("foe");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.state("foe").damage).toBe(0);
  });

  test("it may also bounce a FRIENDLY unit at a battlefield — it returns to P1's hand", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "base" });
    await game.settle();
    await game.p1.pick("ally");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toContain("ally");
  });

  test("only OTHER units AT A BATTLEFIELD are offered: not units in a base, not the Bouncer itself", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "bf2" }); // Bouncer is itself at a battlefield now
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["ally", "foe"]);
  });

  test("the trigger is mandatory: with a single legal unit it is bounced without a decline option", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .hand(P1, CARD, "bouncer")
      .build();
    await game.p1.play("bouncer");
    await game.settle(); // single forced pick is auto-taken
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.decision()?.kind).toBe("action");
  });

  test("with no unit at any battlefield the trigger does nothing and the Bouncer still resolves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 1 }, "homeFoe")
      .hand(P1, CARD, "bouncer")
      .build();
    await game.p1.play("bouncer");
    await game.settle();
    expect(game.zoneOf("bouncer")).toBe("base");
    expect(game.zoneOf("homeFoe")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
  });
});
