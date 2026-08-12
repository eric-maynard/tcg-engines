/**
 * Ruling 1c1ee1f15d68278c — Vex, Apathetic (UNL-150 → unl-150-219) · Champion · Chaos · 4 Might
 *     "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me
 *     with a spell or ability.)" — the played unit that carries Deflect.
 *   × Smoke Screen (ogn-093-298) · Reaction · [2][mind] · "Give a unit -4 [Might] this turn" — the contrast
 *     case: a real CHOICE, which Deflect does tax.
 *
 * Q: Does Vex, Apathetic's stun "go through" Deflect?
 * A: Yes. Vex programmatically selects "the unit that was just played" — nobody chooses it, so it is not a
 *    target and Deflect (which only taxes choosing) never applies: no [rainbow] is paid and the unit is stunned.
 * Rules: 355.10.d (programmatic selection is not choosing/targeting), 809.1 (Deflect taxes spells and
 *        abilities an opponent controls that CHOOSE me).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const POUTY_PORO = "ogn-013-298";
const SMOKE_SCREEN = "ogn-093-298";

/** P2's turn. P1's Vex holds bf1; P2 has the Deflect Poro in hand and plenty of resources. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VEX, "vex")
    .hand(P2, POUTY_PORO, "poro")
    .resources(P2, { energy: 6, power: { fury: 2 } })
    .hand(P1, SMOKE_SCREEN, "smoke")
    .resources(P1, { energy: 2, power: { mind: 1, rainbow: 1 } });
}

describe("Ruling 1c1ee1f15d68278c — Vex's stun selects the played unit programmatically, so Deflect does not apply", () => {
  test("P2 plays the Deflect-carrying Pouty Poro: Vex's trigger stuns it with no [rainbow] tax and no choose-target prompt for P1", async () => {
    const game = await board().build();
    const rainbowBefore = game.p1.power("rainbow");
    await game.p2.play("poro");
    await game.settle();
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.state("poro").isStunned).toBe(true);
    expect(game.state("poro").grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    // Nothing was ever chosen, so nothing was paid and no prompt was raised.
    expect(game.p1.power("rainbow")).toBe(rainbowBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a real choice IS taxed: P1's Smoke Screen naming a Pouty Poro is a chosen target and consumes the [rainbow]", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, SMOKE_SCREEN, "smoke")
      .resources(P1, { energy: 2, power: { mind: 1, rainbow: 1 } })
      .build();
    expect(game.p1.can("cast", "smoke")).toBe(true);
    await game.p1.cast("smoke", { targets: "poro" });
    expect(game.p1.power("rainbow")).toBe(0); // Deflect's surcharge was charged for CHOOSING it
    await game.settle();
    expect(game.state("poro").might).toBe(1); // 2 - 4, to a minimum of 1
  });

  test("control: with Vex in base her ability does not fire at all — the Poro enters unstunned", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", VEX, "vex")
      .hand(P2, POUTY_PORO, "poro")
      .resources(P2, { energy: 6, power: { fury: 2 } })
      .build();
    await game.p2.play("poro");
    await game.settle();
    expect(game.state("poro").isStunned).toBe(false);
  });
});
