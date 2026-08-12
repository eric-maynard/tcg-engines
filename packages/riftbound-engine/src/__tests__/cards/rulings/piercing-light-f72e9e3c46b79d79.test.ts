/**
 * Ruling f72e9e3c46b79d79 — Piercing Light (SFD-023 → sfd-023-221) · [2][fury], [Repeat] [2][fury]
 *   "Deal 2 to a unit at a battlefield, then deal 2 to up to one OTHER unit."
 *
 * Q: Can I aim Piercing Light only at units in a base?
 * A: No. The first half is mandatory and demands "a unit AT A BATTLEFIELD"; without such a target the spell
 *    cannot be played at all. The optional second half may hit a different unit anywhere (base included), but
 *    it must be a DIFFERENT unit.
 * Rules: 355.8 (a spell needs a legal target for its mandatory instruction), 355.9, FAQ #8905 / #8481.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";

/** P1's turn. `withBattlefieldUnit` decides whether any unit stands at bf1 at all. */
function board(withBattlefieldUnit: boolean) {
  const s = scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Homebody" }, "homebody")
    .unit(P2, "base", { might: 5, name: "Their Homebody" }, "theirHome")
    .hand(P1, PIERCING_LIGHT, "light");
  return withBattlefieldUnit ? s.unit(P2, "bf1", { might: 5, name: "Frontliner" }, "front") : s;
}

describe("Ruling f72e9e3c46b79d79 — Piercing Light's first target must stand at a battlefield", () => {
  test("with every unit in a base the spell is not castable at all", async () => {
    const game = await board(false).build();
    expect(game.p1.can("cast", "light")).toBe(false);
    const r = await game.p1.try((p) => p.cast("light", { targets: ["homebody"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("light")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
  });

  test("the FIRST target slot offers only the unit at the battlefield — never the base units", async () => {
    const game = await board(true).build();
    const field = game.p1.option("cast", "light")?.fields.find((f) => f.arg === "targets");
    const firstSlot = (field?.options ?? []).map((o) => (Array.isArray(o) ? o[0] : o)) as string[];
    expect(firstSlot).toContain("front");
    expect(firstSlot).not.toContain("homebody");
    expect(firstSlot).not.toContain("theirHome");
  });

  test("forcing a base unit into the first slot buys nothing: only the battlefield unit is damaged", async () => {
    const game = await board(true).build();
    await game.p1.cast("light", { targets: ["homebody", "front"] });
    await game.settle();
    expect(game.state("homebody").damage).toBe(0); // never a legal first target
    expect(game.state("front").damage).toBe(2);
    expect(game.state("theirHome").damage).toBe(0);
  });

  test("battlefield unit first, then a DIFFERENT unit (a base unit is fine for the second half)", async () => {
    const game = await board(true).build();
    await game.p1.cast("light", { targets: ["front", "theirHome"] });
    await game.settle();
    expect(game.state("front").damage).toBe(2);
    expect(game.state("theirHome").damage).toBe(2);
    expect(game.zoneOf("light")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the second half needs an OTHER unit: with the battlefield unit alone on the board one instance deals only 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } }) // exactly the base cost — no [Repeat] affordable
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Frontliner" }, "front")
      .hand(P1, PIERCING_LIGHT, "light")
      .build();
    await game.p1.cast("light", { targets: ["front"] });
    await game.settle();
    expect(game.state("front").damage).toBe(2); // not 4 — the "other unit" half had no legal target
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
