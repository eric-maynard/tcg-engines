/**
 * Ruling d33204436574e851 — Irelia, Fervent (SFD-057 → sfd-057-221) · Champion Unit · Calm · 5 · 4 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.) When you choose or ready me, give me
 *      +1 [Might] this turn."
 *   × Defiant Dance (SFD-196 → sfd-196-221) · Spell · [Reaction] · 1 + [rainbow] · "Give a unit +2 [Might] this turn and
 *     another unit -2 [Might] this turn."
 *
 * Q: Only two units exist: my Irelia and my opponent's Irelia. Can I Defiant Dance +2 onto mine and simply refuse to pay
 *    the Deflect on theirs so nobody gets the -2?
 * A: No. Deflect is a MANDATORY additional cost: choosing their Irelia requires paying it, and you cannot play the spell
 *    while opting out of one of its effects. Either you pay everything (both effects apply) or the spell can't be played.
 * Rules: 356.2.a.2 / 809.1.d (Deflect imposes a Mandatory Additional Cost), 809.1.c (any Domain pays it), 355 (a spell
 *        must choose all required targets — "a unit … and another unit").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const DEFIANT_DANCE = "sfd-196-221";

/** P1's turn. The ONLY units: P1's Irelia and P2's Irelia (both 4). P1 holds Defiant Dance, 1 energy and `power` rainbow. */
function board(power: number) {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: power } })
    .unit(P1, "base", IRELIA, "mine")
    .unit(P2, "base", IRELIA, "theirs")
    .hand(P1, DEFIANT_DANCE, "dd");
}

describe("Ruling d33204436574e851 — you can't skip the Deflect (and the -2) on the only 'another unit'", () => {
  test("with just the base cost (1 + one power) Defiant Dance is NOT playable at all: the only legal pairing needs their Deflect Irelia as the second unit, and that surcharge can't be paid — nothing is cast, nothing spent", async () => {
    const game = await board(1).build();
    expect(game.state("theirs").keywords).toContain("Deflect");
    expect(game.p1.can("cast", "dd")).toBe(false);
    const r = await game.p1.try((p) => p.cast("dd", { targets: ["mine", "theirs"] }));
    expect(r.ok).toBe(false);
    // No "half" cast either: a lone target is never a legal way to play it.
    const solo = await game.p1.try((p) => p.cast("dd", { targets: "mine" }));
    expect(solo.ok).toBe(false);
    expect(game.zoneOf("dd")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.state("mine").might).toBe(4);
    expect(game.state("theirs").might).toBe(4);
  });

  test("the spell only ever offers BOTH units as its two distinct targets — there is no variant that names my Irelia alone", async () => {
    const game = await board(2).build();
    const targets = game.p1.option("cast", "dd")?.fields.find((f) => f.name === "targets");
    expect(targets).toMatchObject({ max: 2, min: 2, required: true });
    expect(targets?.options).toEqual(expect.arrayContaining([["mine", "theirs"]]));
    expect((targets?.options ?? []).every((o) => Array.isArray(o) && o.length === 2)).toBe(true);
  });

  test("with one extra power P1 pays 1 + [rainbow] + the Deflect [rainbow] (all of it) and the spell resolves AS WRITTEN: my Irelia +2 (+1 from her own 'when you choose me') = 7, their Irelia −2 = 2", async () => {
    const game = await board(2).build();
    expect(game.p1.can("cast", "dd")).toBe(true);
    await game.p1.cast("dd", { targets: ["mine", "theirs"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // Deflect paid — not optional
    expect(game.chain()[0]).toMatchObject({ cardId: "dd", targets: ["mine", "theirs"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dd")).toBe("trash");
    expect(game.state("mine").might).toBe(7); // 4 + 2 + 1 (chosen by her controller's spell)
    expect(game.state("theirs").might).toBe(2); // 4 − 2 — the -2 is not skippable
    expect(game.violations()).toEqual([]);
  });
});
