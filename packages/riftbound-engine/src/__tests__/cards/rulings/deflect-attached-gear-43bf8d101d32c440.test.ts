/**
 * Ruling 43bf8d101d32c440 — Volibear, Furious (OGN-041 → ogn-041-298, "[Deflect 2]") wearing Doran's
 *   Shield (SFD-033 → sfd-033-221, "[Equip] [calm]", Effect Text "[Tank]") × Detonate (SFD-005 →
 *   sfd-005-221, "Kill a gear. Its controller draws 2.").
 *
 * Q: If a spell targets an Equipment attached to a unit with [Deflect], must the Deflect be paid?
 * A: No. The Equipment is its own object with its own properties — it does not inherit the wearer's
 *    ([Deflect] is the unit's, not the gear's), so you target it normally. Conversely an Equipment's own
 *    rules text is inactive while attached (its Effect Text is what the wearer gets), so a printed
 *    [Deflect] on an attached Equipment would not tax anything either. (No printed Equipment carries
 *    [Deflect], so that half is asserted through the inactive-rules-text behaviour instead.)
 * Rules: 718.4/718.5 (an attached gear is still its own object on the board), 435.1.c / 724 (rules text
 *        of an attached Equipment is inactive; its Effect Text applies to the wearer), 809.1.c.1
 *        ([Deflect] is a surcharge for choosing THAT object), 740.1 (properties are per card).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298"; // 9 Might · [Deflect 2]
const DORANS_SHIELD = "sfd-033-221";
const DETONATE = "sfd-005-221"; // 1 energy + [fury] · Kill a gear. Its controller draws 2.

/** [Action] "Deal 2 to a unit." — the control that DOES run into Volibear's [Deflect 2]. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

/** P1's turn; P2's Volibear holds bf1 wearing P2's Doran's Shield. P1 has exactly Detonate's cost. */
const board = (power: Record<string, number> = { fury: 1 }) =>
  scenario()
    .resources(P1, { energy: 1, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VOLIBEAR, "voli", { equippedWith: ["shield"] })
    .card("shield", { def: DORANS_SHIELD, meta: { attachedTo: "voli" }, owner: P2, zone: "battlefield-bf1" })
    .hand(P1, DETONATE, "det")
    .hand(P1, BOLT, "bolt");

const castTargets = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, alias: string) =>
  (game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

describe("Ruling 43bf8d101d32c440 — the wearer's [Deflect] does not protect the Equipment it wears", () => {
  test("setup: the Shield is attached and its Effect Text ([Tank]) is what Volibear gets", async () => {
    const game = await board().build();
    expect(game.state("shield")).toMatchObject({ attachedTo: "voli", controller: P2, owner: P2 });
    expect(game.state("voli").attachments).toEqual(["shield"]);
    expect(game.state("voli").keywords).toContain("Tank");
    expect(game.state("voli").keywords).toContain("Deflect");
    expect(game.state("shield").keywords).not.toContain("Deflect"); // the gear has none of the unit's properties
  });

  test("Detonate can name the attached Shield with only its printed cost in the pool — no [Deflect 2] surcharge", async () => {
    const game = await board().build();
    expect(castTargets(game, "det")).toContain("shield");
    await game.p1.cast("det", { targets: "shield" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // exactly Detonate's cost, nothing more
    expect(game.zoneOf("shield")).toBe("trash");
    expect(game.state("voli").attachments).toEqual([]);
    expect(game.state("voli").keywords).not.toContain("Tank"); // the Effect Text went with it
    expect(game.violations()).toEqual([]);
  });

  test("control — targeting VOLIBEAR himself does owe the surcharge: with no [rainbow] in the pool he is not an offered target", async () => {
    const game = await board().build();
    expect(castTargets(game, "bolt")).not.toContain("voli");
    const refused = await game.p1.try((p) => p.cast("bolt", { targets: "voli" }));
    expect(refused.ok).toBe(false);
  });

  test("control — with [rainbow][rainbow] available Volibear becomes targetable and the 2 is charged", async () => {
    const game = await board({ fury: 1, rainbow: 2 }).build();
    expect(castTargets(game, "bolt")).toContain("voli");
    const before = Object.values(game.p1.resources().power).reduce((a, b) => a + b, 0);
    await game.p1.cast("bolt", { targets: "voli" });
    await game.settle();
    const after = Object.values(game.p1.resources().power).reduce((a, b) => a + b, 0);
    expect(before - after).toBe(2); // [Deflect 2] — Power of any Domain
    expect(game.state("voli").damage).toBe(2);
  });

  test("an attached Equipment's own rules text is inactive: the Shield's printed [Equip] cannot be activated while it is worn", async () => {
    const game = await board({ calm: 2, fury: 1 }).build();
    expect(game.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect(game.p2.legal().some((o) => o.moveId === "equipCard")).toBe(false);
  });
});
