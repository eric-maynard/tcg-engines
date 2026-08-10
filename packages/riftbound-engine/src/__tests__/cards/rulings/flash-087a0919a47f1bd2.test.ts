/**
 * Ruling 087a0919a47f1bd2 — Flash (OGS-011 → ogs-011-024) · [2] · [Reaction] "Move up to 2 friendly units to base."
 *   × Void Seeker (OGN-024 → ogn-024-298) · [3][fury] · [Action] "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: A spell "deal 4 to a unit at a battlefield, draw a card" targets my unit; I Flash the unit home before it resolves.
 *    What happens to the spell?
 * A: It can't deal the damage (the unit is no longer at a battlefield) but it isn't countered — it resolves as much as it
 *    can, so its caster still draws a card.
 * Rules: 359.3.e.5 (an instruction whose target became illegal is not performed), 359.3 (perform the rest — the draw is an
 *        independent instruction), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const VOID_SEEKER = "ogn-024-298";

/** P1's turn. P2 holds bf1 with a 3-Might Scout and has Flash + [2]. P1: Void Seeker with exactly [3][fury], known deck top. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, FLASH, "flash")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["top", "d2"]);
}

async function seekerThenFlash(game: Game): Promise<void> {
  await game.p1.cast("vs", { targets: "scout" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P1, targets: ["scout"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["scout"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "flash"]);
}

describe("Ruling 087a0919a47f1bd2 — Flash saves the unit from Void Seeker's damage, but the caster still draws", () => {
  test("Flash resolves first and recalls the Scout to base; Void Seeker then resolves: no damage to the Scout (not at a battlefield), no re-target onto the Holder, but P1 DOES draw 1; the spell went to the trash normally", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length; // includes vs
    await seekerThenFlash(game);
    for (let i = 0; i < 4 && game.zoneOf("flash") === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("holder")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1); // cast vs, drew top
    expect(game.p1.hand()).toContain("top");
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // not countered/refunded
    expect(game.violations()).toEqual([]);
  });

  test("control: without Flash, Void Seeker deals 4 (Scout dies) and P1 draws 1", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.hand()).toContain("top");
  });
});
