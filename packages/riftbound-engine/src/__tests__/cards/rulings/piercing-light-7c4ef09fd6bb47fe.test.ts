/**
 * Ruling 7c4ef09fd6bb47fe — Piercing Light (SFD-023 → sfd-023-221) · Spell · Fury · [2][fury] · [Repeat] [2][fury]
 *   "Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *
 * Q: Does Piercing Light need two targets?
 * A: No. The first "a unit at a battlefield" is required; the second is "up to one OTHER unit", so it is optional —
 *    you may choose zero. If you do take it, it must be a different unit from the first.
 * Rules: 355.10.c ("up to N" may be zero), 355.9.c ("another/other" excludes the already-chosen object),
 *        355.8 (a spell is only playable if its required choices have legal objects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";

describe("Ruling 7c4ef09fd6bb47fe — Piercing Light needs one target, not two", () => {
  test("ruling: with a single unit on the board Piercing Light is still playable — the only offered set is that one unit, and it takes its 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Lone" }, "lone")
      .hand(P1, PIERCING_LIGHT, "pl")
      .build();
    expect(game.p1.can("cast", "pl")).toBe(true);
    expect(game.p1.option("cast", "pl")?.fields.find((f) => f.name === "targets")?.options).toEqual([["lone"]]);
    await game.p1.cast("pl", { targets: "lone" });
    await game.settle();
    expect(game.state("lone").damage).toBe(2);
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with two units the second hit is OPTIONAL — the one-target sets are offered alongside the two-target ones", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "One" }, "one")
      .unit(P2, "bf1", { might: 5, name: "Two" }, "two")
      .hand(P1, PIERCING_LIGHT, "pl")
      .build();
    const sets = game.p1.option("cast", "pl")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(sets).toContainEqual(["one"]);
    expect(sets).toContainEqual(["two"]);
    expect(sets).toContainEqual(["one", "two"]);
    expect(sets).toContainEqual(["two", "one"]);
  });

  test("ruling: the second unit must be a DIFFERENT one — the same unit is never offered twice, and naming it twice is refused", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "One" }, "one")
      .unit(P2, "bf1", { might: 5, name: "Two" }, "two")
      .hand(P1, PIERCING_LIGHT, "pl")
      .build();
    const sets = game.p1.option("cast", "pl")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(sets).not.toContainEqual(["one", "one"]);
    expect((await game.p1.try((p) => p.cast("pl", { targets: ["one", "one"] }))).ok).toBe(false);
  });

  test("taking only the first half really deals only one instance: One takes 2, Two is untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "One" }, "one")
      .unit(P2, "bf1", { might: 5, name: "Two" }, "two")
      .hand(P1, PIERCING_LIGHT, "pl")
      .build();
    await game.p1.cast("pl", { targets: ["one"] });
    await game.settle();
    expect(game.state("one").damage).toBe(2);
    expect(game.state("two").damage).toBe(0);
  });

  test("and taking both halves hits both for 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "One" }, "one")
      .unit(P2, "bf1", { might: 5, name: "Two" }, "two")
      .hand(P1, PIERCING_LIGHT, "pl")
      .build();
    await game.p1.cast("pl", { targets: ["one", "two"] });
    await game.settle();
    expect(game.state("one").damage).toBe(2);
    expect(game.state("two").damage).toBe(2);
  });
});
