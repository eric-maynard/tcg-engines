/**
 * Ruling e254c1e6fe0d792b — Switcheroo (sfd-145-221) · Action spell · Chaos · 2 + [chaos]
 *   "[Hidden] [Action] Swap the Might of two units at the same battlefield this turn."
 *   × B.F. Sword (sfd-161-221) · Equipment · +3 Might while attached
 *   × Discipline (ogn-058-298) "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Are existing equipment bonuses / passive effects counted again after Switcheroo resolves?
 * A: No. Switcheroo reads CURRENT Might (equipment, battlefield passives, conditionals already included),
 *    computes the difference and applies it as ± modifiers this turn. Example: 2 base + 3 equipment = 5 vs an
 *    enemy 1 → difference 4 → yours becomes 1, theirs 5; the +3 is not re-added afterwards. Modifiers that
 *    START applying after Switcheroo resolved apply normally on top; they don't change what Switcheroo did.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const BF_SWORD = "sfd-161-221";
const DISCIPLINE = "ogn-058-298";

/**
 * The ruling's example. P1's turn; at bf1 (P1-controlled): P1's "bearer" (2 base Might) wearing B.F. Sword
 * (+3) and P2's 1-Might "weakling". P1 has 2 + [chaos] for Switcheroo plus 2 more for Discipline.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Sword Bearer" }, "bearer", { equippedWith: ["sword"] } as Record<string, unknown>)
    .gear(P1, BF_SWORD, "sword", { attachedTo: "bearer" } as Record<string, unknown>)
    .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weakling")
    .hand(P1, SWITCHEROO, "switcheroo")
    .hand(P1, DISCIPLINE, "discipline");
}

describe("Ruling e254c1e6fe0d792b — Switcheroo swaps CURRENT Might; existing bonuses are not re-counted", () => {
  test("premise: the bearer's current Might is 5 (2 base + 3 from the attached B.F. Sword); the weakling is 1; both are at the same battlefield", async () => {
    const game = await board().build();
    expect(game.state("sword").attachedTo).toBe("bearer");
    expect(game.state("bearer")).toMatchObject({ baseMight: 2, might: 5, location: "bf1" });
    expect(game.state("weakling")).toMatchObject({ baseMight: 1, might: 1, location: "bf1" });
  });

  // Expected: Switcheroo (2 + [chaos]) targeting [bearer, weakling] resolves to bearer 5→1 and weakling 1→5
  // — a -4 / +4 pair of this-turn modifiers computed from current Might; the sword stays attached and its
  // +3 is NOT applied again on top (bearer is 1, not 4). Actual: the engine cannot cast Switcheroo at all —
  // its two-target "swap-might" shape enumerates no legal play (only Hide is offered).
  test.failing("BUG: ruling e254c1e6fe0d792b — Switcheroo on [5-Might equipped bearer, 1-Might weakling] → bearer 1, weakling 5; the equipment's +3 is not re-added", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "switcheroo")).toBe(true);
    await game.p1.cast("switcheroo", { targets: ["bearer", "weakling"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("switcheroo")).toBe("trash");
    expect(game.state("sword").attachedTo).toBe("bearer"); // nothing happened to the equipment itself
    expect(game.state("bearer").baseMight).toBe(2); // base Might untouched — it is a modifier swap
    expect(game.state("bearer").might).toBe(1); // 5 - 4, NOT 1 + 3
    expect(game.state("weakling").might).toBe(5); // 1 + 4
  });

  // Expected: a modifier that begins AFTER Switcheroo resolved applies normally: Discipline on the bearer
  // → 1 + 2 = 3 (and the weakling stays 5); Switcheroo's own ±4 is not recomputed. Actual: see above.
  test.failing("BUG: ruling e254c1e6fe0d792b — a NEW +2 (Discipline) after Switcheroo simply stacks: bearer 1 → 3, weakling still 5", async () => {
    const game = await board().build();
    await game.p1.cast("switcheroo", { targets: ["bearer", "weakling"] });
    await game.settle();
    expect(game.state("bearer").might).toBe(1);
    await game.p1.cast("discipline", { targets: "bearer" });
    await game.settle();
    expect(game.state("bearer").might).toBe(3);
    expect(game.state("weakling").might).toBe(5);
  });

  // Expected: all of it is "this turn" — next turn the bearer is back to 5 (2 + sword) and the weakling to 1.
  // Actual: see above (cannot be cast).
  test.failing("BUG: ruling e254c1e6fe0d792b — the swap expires at end of turn: bearer back to 5 (sword still counted once), weakling back to 1", async () => {
    const game = await board().build();
    await game.p1.cast("switcheroo", { targets: ["bearer", "weakling"] });
    await game.settle();
    expect(game.state("bearer").might).toBe(1);
    await game.advanceTurn();
    expect(game.state("bearer").might).toBe(5);
    expect(game.state("weakling").might).toBe(1);
  });
});
