/**
 * Shadow Dash (ven-148-166) — Spell, [Calm]/[Order], [2] + 1 power, Epic.
 *
 * "Move an enemy unit to a battlefield where you have units. If you have
 *  exactly two units there, they each get +1 [Might] this turn.
 *  [Flow] [5][rainbow][rainbow] (You may play this from your trash for its
 *  Flow cost. Then banish it.)"
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-148-166";

describe("Shadow Dash (ven-148-166)", () => {
  test("moves an enemy unit to a battlefield where you have units", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3 }, "foe")
      .unit(P1, "bf2", { might: 2 }, "ally")
      .hand(P1, CARD, "dash")
      .build();

    await game.p1.cast("dash", { targets: "foe" });
    await game.settle();

    // bf2 is the only battlefield where P1 has units, so it is the sole
    // destination — no zone lookup may fail and no unit may vanish.
    expect(game.locationOf("foe")).toBe("bf2");
    expect(game.zoneOf("dash")).toBe("trash");
  });

  test("gives each of your two units there +1 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3 }, "foe")
      .unit(P1, "bf2", { might: 2 }, "ally1")
      .unit(P1, "bf2", { might: 4 }, "ally2")
      .hand(P1, CARD, "dash")
      .build();

    await game.p1.cast("dash", { targets: "foe" });
    await game.settle();

    expect(game.locationOf("foe")).toBe("bf2");
    expect(game.state("ally1").might).toBe(3);
    expect(game.state("ally2").might).toBe(5);
  });

  // rule 355.8 — a spell with no legal destination for its move effect may not
  // be played at all: "where you have units" is a presence test, so with no
  // friendly units on any battlefield there is nowhere legal to move to.
  // The play-time gate reaches this through chosenMoveDestinations, which must
  // understand the `friendly-units` destination filter.
  test("is not castable when you have no units at any battlefield (rule 355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, CARD, "dash")
      .build();

    expect(game.p1.can("cast", "dash")).toBe(false);
    expect(game.p1.legal().join(" ")).not.toContain("dash");
  });

  // A battlefield you control but have vacated is NOT a legal destination; one
  // you do not control but occupy is.
  test("presence, not control, picks the destination", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "base", { might: 3 }, "foe")
      .unit(P1, "bf2", { might: 2 }, "ally")
      .hand(P1, CARD, "dash")
      .build();

    await game.p1.cast("dash", { targets: "foe" });
    await game.settle();

    expect(game.locationOf("foe")).toBe("bf2");
  });

  test("gives no Might when you have a number of units there other than two", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3 }, "foe")
      .unit(P1, "bf2", { might: 2 }, "ally1")
      .unit(P1, "bf2", { might: 4 }, "ally2")
      .unit(P1, "bf2", { might: 1 }, "ally3")
      .hand(P1, CARD, "dash")
      .build();

    await game.p1.cast("dash", { targets: "foe" });
    await game.settle();

    expect(game.state("ally1").might).toBe(2);
    expect(game.state("ally2").might).toBe(4);
    expect(game.state("ally3").might).toBe(1);
  });
});
