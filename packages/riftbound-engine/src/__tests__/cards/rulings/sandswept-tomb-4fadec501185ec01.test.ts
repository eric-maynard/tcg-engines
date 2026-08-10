/**
 * Ruling 4fadec501185ec01 — Sandswept Tomb (VEN-164 → ven-164-166) · Battlefield "Each spell that chooses one or more
 *   units here that are friendly to it costs [rainbow] less."
 *   × Rampage (VEN-083 → ven-083-166) · Spell · Body · 3 "As you play this, you may pay [body] as an additional cost.
 *     Choose a friendly unit and an enemy unit. If you paid the additional cost, give the friendly unit +2 [Might] this
 *     turn. They deal damage equal to their Mights to each other."  (+ Pouty Poro ogn-013-298 · 2 · [Deflect])
 *
 * Q: Can the Tomb's [rainbow] discount pay for the Deflect additional cost when Rampage picks a unit there?
 * A: Yes — if the FRIENDLY unit Rampage chooses is at Sandswept Tomb. Deflect is added as a mandatory additional cost
 *    first, discounts apply afterwards and may reduce additional costs to 0. Deflect 1 → fully covered; Deflect 2 → you
 *    still owe one [rainbow]. If your friendly unit is elsewhere, no discount: pay the full Deflect cost.
 * Rules: 356.2.a.2 / 809.1.d (Deflect = additional cost), 356.4 / 356.4.f (discounts applied after, may reduce
 *        additional costs), 740.1.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SANDSWEPT_TOMB = "ven-164-166";
const RAMPAGE = "ven-083-166";
const POUTY_PORO = "ogn-013-298"; // Deflect 1
const DEFLECT_TWO = { abilities: [{ keyword: "Deflect", type: "keyword", value: 2 }], might: 3, name: "Shielded Two" } as const;

/**
 * P1's turn. P1 controls a LIVE Sandswept Tomb with Local (4) there and Homebody (4) in base. P2's base: Pouty Poro
 * (Deflect 1), Shielded Two (Deflect 2), Plain (3, no Deflect). Rampage in hand; resources vary per test.
 */
function board(power: number) {
  return scenario()
    .resources(P1, { energy: 3, power: power > 0 ? { body: power } : {} })
    .battlefield("tomb", { controller: P1, def: SANDSWEPT_TOMB, inert: false })
    .unit(P1, "tomb", { might: 4, name: "Local" }, "local")
    .unit(P1, "base", { might: 4, name: "Homebody" }, "homebody")
    .unit(P2, "base", POUTY_PORO, "poro")
    .unit(P2, "base", DEFLECT_TWO, "two")
    .unit(P2, "base", { might: 3, name: "Plain" }, "plain")
    .hand(P1, RAMPAGE, "ramp");
}

/** Legal [friendly, enemy] pairs currently offered for Rampage. */
function legalPairs(game: Game): string[] {
  const opts = game.p1.option("cast", "ramp")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  return (opts as string[][]).map((t) => t.join("→")).sort();
}

describe("Ruling 4fadec501185ec01 — Sandswept Tomb's discount can pay Rampage's Deflect tax (friendly unit at the Tomb)", () => {
  test("Deflect 1, friendly at the Tomb, ZERO power: [Local → Poro] is legal (3 + [rainbow] − [rainbow] = 3) while [Homebody → Poro] is not; casting it spends exactly 3 energy and no power, and the fight happens (Poro dies, Local takes 2)", async () => {
    const game = await board(0).build();
    expect(game.state("poro").keywords).toContain("Deflect");
    const pairs = legalPairs(game);
    expect(pairs).toContain("local→poro");
    expect(pairs).not.toContain("homebody→poro"); // no discount off the Tomb → the [rainbow] is owed and unpayable
    expect(pairs).not.toContain("local→two"); // Deflect 2: one [rainbow] still owed
    await game.p1.cast("ramp", { targets: ["local", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("ramp")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash"); // 4 ≥ 2
    expect(game.state("local").damage).toBe(2);
  });

  test("Deflect 2, friendly at the Tomb: with ONE power [Local → Shielded Two] becomes legal and casting it spends 3 energy + that single power (Tomb covered the other)", async () => {
    const game = await board(1).build();
    expect(legalPairs(game)).toContain("local→two");
    await game.p1.cast("ramp", { targets: ["local", "two"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("two")).toBe("trash"); // 4 ≥ 3
    expect(game.state("local").damage).toBe(3);
  });

  test("caveat — friendly unit NOT at the Tomb: no discount at all. With zero power only the Deflect-less Plain can be paired with Homebody; with one power [Homebody → Poro] is legal and the full [rainbow] is paid", async () => {
    const broke = await board(0).build();
    expect(legalPairs(broke)).toContain("homebody→plain");
    expect(legalPairs(broke)).not.toContain("homebody→poro");
    const r = await broke.p1.try((p) => p.cast("ramp", { targets: ["homebody", "poro"] }));
    expect(r.ok).toBe(false);

    const funded = await board(1).build();
    expect(legalPairs(funded)).toContain("homebody→poro");
    await funded.p1.cast("ramp", { targets: ["homebody", "poro"] });
    expect(funded.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // Deflect paid in full
    await funded.settle();
    expect(funded.zoneOf("poro")).toBe("trash");
    expect(funded.state("homebody").damage).toBe(2);
    expect(funded.violations()).toEqual([]);
  });
});
