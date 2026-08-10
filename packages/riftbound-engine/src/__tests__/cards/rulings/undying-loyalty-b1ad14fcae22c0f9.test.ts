/**
 * Ruling b1ad14fcae22c0f9 — Undying Loyalty (UNL-168 → unl-168-219) · Spell · Order · 2+[order] · Action
 *     "This costs [2] less if you choose a Bird, Cat, Dog, or Poro. Play a unit with cost no more than [2] and no more
 *      than [rainbow] from your trash, ignoring its cost."
 *   × Bird token (unl-t02) — cited as an example of a tagged unit.
 *
 * Q: Do you choose the unit as you play the spell and pay 2 less if it is a Bird/Cat/Dog/Poro — or pay full, choose,
 *    then get energy back?
 * A: Choose first (355), then determine total cost with the discount already applied (356), then pay (357). Choosing a
 *    Poro makes the spell cost [0]+[order]; there is never a refund. If no valid unit is in your trash you cannot play
 *    the spell at all; the choice is locked when the spell goes on the chain.
 * Rules: 355 (make choices), 356 (determine total cost), 357 (pay costs), 355.8 (locked targets).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const UNDYING_LOYALTY = "unl-168-219";
const STALWART_PORO = "ogn-052-298"; // Unit · Calm · 2 · 2 Might · PORO
const GRUNT = { cardType: "unit", energyCost: 2, might: 2, name: "Grunt" } as const; // untagged 2-cost unit

function board(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { order: 1 } })
    .trash(P1, STALWART_PORO, "poro")
    .trash(P1, GRUNT, "grunt")
    .hand(P1, UNDYING_LOYALTY, "ul");
}

describe("Ruling b1ad14fcae22c0f9 — Undying Loyalty: choose the unit first, discount applied before paying", () => {
  test("the unit in the trash is a play-time choice of the spell: both the Poro and the Grunt are offered as `targets` when casting", async () => {
    const game = await board(2).build();
    const offered = (game.p1.option("cast", "ul")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(new Set(offered as string[])).toEqual(new Set(["poro", "grunt"]));
  });

  test("choosing the PORO: the total cost is [0]+[order] — P1 keeps both energy (no pay-then-refund), spends the power, and the choice is locked on the chain item", async () => {
    const game = await board(2).build();
    await game.p1.cast("ul", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ul", controller: P1, targets: ["poro"] })]);
    await game.settle();
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base"); // played from trash, ignoring its cost
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } }); // the Poro's own [2] was ignored too
  });

  test("choosing the untagged GRUNT: full [2]+[order] is paid up front", async () => {
    const game = await board(2).build();
    await game.p1.cast("ul", { targets: "grunt" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("because the discount is applied BEFORE paying, with only [0]+[order] available the Poro is a legal choice but the Grunt is not", async () => {
    const game = await board(0).build();
    expect(game.p1.can("cast", "ul")).toBe(true);
    const offered = (game.p1.option("cast", "ul")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["poro"]);
    const bad = await game.p1.try((p) => p.cast("ul", { targets: "grunt" }));
    expect(bad.ok).toBe(false);
    await game.p1.cast("ul", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("legality: with no valid unit in the trash the spell cannot be played at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .trash(P1, { cardType: "unit", energyCost: 4, might: 4, name: "Big Grunt" }, "big") // cost > 2 → not a valid choice
      .hand(P1, UNDYING_LOYALTY, "ul")
      .build();
    expect(game.p1.can("cast", "ul")).toBe(false);
  });
});
