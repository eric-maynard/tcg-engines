/**
 * Ruling 0c7a90a50039bd2d — Ruin Runner (SFD-105 → sfd-105-221) · Unit · Body · [6] · 5 Might
 *   "I can't be chosen by enemy spells and abilities."
 *   × Salvage (OGN-224 → ogn-224-298) · Action spell · [2][order] "You may kill up to one gear. Draw 1."
 *   (+ Doran's Blade sfd-095-221 as the Equipment attached to Ruin Runner; Smoke Screen ogn-093-298 "Give a
 *    unit -4 [Might] this turn" as the unit-choosing contrast.)
 *
 * Q: Can you target gear attached to Ruin Runner, or does its protection cover the gear?
 * A: Yes, you can. Salvage chooses a GEAR, not the unit it is attached to; Ruin Runner's "can't be chosen"
 *    protects only the unit itself. A spell that must choose a unit is still stopped.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RUIN_RUNNER = "sfd-105-221";
const SALVAGE = "ogn-224-298";
const DORANS_BLADE = "sfd-095-221";
const SMOKE_SCREEN = "ogn-093-298";

/** P1's turn. P2: Ruin Runner (5) at P2's bf1 wearing Doran's Blade (+2 → 7). P1: Salvage + Smoke Screen in hand, [4] + [order][mind]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RUIN_RUNNER, "runner", { equippedWith: ["blade"] })
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "runner" }, owner: P2, zone: "bf1" })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, SALVAGE, "salvage")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .resources(P1, { energy: 4, power: { mind: 1, order: 1 } });
}

describe("Ruling 0c7a90a50039bd2d — gear attached to Ruin Runner CAN be chosen; Ruin Runner itself cannot", () => {
  test("premise: Doran's Blade is attached to Ruin Runner (5 + 2 = 7) at bf1", async () => {
    const game = await board().build();
    expect(game.state("blade")).toMatchObject({ attachedTo: "runner", controller: P2, zone: "battlefield-bf1" });
    expect(game.state("runner").attachments).toEqual(["blade"]);
    expect(game.state("runner").might).toBe(7);
  });

  test("contrast: an enemy spell that must choose a UNIT (Smoke Screen) does not offer Ruin Runner — only the unprotected Bystander", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "smoke")).toBe(true);
    const field = game.p1.option("cast", "smoke")?.fields.find((f) => f.name === "targets");
    const offered = (field?.options ?? []).flat();
    expect(offered).toContain("bystander");
    expect(offered).not.toContain("runner");
    const r = await game.p1.try((p) => p.cast("smoke", { targets: "runner" }));
    expect(r.ok).toBe(false);
  });

  test("Salvage offers the attached Doran's Blade as its gear target (choosing the gear is not choosing the unit)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "salvage")).toBe(true);
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("blade");
  });

  test("Salvage on the Blade resolves: the Blade is killed (to P2's trash), Ruin Runner drops to 5 and stays put, P1 draws 1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("salvage", { targets: "blade" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1, order: 0 } });
    await game.settle();
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("blade").owner).toBe(P2);
    expect(game.state("runner")).toMatchObject({ attachments: [], might: 5, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Salvage left, drew 1
    expect(game.violations()).toEqual([]);
  });
});
