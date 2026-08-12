/**
 * Ruling eab7181b3fbf48b6 — Ezreal, Prodigy (SFD-149 → sfd-149-221) · [3][chaos] 3 [Might]
 *   "Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Blade Dancer (SFD-195 → sfd-195-221, Irelia's Legend) "When you choose a friendly unit, you may exhaust me
 *     and pay [rainbow] to ready it."
 *
 * Q: Does Ezreal's discount apply to Irelia's optional [rainbow] payment?
 * A: No. "Additional cost" is a defined term — [Repeat], [Accelerate] and cards that literally say "as an additional
 *    cost". A "you may pay X to …" on an ability is an optional payment, not an additional cost, so it is unreduced.
 * Rules: 356 (additional costs), 425 / 822 ([Repeat] / [Accelerate] are additional costs), 383.3.b (a trigger's
 *        "you may pay" is its base cost, not an additional one).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-149-221";
const BLADE_DANCER = "sfd-195-221";
const BELLOWS_BREATH = "sfd-080-221"; // [1][mind], [Repeat] [1][mind] — a real additional cost
const DISCIPLINE = "ogn-058-298"; // [Reaction] [2] "+2 Might this turn. Draw 1." — chooses a friendly unit

/** P1's turn with Irelia's Legend, an exhausted ally, Discipline in hand, [2] energy and NO [rainbow]. */
function dancerBoard(withEzreal: boolean, rainbow: number) {
  const s = scenario()
    .legend(P1, BLADE_DANCER, "dancer")
    .resources(P1, { energy: 2, power: rainbow > 0 ? { rainbow } : {} })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally", { exhausted: true })
    .hand(P1, DISCIPLINE, "disc");
  return withEzreal ? s.unit(P1, "base", EZREAL, "ezreal") : s;
}

describe("Ruling eab7181b3fbf48b6 — Ezreal discounts additional costs, not a trigger's optional payment", () => {
  test("control: Ezreal DOES take [1] off a real additional cost — Bellows Breath's [Repeat] [1][mind]", async () => {
    const plain = await scenario()
      .resources(P1, { energy: 4, power: { mind: 4 } })
      .unit(P2, "base", { might: 9, name: "Target" }, "x")
      .hand(P1, BELLOWS_BREATH, "bb")
      .build();
    await plain.p1.cast("bb", { repeat: 1, targets: ["x"] });
    expect(plain.p1.resources()).toEqual({ energy: 2, power: { mind: 2 } }); // [1][mind] × 2

    const withEzreal = await scenario()
      .resources(P1, { energy: 4, power: { mind: 4 } })
      .unit(P1, "base", EZREAL, "ezreal")
      .unit(P2, "base", { might: 9, name: "Target" }, "x")
      .hand(P1, BELLOWS_BREATH, "bb")
      .build();
    await withEzreal.p1.cast("bb", { repeat: 1, targets: ["x"] });
    expect(withEzreal.p1.resources()).toEqual({ energy: 3, power: { mind: 2 } }); // the [Repeat]'s [1] was waived
  });

  test("premise: with a [rainbow] in the pool Blade Dancer's optional payment is payable and readies the ally", async () => {
    const game = await dancerBoard(false, 1).build();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(false);
    expect(game.state("dancer").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("with Ezreal out and ZERO [rainbow], Blade Dancer's payment is still unaffordable — no discount applied", async () => {
    const game = await dancerBoard(true, 0).build();
    expect(game.p1.power("rainbow")).toBe(0);
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    const r = await game.p1.try((p) => p.yes());
    expect(r.ok).toBe(false); // a reduced cost would have been [0] and acceptable
    await game.p1.no();
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(true); // never readied
    expect(game.state("dancer").isExhausted).toBe(false); // the Legend was not exhausted either
  });

  test("and Ezreal changes nothing about the amount: with exactly one [rainbow] it costs exactly that one", async () => {
    const game = await dancerBoard(true, 1).build();
    await game.p1.cast("disc", { targets: "ally" });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0); // full price, not discounted to zero
    expect(game.state("ally").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
