/**
 * Ruling 391ea0b5e292000d — Ezreal, Prodigy (SFD-149 → sfd-149-221) · Unit/Champion · Chaos · [3][chaos] · 3 Might
 *   "When you play me, discard 1, then draw 2.
 *    Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * Q: Can Ezreal's "optional additional costs cost less" pay for [Deflect]?
 * A: No. Ezreal only shaves costs that are BOTH additional AND optional ("as an additional cost … you may").
 *    [Deflect] is a MANDATORY additional cost the chooser has to pay to aim at the Deflect unit at all, so it
 *    is outside the discount. [Repeat], which is optional, is discounted.
 * Rules: 809.1.c/809.1.d ([Deflect] is a mandatory Power surcharge for choosing the unit),
 *        356.4.c ("optional additional costs" reductions), 820 ([Repeat] is an optional additional cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL_PRODIGY = "sfd-149-221";
const BELLOWS_BREATH = "sfd-080-221"; // [Action] [1][mind], [Repeat] [1][mind] — deal 1 to up to three units at one location
const VEX_APATHETIC = "unl-150-219"; // carries [Deflect]

const totalPower = (r: { power: Record<string, number> }) => Object.values(r.power).reduce((a, b) => a + b, 0);

/** P1 casts Bellows Breath with plenty in the pool; Ezreal is on the board only in the `withEzreal` build. */
async function board(withEzreal: boolean): Promise<Game> {
  let s = scenario()
    .resources(P1, { energy: 9, power: { mind: 4, rainbow: 4 } })
    .unit(P2, "base", VEX_APATHETIC, "vexa")
    .unit(P2, "base", { might: 3, name: "Grunt" }, "grunt")
    .hand(P1, BELLOWS_BREATH, "bb");
  if (withEzreal) {
    s = s.unit(P1, "base", EZREAL_PRODIGY, "ez");
  }
  return await s.build();
}

/** Energy and total Power actually taken out of P1's pool by `cast`. */
async function spend(game: Game, opts: Parameters<Game["p1"]["cast"]>[1]): Promise<{ energy: number; power: number }> {
  const before = game.p1.resources();
  await game.p1.cast("bb", opts);
  const after = game.p1.resources();
  return { energy: before.energy - after.energy, power: totalPower(before) - totalPower(after) };
}

describe("Ruling 391ea0b5e292000d — Ezreal discounts optional additional costs only; [Deflect] is mandatory and stays", () => {
  test("aiming at a [Deflect] unit costs the surcharge in full WITHOUT Ezreal: [1][mind] + 1 Power", async () => {
    const game = await board(false);
    expect(game.state("vexa").keywords).toContain("Deflect");

    expect(await spend(game, { targets: "vexa" })).toEqual({ energy: 1, power: 2 });
  });

  test("…and exactly the same WITH Ezreal on the board — the [Deflect] tax is not reduced", async () => {
    const game = await board(true);

    expect(await spend(game, { targets: "vexa" })).toEqual({ energy: 1, power: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — [Repeat] IS an optional additional cost, so Ezreal shaves 1 Energy off it", async () => {
    const bare = await board(false);
    expect(await spend(bare, { repeat: 1, targets: "grunt" })).toEqual({ energy: 2, power: 2 });

    const withEz = await board(true);
    expect(await spend(withEz, { repeat: 1, targets: "grunt" })).toEqual({ energy: 1, power: 2 });
  });
});
