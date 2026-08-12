/**
 * Ruling c0f6a3dc27aa203b — Vex, Cheerless (SFD-146 → sfd-146-221) · Champion Unit · Chaos · [5][chaos] · 5 Might
 *     "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells cost
 *      [1][rainbow] more."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · "[Deflect] (Opponents must pay [rainbow] to choose me with a spell
 *     or ability.)"
 *
 * Q: With Vex out, does a 3-Energy spell aimed at a [Deflect] unit just cost 2 Energy and dodge the [Deflect]?
 * A: No — the [Deflect] surcharge is not skipped, it is offset. The mandatory additional cost is added to the
 *    spell first ([3] + [rainbow]) and only then is Vex's discount applied to that total ([3][rainbow] − [1]
 *    [rainbow]) — so you end up paying 2 Energy and no Power. Same number, different reason.
 * Rules: 356.4 (additional costs are summed before discounts), 809.1.c.1 ([Deflect] is a mandatory additional
 *        cost), 205 (cost payment).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX_CHEERLESS = "sfd-146-221";
const POUTY_PORO = "ogn-013-298";
/** A plain 3-Energy Action spell so the arithmetic is visible with nothing else in the way. */
const ZAP = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 3,
  name: "Zap",
  timing: "action",
} as const;

/** P1's turn 3 with [5] and 3 spare [rainbow]. P2 holds bf1 with a Deflect Poro and a plain unit. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", VEX_CHEERLESS, "vex")
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
    .hand(P1, ZAP, "zap");
}

describe("Ruling c0f6a3dc27aa203b — Vex's discount offsets the [Deflect] surcharge; it does not let you skip it", () => {
  test("baseline without Vex in combat: the 3-Energy spell on the [Deflect] Poro costs [3] plus one [rainbow]", async () => {
    const game = await board().build();
    expect(game.state("vex").combatRole).toBeNull(); // Vex is in base, her static is off
    await game.p1.cast("zap", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 2 } }); // 5−3 energy, 3−1 rainbow
  });

  test("baseline without Vex, plain target: [3] and no Power at all — the extra [rainbow] above really is the [Deflect]", async () => {
    const game = await board().build();
    await game.p1.cast("zap", { targets: "plain" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 3 } });
  });

  test("Vex in combat, plain target: her discount takes the spell to [2] and nothing else changes", async () => {
    const game = await board().build();
    await game.p1.move("vex", "bf1");
    expect(game.state("vex").combatRole).toBe("attacker");
    await game.p1.cast("zap", { targets: "plain" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 3 } }); // 5−2 energy
  });

  test("ruling: Vex in combat, [Deflect] target → [3]+[rainbow] summed first, then −[1][rainbow]: exactly 2 Energy and no Power leaves the pool", async () => {
    const game = await board().build();
    await game.p1.move("vex", "bf1");
    const before = game.p1.resources();
    await game.p1.cast("zap", { targets: "poro" });
    const after = game.p1.resources();
    expect(before.energy - after.energy).toBe(2);
    expect(before.power.rainbow! - (after.power.rainbow ?? 0)).toBe(0);
    expect(after).toEqual({ energy: 3, power: { rainbow: 3 } });
  });

  test("…and the spell really did choose the [Deflect] unit: the damage lands on the Poro", async () => {
    const game = await board().build();
    await game.p1.move("vex", "bf1");
    await game.p1.cast("zap", { targets: "poro" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break;
    }
    expect(game.state("poro").damage).toBe(1);
    expect(game.state("plain").damage).toBe(0);
    // NB: game.violations() reports a `costPaid` note here — the harness invariant compares the pool delta against
    // the PRINTED energy cost and does not know about Vex's discount. Not a rules disagreement.
  });
});
