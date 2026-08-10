/**
 * Ruling 0675410d51f49507 — Edge of Night (SFD-139 → sfd-139-221) · Equipment · Chaos · 3 · +2
 *   "[Hidden] When you play this from face down, attach it to a unit you control (here). [Equip] [chaos]"
 *
 * Q: Can I hide Edge of Night while it's already on the board?
 * A: No. Hiding takes a card from your HAND (or Champion Zone) and puts it facedown at a battlefield you control; a
 *    face-up permanent on the board is not in a zone you can Hide from.
 * Rules: 811.1.b (Hide: from hand, pay [rainbow], facedown at a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const EDGE_OF_NIGHT = "sfd-139-221";

/** P1's turn, P1 holds bf1 with a unit and has a rainbow to pay for a Hide. */
function base() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder");
}

describe("Ruling 0675410d51f49507 — Edge of Night can only be hidden from hand, never from the board", () => {
  test("control: from HAND, Edge of Night can be hidden at bf1 for [rainbow]", async () => {
    const game = await base().hand(P1, EDGE_OF_NIGHT, "eon").build();
    expect(game.p1.can("hide", "eon")).toBe(true);
    await game.p1.hide("eon", "bf1");
    expect(game.zoneOf("eon")).toBe("facedown-bf1");
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("on the board UNATTACHED (gear in base): no Hide is offered for it and a forced hideCard is rejected", async () => {
    const game = await base().gear(P1, EDGE_OF_NIGHT, "eon").build();
    expect(game.zoneOf("eon")).toBe("base");
    expect(game.p1.can("hide", "eon")).toBe(false);
    const forced = await game.p1.try((p) => p.do("hideCard", { battlefieldId: "bf1", cardId: "eon" }));
    expect(forced.ok).toBe(false);
    expect(game.zoneOf("eon")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("on the board ATTACHED to the Holder at bf1: still not hideable; it stays attached (+2)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder", { equippedWith: ["eon"] })
      .card("eon", { def: EDGE_OF_NIGHT, meta: { attachedTo: "holder" }, owner: P1, zone: "bf1" })
      .build();
    expect(game.state("holder").might).toBe(4);
    expect(game.p1.can("hide", "eon")).toBe(false);
    const forced = await game.p1.try((p) => p.do("hideCard", { battlefieldId: "bf1", cardId: "eon" }));
    expect(forced.ok).toBe(false);
    expect(game.state("eon").attachedTo).toBe("holder");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
