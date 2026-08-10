/**
 * Ruling 0701c2038f90e848 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · 2
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) [Action] · 2 + [chaos] "Move a friendly unit and ready it."
 *
 * Q: Two of my units defend a battlefield with Mask out. The opponent attacks; can I move one away in
 *    the showdown so the remaining one gets Mask's "defends alone" +1?
 * A: No. Attack/defend triggers fire only when a unit first GAINS the designation in a combat. Both were
 *    designated together (not alone → no trigger); moving one away does not re-designate the other, so
 *    Mask never triggers. (Only a unit newly arriving alone would gain the designation "for the first time".)
 * Rules: 383.4.e/f (attack/defend triggers checked once, on gaining the designation), 740.2.a (alone).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1 holds bf1 with Guard A + Guard B and has Mask in base, Ride the Wind in hand (2 + [chaos]). P2's Raider (3) in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "bf1", { might: 3, name: "Guard A" }, "ga")
    .unit(P1, "bf1", { might: 2, name: "Guard B" }, "gb")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling 0701c2038f90e848 — moving one of two defenders away does not make Mask of Foresight trigger for the other", () => {
  test("Raider attacks two defenders: both gain the defender designation together, Mask sees 'not alone' → no trigger, no +1 on either", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("ga").combatRole).toBe("defender");
    expect(game.state("gb").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]);
    expect(game.state("ga").might).toBe(3);
    expect(game.state("gb").might).toBe(2);
  });

  test("P1 takes Focus and Rides the Wind Guard B back to base: Guard A is now the lone defender but was NOT re-designated → Mask does not trigger, Guard A stays 3", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "gb" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
    }
    // Let Ride the Wind resolve (both pass), stop before combat damage.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("gb")).toBe("base");
    expect(game.state("gb").isReady).toBe(true); // "...and ready it"
    expect(game.p1.units("bf1")).toEqual(["ga"]); // alone now
    expect(game.state("ga").combatRole).toBe("defender"); // still the same designation, never re-gained
    // The ruling: no Mask trigger was created, Guard A has no +1.
    expect(game.chain()).toEqual([]);
    expect(game.state("ga").might).toBe(3);
    expect(game.state("ga").mightModifier).toBe(0);
  });

  test("outcome confirms it: Guard A (3, no bonus) and Raider (3) trade — with Mask's +1 Guard A would have survived and held", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("rtw", { targets: "gb" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
    }
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash"); // took 3 ≥ 3 — no +1
    expect(game.locationOf("gb")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("control: a unit that gains the defender designation while ALREADY alone does trigger Mask (+1 → the 3-Might guard holds against the 3-Might Raider)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "bf1", { might: 3, name: "Guard A" }, "ga")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.state("ga").might).toBe(4);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("ga")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
