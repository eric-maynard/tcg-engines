/**
 * Ruling 37592122b3876afc — Rebuke (OGN-172 → ogn-172-298) · Spell · Chaos · [2][chaos][chaos] · [Action]
 *   "Return a unit at a battlefield to its owner's hand."
 *   × Doran's Blade (SFD-095 → sfd-095-221) · Equipment "[Equip] [body]" (attached: +2 [Might]).
 *
 * Q: If my unit gets Rebuked, do the gear attached to it go back to my hand with it?
 * A: No. Only the top-most card (the unit) changes zone. The gear detaches; because the unit left a board zone
 *    for a non-board zone, the gear detaches AT the battlefield the unit was at, and — being an unattached card
 *    present at a battlefield — it is Recalled to its controller's base at the next cleanup. It never sees the hand.
 * Rules: 422.4.b (detach location on a board→non-board zone change), 435.1 (loose gear at a battlefield is recalled),
 *        428 (only the moved object changes zone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUKE = "ogn-172-298";
const DORANS_BLADE = "sfd-095-221";

/** P1's turn. P2 holds bf1 with Wolf (3) wearing his own Doran's Blade (→ 5). P1 has Rebuke and exactly [2][chaos][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Wolf" }, "wolf", { equippedWith: ["blade"] } as Record<string, unknown>)
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "wolf" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .hand(P1, REBUKE, "rebuke");
}

async function rebuked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("wolf")).toMatchObject({ attachments: ["blade"], might: 5 });
  await game.p1.cast("rebuke", { targets: "wolf" });
  await game.settle();
  return game;
}

describe("Ruling 37592122b3876afc — Rebuke bounces the unit only; its gear falls off and is recalled, never going to hand", () => {
  test("setup: the Blade is attached at bf1 and Rebuke is a legal Action on P1's turn", async () => {
    const game = await board().build();
    expect(game.state("blade")).toMatchObject({ attachedTo: "wolf", controller: P2, owner: P2 });
    expect(game.p1.can("cast", "rebuke")).toBe(true);
  });

  test("ruling: the unit goes to its OWNER's hand — the attached Doran's Blade does not follow it", async () => {
    const game = await rebuked();
    expect(game.zoneOf("wolf")).toBe("hand");
    expect(game.p2.hand()).toContain("wolf");
    expect(game.p2.hand()).not.toContain("blade");
    expect(game.p1.hand()).not.toContain("blade");
    expect(game.zoneOf("blade")).not.toBe("hand");
    expect(game.zoneOf("rebuke")).toBe("trash");
  });

  test("ruling: the Blade detaches (422.4.b) and, as loose gear at a battlefield, is recalled to its controller's base (435.1)", async () => {
    const game = await rebuked();
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, owner: P2 });
    expect(game.state("blade").location).toBe("base");
    expect(game.p2.gear()).toContain("blade");
    expect(game.p2.trash()).not.toContain("blade");
    expect(game.p2.banishment()).not.toContain("blade");
    expect(game.violations()).toEqual([]);
  });

  test("the bounced unit is a fresh card in hand — it carries no attachment back and can be replayed without the Blade", async () => {
    const game = await rebuked();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.state("wolf").attachments).toEqual([]);
  });
});
