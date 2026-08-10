/**
 * Ruling 926e26094bcfd456 — Conscription (UNL-140 → unl-140-219) · Spell · Chaos · [5]+[chaos][chaos]
 *     "You may spend 5 XP as an additional cost to play this. Choose an enemy unit at a battlefield with 3 [Might] or less
 *      (any enemy unit at a battlefield if you paid). Take control of it, exhaust it, and recall it."
 *   × Doran's Blade (sfd-095-221) · Equipment · +2 Might — worn by the conscripted unit.
 *
 * Q: When taking a unit with Conscription, does it take all attached gear as well?
 * A: You take the UNIT; its gear is not separately "taken" but stays attached and travels with it as it is recalled to your
 *    base — so the unit arrives in your base still wearing everything that was attached to it.
 * Rules: 719.3 / 719.3.a (attached cards are where their Top-Most card is and change location with it), 454 (Recall),
 *        718.4 (the Might bonus keeps applying while attached), 718.5.e/f (attached cards may have a different controller;
 *        a control change of the Top-Most card does not by itself change control of its attachments).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSCRIPTION = "unl-140-219";
const DORANS_BLADE = "sfd-095-221";

/** P1's turn with [5]+2 chaos. P2 holds bf1 with a Page (1) wearing P2's Doran's Blade (+2 → 3, still "3 or less") and a Guard (4). */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Page" }, "page", { equippedWith: ["blade"] })
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "page" }, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .hand(P1, CONSCRIPTION, "con");
}

async function conscriptThePage(): Promise<Game> {
  const game = await board().build();
  expect(game.state("page")).toMatchObject({ attachments: ["blade"], controller: P2, might: 3, zone: "battlefield-bf1" });
  const targets = (game.p1.option("cast", "con")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat() as string[];
  expect(targets).toContain("page"); // 1 + 2 = 3 counts as "3 or less"
  expect(targets).not.toContain("guard");
  await game.p1.cast("con", { targets: "page" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.settle();
  expect(game.zoneOf("con")).toBe("trash");
  return game;
}

describe("Ruling 926e26094bcfd456 — Conscription takes the unit; its attached gear rides along to your base still attached", () => {
  test("the Page ends in P1's base: controlled by P1 (owned by P2), exhausted — and STILL wearing Doran's Blade, so it is still 1 + 2 = 3", async () => {
    const game = await conscriptThePage();
    expect(game.state("page")).toMatchObject({ attachments: ["blade"], controller: P1, isExhausted: true, location: "base", might: 3, owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain("page");
    expect(game.p2.units()).not.toContain("page");
  });

  test("the Blade was not left behind or trashed: it is attached to the Page and located with it in P1's base (719.3.a), no longer at bf1; the Guard keeps bf1 for P2", async () => {
    const game = await conscriptThePage();
    expect(game.state("blade")).toMatchObject({ attachedTo: "page", location: "base", owner: P2, zone: "base" });
    expect(game.zoneOf("blade")).not.toBe("trash");
    expect(game.cardsAt("battlefield-bf1")).not.toContain("blade");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 926e26094bcfd456 says the attached gear is "now under your control as the new controller of that
  // unit"; CR 718.5.e ("Attached cards may have different Controllers from their Top-Most card") + 718.5.f ("Changes in Control
  // of the Top-Most card do not impact Control of Attached cards and vice versa") say taking control of the Page does NOT hand
  // P1 the Blade — engine follows CR: the Blade stays P2's gear while sitting on P1's conscript in P1's base (107.1.c.1).
  test("ruling 926e26094bcfd456 (rewritten to CR 718.5.e/f) — only the UNIT changed controller: the attached Blade is still controlled (and owned) by P2 even though it now sits in P1's base on P1's unit", async () => {
    const game = await conscriptThePage();
    expect(game.state("page").controller).toBe(P1);
    expect(game.state("blade")).toMatchObject({ attachedTo: "page", controller: P2, owner: P2, zone: "base" });
    expect(game.p2.gear()).toContain("blade");
    expect(game.p1.gear()).not.toContain("blade");
  });

  test("it stays that way: a full round later the conscript readies in P1's base still equipped (3 Might)", async () => {
    const game = await conscriptThePage();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("page")).toMatchObject({ attachments: ["blade"], controller: P1, isReady: true, might: 3, zone: "base" });
    expect(game.state("blade")).toMatchObject({ attachedTo: "page", zone: "base" });
  });
});
