/**
 * Assembly Rig — sfd-019-221 · Gear · Fury · 4 energy
 *
 *   [1][fury], Recycle a unit from your trash, [Exhaust]: Play a 3 [Might] Mech unit token
 *   to your base.
 *
 * Rules: 377–379 (activated abilities: everything before ":" is the cost, paid on activation),
 * 403 (Recycle = put on the bottom of its owner's Main Deck), 379.5 (a cost that cannot be paid
 * makes the ability un-activatable), 143.4 (unit tokens enter exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-019-221";
const SKULKER = "ogn-175-298"; // vanilla unit sitting in the trash to recycle
const mechs = (ids: string[]) => ids.filter((c) => c.startsWith("token-mech-"));

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .gear(P1, CARD, "rig")
    .trash(P1, SKULKER, "dead")
    .trash(P1, { cardType: "spell", name: "Junk Spell" }, "junk");
}

describe("Assembly Rig (sfd-019-221)", () => {
  test("playing the gear costs 4 energy; it enters your base ready; unaffordable with 3", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "rig").build();
    await game.p1.play("rig");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("rig")).toBe("base");
    expect(game.state("rig").isReady).toBe(true);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "rig").build();
    expect(poor.p1.can("play", "rig")).toBe(false);
  });

  test("activation pays [1][fury] and exhausts the Rig; the ability goes on the chain and resolves into a 3-Might Mech token in base", async () => {
    const game = await board().build();
    await game.p1.activate("rig");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("rig").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rig", controller: P1, triggered: false })]);
    expect(mechs(game.p1.base())).toHaveLength(0); // not before resolution
    await game.settle();
    const [tok] = mechs(game.p1.base());
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ baseMight: 3, cardType: "unit", isToken: true, might: 3, name: "Mech" });
    expect(game.state(tok!).isExhausted).toBe(true); // 143.4
    expect(mechs(game.p1.units("base"))).toHaveLength(1);
  });

  test.failing("BUG: 'Recycle a unit from your trash' is part of the cost — the trashed unit goes to the bottom of the main deck (403)", async () => {
    // Expected: on activation `dead` leaves the trash and becomes the bottom card of P1's main deck
    // (the non-unit `junk` is not eligible and stays). Actual: nothing is recycled; `dead` stays in trash.
    const game = await board().build();
    await game.p1.activate("rig");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("dead");
    }
    expect(game.zoneOf("dead")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("dead");
    expect(game.zoneOf("junk")).toBe("trash");
    await game.settle();
    expect(mechs(game.p1.base())).toHaveLength(1);
  });

  test.failing("BUG: not activatable with no UNIT in your trash (cost cannot be paid, 379.5)", async () => {
    // Expected: only a spell in trash → the recycle cost is unpayable → no activate option.
    // Actual: the engine ignores the recycle cost and offers the activation.
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .gear(P1, CARD, "rig")
      .trash(P1, { cardType: "spell", name: "Junk Spell" }, "junk")
      .build();
    expect(game.p1.can("activate", "rig")).toBe(false);
  });

  test("not activatable without the fury power, without 1 energy, or while the Rig is exhausted", async () => {
    const noFury = await board().resources(P1, { energy: 1, power: { fury: 0 } }).build();
    expect(noFury.p1.can("activate", "rig")).toBe(false);
    const noEnergy = await board().resources(P1, { energy: 0, power: { fury: 1 } }).build();
    expect(noEnergy.p1.can("activate", "rig")).toBe(false);
    const tired = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .gear(P1, CARD, "rig", { exhausted: true })
      .trash(P1, SKULKER, "dead")
      .build();
    expect(tired.p1.can("activate", "rig")).toBe(false);
  });
});
