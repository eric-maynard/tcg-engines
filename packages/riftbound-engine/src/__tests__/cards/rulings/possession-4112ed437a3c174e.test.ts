/**
 * Ruling 4112ed437a3c174e — Possession (OGN-203 → ogn-203-298) · Spell · Chaos · [8][chaos][chaos][chaos] · [Action]
 *   "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Doran's Blade (SFD-095 → sfd-095-221) · Equipment (attached: +2 [Might]).
 *
 * Q: When Possession takes an equipped unit, does the caster also take control of the attached gear?
 * A: No. Only the top-most card (the unit) changes controller. The gear stays attached and its effect keeps
 *    applying to the now-possessed unit, but its original owner still controls it. If it later detaches, it is
 *    recalled to that original owner's base.
 * Rules: 422 (attachments; only the top-most card changes control), 455 (control effects), 435.1 / 719.5 (a
 *        detached gear is recalled to its controller's base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const DORANS_BLADE = "sfd-095-221";

/** P1's turn. P2 holds bf1 with Thrall (3) wearing his own Doran's Blade (→ 5). P1 has Possession + [8][chaos]×3. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Thrall" }, "thrall", { equippedWith: ["blade"] } as Record<string, unknown>)
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "thrall" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 2, name: "Keeper" }, "keeper")
    .hand(P1, POSSESSION, "possess");
}

async function possessed(): Promise<Game> {
  const game = await board().build();
  expect(game.state("thrall")).toMatchObject({ controller: P2, might: 5 });
  await game.p1.cast("possess", { targets: "thrall" });
  await game.settle();
  return game;
}

describe("Ruling 4112ed437a3c174e — Possession moves the unit's control only; the gear's control never changes", () => {
  test("ruling: the unit is now P1's and sits in P1's base — but it is still owned by P2", async () => {
    const game = await possessed();
    expect(game.state("thrall")).toMatchObject({ controller: P1, location: "base", owner: P2 });
    expect(game.zoneOf("possess")).toBe("trash");
  });

  test("ruling: the Doran's Blade is still attached to it, still controlled AND owned by P2", async () => {
    const game = await possessed();
    expect(game.state("blade")).toMatchObject({ attachedTo: "thrall", controller: P2, owner: P2 });
    expect(game.state("thrall").attachments).toEqual(["blade"]);
    // The two differ: the top-most card is P1's, the attachment underneath is still P2's (718.5.f).
    expect(game.state("blade").controller).not.toBe(game.state("thrall").controller);
  });

  test("ruling: the gear's effect keeps applying to the possessed unit — P1's Thrall is still 3 + 2 = 5", async () => {
    const game = await possessed();
    expect(game.state("thrall").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: once it detaches (the bearer dies) it goes home — recalled to its OWNER's base, unattached", async () => {
    const game = await possessed();
    await game.p1.do("addDamage", { amount: 5, cardId: "thrall" });
    await game.settle();
    expect(game.zoneOf("thrall")).toBe("trash");
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, owner: P2 });
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.p2.gear()).toContain("blade");
    expect(game.violations()).toEqual([]);
  });
});
