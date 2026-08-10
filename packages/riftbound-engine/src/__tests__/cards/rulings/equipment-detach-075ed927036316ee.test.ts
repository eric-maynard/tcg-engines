/**
 * Ruling 075ed927036316ee — (no specific card) Equipment on a unit that is returned to hand.
 *   Exercised with Boots of Swiftness (SFD-133 → sfd-133-221) · Equipment · +2 [Might] · "[Equip] [chaos] … [Ganking]",
 *   Gust (OGN-169 → ogn-169-298) "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand.",
 *   plus inline "banish a unit" / "deal 3" spells for the other two cases.
 *
 * Q: When a unit with attached gear is returned to hand, does the gear fall off and stay in the base?
 * A: Yes — exactly as when the unit dies or is banished: the Equipment detaches and remains in its controller's base.
 * Rules: 718 (Equipment leaves the unit whenever the unit leaves the board; the Equipment stays in base, unattached).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOOTS_OF_SWIFTNESS = "sfd-133-221";
const GUST = "ogn-169-298";

const BANISH = {
  abilities: [{ effect: { target: { type: "unit" }, type: "banish" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Exile",
  timing: "action",
};
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  timing: "action",
};

/** P2's turn with [3]. P1's Squire (1, wearing the +2 Boots → 3) stands at P1's bf1. P2 holds Gust, Exile and Bolt. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Squire" }, "squire", { equippedWith: ["boots"] } as Record<string, unknown>)
    .card("boots", { def: BOOTS_OF_SWIFTNESS, meta: { attachedTo: "squire" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    .hand(P2, GUST, "gust")
    .hand(P2, BANISH, "exile")
    .hand(P2, BOLT, "bolt");
}

async function built(): Promise<Game> {
  const game = await board().build();
  expect(game.state("squire")).toMatchObject({ attachments: ["boots"], baseMight: 1, might: 3 });
  expect(game.state("boots").attachedTo).toBe("squire");
  return game;
}

function expectBootsLooseInBase(game: Game): void {
  expect(game.zoneOf("boots")).toBe("base");
  expect(game.state("boots")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1 });
  expect(game.p1.gear()).toContain("boots");
}

describe("Ruling 075ed927036316ee — attached Equipment falls off into base when its unit leaves the board, whatever the cause", () => {
  test("returned to hand (Gust): the Squire goes to P1's hand as a bare 1-Might card; the Boots detach and sit unattached in P1's base", async () => {
    const game = await built();
    await game.p2.cast("gust", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.p1.hand()).toContain("squire");
    expect(game.state("squire").attachments).toEqual([]);
    expectBootsLooseInBase(game);
    expect(game.violations()).toEqual([]);
  });

  test("dies (Bolt, 3 damage): Squire to the trash, Boots stay behind in P1's base", async () => {
    const game = await built();
    await game.p2.cast("bolt", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expectBootsLooseInBase(game);
  });

  test("banished (Exile): Squire to banishment, Boots stay behind in P1's base", async () => {
    const game = await built();
    await game.p2.cast("exile", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("banishment");
    expectBootsLooseInBase(game);
  });
});
