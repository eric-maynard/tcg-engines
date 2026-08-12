/**
 * Ruling 4234e989544dc0b0 — (no specific card) × Flash (OGS-011 → ogs-011-024,
 *   "[Reaction] Move up to 2 friendly units to base") as the retreat.
 *
 * Q: If a spell's target is retreated during a showdown, does its caster get to re-aim it?
 * A: No. Targets are locked in when the spell is FINALIZED, which happens before anybody can react. The
 *    opponent may then retreat the target, and the spell simply does nothing to it — it is never
 *    re-pointed at another unit.
 * Rules: 355.5 / 402.2 (targets chosen at finalization, before priority), 340 (only then does the
 *        opponent get priority), 359.3.e.5 / 355.15 (a target that is no longer legal is dropped, never
 *        replaced).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";

/** [Action] "Deal 3 to a unit at a battlefield." — retreating to base takes the target out of range. */
const SNIPE = {
  abilities: [
    { effect: { amount: 3, target: { location: "battlefield", type: "unit" }, type: "damage" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  rulesText: "[Action] Deal 3 to a unit at a battlefield.",
  timing: "action",
} as const;

/** P1's turn. P2 holds bf1 with a 3-Might Foe and a 4-Might Other; P2 has Flash and the energy for it. */
const board = () =>
  scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 4, name: "Other" }, "other")
    .hand(P1, SNIPE, "snipe")
    .hand(P2, FLASH, "flash");

describe("Ruling 4234e989544dc0b0 — a retreated target is not re-assigned; the spell just misses", () => {
  test("the target is locked onto the chain item at once — P2's first window comes after that", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snipe", targets: ["foe"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("P2 Flashes the target home: the chain item still names it, and nobody is asked to pick a new one", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "foe" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("foe")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snipe", targets: ["foe"] })]);
    expect(game.decision()).toMatchObject({ kind: "action" }); // no re-target pick appears
  });

  test("…and when the spell resolves it does nothing: no damage anywhere, and the untouched Other is not hit instead", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("snipe")).toBe("trash");
    expect(game.state("foe").damage).toBe(0);
    expect(game.state("other").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: left where it was, the same spell deals its 3", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 3 damage on 3 Might
    expect(game.state("other").damage).toBe(0);
  });
});
