/**
 * Ruling bbe2771b6e3de654 — Flurry of Blades (OGN-133 → ogn-133-298) · Spell · [1] · [Reaction]
 *   "Deal 1 to all units at battlefields."
 *   × Tianna Crownguard (SFD-060 → sfd-060-221) · 4 [Might] · [Deflect] as the would-be protected unit.
 *   × Cleave (OGN-004 → ogn-004-298) as the contrasting spell that DOES choose her.
 *
 * Q: Does Flurry of Blades target units, and do you pay [Deflect] costs for it?
 * A: No to both. "All units at battlefields" is a programmatic selection, not a choice, so nothing is targeted and
 *    no [Deflect] surcharge is owed — one energy casts it into a board full of [Deflect]. A spell that really does
 *    choose the unit (Cleave) has to pay the surcharge.
 * Rules: 352.10.d (programmatically selected objects are not targets), 809.1.c ([Deflect] taxes spells that CHOOSE),
 *        735.1.c (the surcharge is an additional cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLURRY_OF_BLADES = "ogn-133-298";
const TIANNA_CROWNGUARD = "sfd-060-221";
const CLEAVE = "ogn-004-298";

/** P1's turn. Tianna and a P1 body stand at bf1; a P2 body waits in base. P1 has exactly [1] and no Power. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TIANNA_CROWNGUARD, "tianna")
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
    .hand(P1, FLURRY_OF_BLADES, "flurry")
    .resources(P1, { energy: 1 });
}

describe("Ruling bbe2771b6e3de654 — Flurry of Blades chooses nothing, so [Deflect] never applies", () => {
  test("the cast offers no `targets` field at all — nothing is chosen", async () => {
    const game = await board().build();
    expect(game.state("tianna").keywords).toContain("Deflect");
    const targets = game.p1.option("cast", "flurry")?.fields.find((f) => f.arg === "targets");
    expect(targets === undefined || targets.max === 0).toBe(true);
    expect(game.p1.can("cast", "flurry")).toBe(true);
  });

  test("…so it casts for its printed [1] with an empty Power pool even though a [Deflect] unit is on the board", async () => {
    const game = await board().build();
    await game.p1.cast("flurry");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flurry", controller: P1, triggered: false })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("it hits every unit AT A BATTLEFIELD — [Deflect] and all — and leaves base units alone", async () => {
    const game = await board().build();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.state("tianna").damage).toBe(1);
    expect(game.state("mine").damage).toBe(1); // its own side too
    expect(game.state("home").damage).toBe(0); // base is not a battlefield
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Cleave, which does choose her, is unaffordable on [1] alone and needs the extra Power", async () => {
    const game = await board().hand(P1, CLEAVE, "cleave").build();
    const targets = game.p1.option("cast", "cleave")?.fields.find((f) => f.arg === "targets");
    expect(targets?.options).not.toContainEqual(["tianna"]); // priced out with an empty Power pool
    expect(targets?.options).toContainEqual(["mine"]);
    const poor = await game.p1.try((p) => p.cast("cleave", { targets: "tianna" }));
    expect(poor.ok).toBe(false);

    const rich = await board().hand(P1, CLEAVE, "cleave").resources(P1, { energy: 1, power: { rainbow: 1 } }).build();
    await rich.p1.cast("cleave", { targets: "tianna" });
    expect(rich.p1.energy()).toBe(0);
    expect(rich.p1.power("rainbow")).toBe(0); // the [Deflect] surcharge was charged
  });
});
