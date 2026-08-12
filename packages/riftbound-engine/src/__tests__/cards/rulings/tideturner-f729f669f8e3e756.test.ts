/**
 * Ruling f729f669f8e3e756 — Tideturner (OGN-199 → ogn-199-298) · 2 Might · 2 · [Hidden]
 *   "When you play me, you may choose a unit you control at another location.
 *    Move me to its location and it to my original location."
 *
 * Q: What does Tideturner do, and does it have errata?
 * A: It is a Chaos-domain [Hidden] unit whose play trigger optionally swaps it with one of your other
 *    units. It DOES have errata (2025-10-21): "a friendly unit" became "a unit you control at another
 *    location" — you cannot swap with a unit standing where Tideturner already is.
 * Rules: 402.4 (a finalized trigger with no legal object is removed), 383.3.a.2 (a leading "you may"
 *        is opted into at finalization).
 */
import { describe, expect, test } from "bun:test";
import { getAllCards } from "../../../../../riftbound-cards/src/data/all-cards";
import { P1, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";

describe("Ruling f729f669f8e3e756 — Tideturner swaps with a unit you control at ANOTHER location (errata)", () => {
  test("the printed text is the errata'd wording: 'a unit you control at another location', with [Hidden]", () => {
    const card = getAllCards().find((c) => c.id === TIDETURNER)!;
    expect(card.cardType).toBe("unit");
    expect(card.might).toBe(2);
    expect(card.rulesText).toContain("[Hidden]");
    expect(card.rulesText).toMatch(/a unit you control at another location/i);
    expect(card.rulesText).not.toMatch(/choose a friendly unit\./i); // the pre-errata wording is gone
  });

  test("with a friendly unit at ANOTHER location the swap is offered, and taking it exchanges the two places", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .hand(P1, TIDETURNER, "tide")
      .build();
    await game.p1.play("tide"); // to base
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("tide")).toBe("bf1"); // Tideturner took the Scout's place
    expect(game.locationOf("scout")).toBe("base"); // and the Scout took Tideturner's
    expect(game.violations()).toEqual([]);
  });

  test("declining the 'you may' leaves both units where they were", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .hand(P1, TIDETURNER, "tide")
      .build();
    await game.p1.play("tide");
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("scout")).toBe("bf1");
  });

  test("the errata bites: a friendly unit at Tideturner's OWN location is no partner, so nothing is even offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout") // same location as the incoming Tideturner
      .hand(P1, TIDETURNER, "tide")
      .build();
    await game.p1.play("tide");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("scout")).toBe("base"); // no self-location swap happened
    expect(game.violations()).toEqual([]);
  });
});
