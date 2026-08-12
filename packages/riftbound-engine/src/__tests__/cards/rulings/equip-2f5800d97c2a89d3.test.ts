/**
 * Ruling 2f5800d97c2a89d3 — (no specific card) Doran's Shield (SFD-033 → sfd-033-221, "[Equip] [calm]").
 *
 * Q: Does equipping a Gear start a chain?
 * A: Yes. [Equip] is an activated ability, so activating it puts the equip on the chain, the state goes
 *    Closed and the opponent gets a window to respond before it resolves. If they remove the target unit
 *    first, the equip fails for want of a legal target and the gear stays unattached.
 * Rules: 818.1 ([Equip] is an activated ability), 333 / 337 (activating puts an item on the chain),
 *        340 (priority in a Closed State), 355.8 / 359.3.e.5 (an item whose target is gone does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DORANS_SHIELD = "sfd-033-221"; // Equipment · +1 Might · [Equip] [calm]

/** [Reaction] "Deal 3 to a unit." */
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "[Reaction] Deal 3 to a unit.",
  timing: "reaction",
} as const;

const board = () =>
  scenario()
    .resources(P1, { power: { calm: 1 } })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .gear(P1, DORANS_SHIELD, "shield")
    .hand(P2, BOLT3, "bolt");

const equip = (game: Game, unitId = "squire") =>
  game.p1.choose("equipCard:-", { params: { equipmentId: "shield", unitId } });

describe("Ruling 2f5800d97c2a89d3 — [Equip] is an activated ability, so it uses the chain and can be responded to", () => {
  test("activating [Equip] puts an item on the chain instead of attaching at once; the [calm] pip is already spent", async () => {
    const game = await board().build();
    await equip(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shield", controller: P1, triggered: false })]);
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.state("squire").might).toBe(2); // not yet +1
    expect(game.p1.resources().power).toEqual({ calm: 0 });
  });

  test("the opponent gets a real priority window before it resolves — and may cast a Reaction there", async () => {
    const game = await board().build();
    await equip(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "bolt")).toBe(true);
  });

  test("if it resolves undisturbed the gear attaches: Squire 2 → 3", async () => {
    const game = await board().build();
    await equip(game);
    await game.settle();
    expect(game.state("shield").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["shield"], might: 3 });
  });

  test("killing the target in response makes the equip fail — the gear stays unattached and nothing is refunded", async () => {
    const game = await board().build();
    await equip(game);
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.p1.resources().power).toEqual({ calm: 0 }); // the cost stays paid
    expect(game.violations()).toEqual([]);
  });
});
