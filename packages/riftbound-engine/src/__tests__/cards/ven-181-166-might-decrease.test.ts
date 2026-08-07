/**
 * Gangplank, Naval — ven-181-166 · [Empowered] Might-decrease replacement
 *
 *   [Empowered] If a spell or ability that chooses me would stun me, give me -[Might], or
 *   return me to hand, give me +3 [Might] instead.
 *
 * Rules: 366–372 (replacement effects — the modifier that WOULD be applied is swapped out before
 * it happens), 433.1.a (a "-N Might this turn" is one turn-scoped modifier).
 *
 * The point of this file: an ordinary "give a unit -N [Might]" spell must go through the same
 * replacement path as a Might SWAP (see rulings/gangplank-naval-a0bd4311080c62f3). Smoke Screen
 * (ogn-093-298, "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]") is the plain case.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const GANGPLANK_NAVAL = "ven-181-166";
const SMOKE_SCREEN = "ogn-093-298";

function board(empowered: boolean) {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GANGPLANK_NAVAL, "gp", empowered ? { empowered: true } : undefined)
    .hand(P1, SMOKE_SCREEN, "smoke");
}

describe("Gangplank, Naval (ven-181-166) — [Empowered] Might-decrease replacement", () => {
  test("premise: Empowered Gangplank reads 6 Might at bf1", async () => {
    const game = await board(true).build();
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.state("gp").might).toBe(6);
  });

  test("control (NOT Empowered): Smoke Screen applies its raw -4 → 2 Might", async () => {
    const game = await board(false).build();
    await game.p1.cast("smoke", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").mightModifier).toBe(-4);
    expect(game.state("gp").might).toBe(2);
  });

  test("Empowered: the -4 is replaced by +3 → 9 Might (366–372)", async () => {
    const game = await board(true).build();
    await game.p1.cast("smoke", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").mightModifier).toBe(3);
    expect(game.state("gp").might).toBe(9);
  });

  test("the replacement is a modifier too: it lasts only this turn", async () => {
    const game = await board(true).build();
    await game.p1.cast("smoke", { targets: "gp" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("gp").might).toBe(6);
  });
});
