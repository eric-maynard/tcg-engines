/**
 * Ruling aa12100e9837bfc8 — Get Excited! (OGN-008 → ogn-008-298) · Action spell · [2][fury]
 *   "Discard 1. Deal its Energy cost as damage to a unit at a battlefield. (Ignore its Power cost.)"
 *   × Not So Fast (SFD-045 → sfd-045-221) · Reaction [2][calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: Is the discard a cost? Does it happen at resolution? Is the target chosen at resolution too?
 * A: The discard is NOT a cost — it is part of the resolution, so a countered Get Excited! discards
 *    nothing. The card discarded is chosen (and revealed) only as the spell resolves, so the opponent
 *    cannot see the damage number in time to react. The TARGET, by contrast, is declared when the
 *    spell is played and put on the chain. If the target is gone at resolution the spell still resolves
 *    and still discards — it just deals no damage (nothing "fizzles").
 * Rules: 204 (costs vs. instructions), 355.5 (targets chosen on play), 425.1 (a countered card does
 *        nothing at all), 359.3.e.5 / 359.3.f.2 (illegal target at resolution ⇒ that instruction only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const NOT_SO_FAST = "sfd-045-221";

const CHEAP = { cardType: "unit", energyCost: 1, might: 1, name: "Cheap Recruit" } as const;
const PRICEY = { cardType: "unit", energyCost: 5, might: 5, name: "Pricey Recruit" } as const;

/** P2 reaction: bounce a unit (used to make Get Excited!'s target vanish before it resolves). */
const WHISK_AWAY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Whisk Away",
  rulesText: "[Reaction] Return a unit to its owner's hand.",
  timing: "reaction",
} as const;

/** P1's turn, [2][fury] banked, Get Excited! plus two discardable units in hand; P2 has a 9-Might Ogre at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Ogre" }, "ogre")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, CHEAP, "cheap")
    .hand(P1, PRICEY, "pricey");
}

async function cast(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ge", { targets: "ogre" });
  return game;
}

describe("Ruling aa12100e9837bfc8 — Get Excited!: target on play, discard at resolution, discard is not a cost", () => {
  test("ruling: the TARGET is declared on play — the cast option requires it and the chain item carries it", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ge")?.fields.find((f) => f.name === "targets");
    expect(targets?.required).toBe(true);
    expect((targets?.options ?? []).flat()).toEqual(["ogre"]);
    await game.p1.cast("ge", { targets: "ogre" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P1, targets: ["ogre"] })]);
  });

  test("ruling: nothing is discarded when the spell is PLAYED — both cards are still in hand while it sits on the chain", async () => {
    const game = await cast();
    expect(game.p1.hand().sort()).toEqual(["cheap", "pricey"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // The opponent has priority and cannot yet know the damage number.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("ruling: the discard is chosen as the spell RESOLVES, and the damage equals that card's Energy cost", async () => {
    const game = await cast();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["cheap", "pricey"]);
    await game.p1.pick("pricey"); // chosen late, on full information
    await game.settle();
    expect(game.zoneOf("pricey")).toBe("trash");
    expect(game.p1.hand()).toEqual(["cheap"]);
    expect(game.state("ogre").damage).toBe(5);
    expect(game.zoneOf("ge")).toBe("trash");
  });

  test("ruling: the SAME play can be turned into 1 damage instead — the choice is made at resolution, not earlier", async () => {
    const game = await cast();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("cheap");
    await game.settle();
    expect(game.state("ogre").damage).toBe(1);
    expect(game.p1.hand()).toEqual(["pricey"]);
  });

  test("ruling: countered ⇒ NOTHING is discarded (the discard is an instruction, not a cost) and no damage is dealt", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Ogre" }, "ogre")
      .hand(P1, GET_EXCITED, "ge")
      .hand(P1, CHEAP, "cheap")
      .hand(P1, PRICEY, "pricey")
      .hand(P2, NOT_SO_FAST, "nsf")
      .build();
    await game.p1.cast("ge", { targets: "ogre" });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "ge" });
    await game.settle();
    expect(game.zoneOf("ge")).toBe("trash"); // countered
    expect(game.p1.hand().sort()).toEqual(["cheap", "pricey"]); // no discard happened
    expect(game.state("ogre").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: target gone at resolution ⇒ the spell still resolves and still discards; only the damage finds nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Ogre" }, "ogre")
      .hand(P1, GET_EXCITED, "ge")
      .hand(P1, CHEAP, "cheap")
      .hand(P1, PRICEY, "pricey")
      .hand(P2, WHISK_AWAY, "whisk")
      .build();
    await game.p1.cast("ge", { targets: "ogre" });
    await game.p1.passPriority();
    await game.p2.cast("whisk", { targets: "ogre" });
    await game.settle();
    expect(game.zoneOf("ogre")).toBe("hand");
    // Get Excited! still resolves: it stops on its own discard prompt (the instruction runs anyway).
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("cheap");
    await game.settle();
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.zoneOf("cheap")).toBe("trash"); // the discard still happened
    expect(game.p1.hand()).toEqual(["pricey"]);
  });
});
