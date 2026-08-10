/**
 * Ruling 3c3787e73de39135 — Allay, Eager Admirer (unl-041-219) [× a printed-Deflect unit, e.g. a Vex]
 *   Allay: 3 Might, "[Deflect] … While I'm at a battlefield, your other units here have [Deflect]."
 *
 * Q: Does Allay stack Deflect?
 * A: Yes. Per 809.2 Deflect from multiple sources sums: a unit with printed Deflect 1 at Allay's battlefield has Deflect 2,
 *    so opponents pay 2 Power to choose it. Two Allays together each have Deflect 2 (own printed 1 + 1 granted by the other).
 * Rules: 809.1.b.3 (bare Deflect = Deflect 1), 809.1.c (opponents pay [rainbow] per Deflect to choose), 809.2 (values sum).
 *
 * Note: the ruling names Vex, Cheerless (sfd-146-221) as its printed-Deflect example, but that card's printed text in our
 * card data carries no Deflect; the sibling champion Vex, Apathetic (unl-150-219, printed "[Deflect]") stands in for
 * "a unit with Deflect 1".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALLAY = "unl-041-219";
const VEX_APATHETIC = "unl-150-219"; // 4 Might, printed [Deflect]
const VOID_SEEKER = "ogn-024-298"; // 3 + [fury]: "Deal 4 to a unit at a battlefield. Draw 1."

const SPARE = 3;
/** Void Seeker's own cost (3 + fury) plus 3 spare off-domain power to cover any Deflect surcharge. */
const P2_POOL = { energy: 3, power: { fury: 1, mind: SPARE } };

/** Extra power P2 had to spend beyond Void Seeker's printed [fury] to choose `target`. */
async function deflectTax(game: Game, target: string): Promise<number> {
  await game.p2.cast("voidSeeker", { targets: target });
  expect(game.p2.energy()).toBe(0);
  expect(game.p2.power("fury")).toBe(0);
  return SPARE - game.p2.power();
}

function vexWithAllay(allayAt: "bf1" | "base") {
  return scenario()
    .active(P2)
    .resources(P2, P2_POOL)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VEX_APATHETIC, "vex")
    .unit(P1, allayAt, ALLAY, "allay")
    .hand(P2, VOID_SEEKER, "voidSeeker");
}

function twoAllays() {
  return scenario()
    .active(P2)
    .resources(P2, P2_POOL)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ALLAY, "allayA")
    .unit(P1, "bf1", ALLAY, "allayB")
    .hand(P2, VOID_SEEKER, "voidSeeker");
}

describe("Ruling 3c3787e73de39135 — Allay's granted Deflect stacks with existing Deflect (809.2)", () => {
  test("printed Deflect 1 + Allay here: the Vex shows Deflect from both sources and choosing it costs the opponent 2 extra Power", async () => {
    const game = await vexWithAllay("bf1").build();
    expect(game.state("vex").keywords).toContain("Deflect");
    expect(game.state("vex").grantedKeywords.map((k) => k.keyword)).toContain("Deflect");
    expect(await deflectTax(game, "vex")).toBe(2);
    await game.settle();
    expect(game.zoneOf("vex")).toBe("trash"); // 4 damage ≥ 4 Might — the spell did resolve
    expect(game.violations()).toEqual([]);
  });

  test("with only 1 spare Power the Deflect-2 Vex cannot be chosen at all, while Allay herself (Deflect 1 only — her grant is to OTHER units) can", async () => {
    const game = await vexWithAllay("bf1").resources(P2, { energy: 3, power: { fury: 1, mind: 1 } }).build();
    const r = await game.p2.try((p) => p.cast("voidSeeker", { targets: "vex" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("voidSeeker")).toBe("hand");
    await game.p2.cast("voidSeeker", { targets: "allay" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
  });

  test("control: Allay in base (not 'here') grants nothing — the Vex is plain Deflect 1 and costs +1", async () => {
    const game = await vexWithAllay("base").build();
    expect(game.state("vex").grantedKeywords).toEqual([]);
    expect(await deflectTax(game, "vex")).toBe(1);
  });

  test("two Allays at the same battlefield: each has its own Deflect 1 plus Deflect 1 from the other → choosing either costs +2", async () => {
    const gameA = await twoAllays().build();
    for (const id of ["allayA", "allayB"]) {
      expect(gameA.state(id).keywords).toContain("Deflect");
      expect(gameA.state(id).grantedKeywords.map((k) => k.keyword)).toContain("Deflect");
    }
    expect(await deflectTax(gameA, "allayA")).toBe(2);
    const gameB = await twoAllays().build();
    expect(await deflectTax(gameB, "allayB")).toBe(2);
    await gameB.settle();
    expect(gameB.zoneOf("allayB")).toBe("trash");
    // The survivor loses the other's grant once alone: back to a single (printed) Deflect.
    expect(gameB.state("allayA").grantedKeywords).toEqual([]);
    expect(gameB.violations()).toEqual([]);
  });
});
