/**
 * Ruling 46ab63a2362e8568 — Bellows Breath (SFD-080 → sfd-080-221) · Spell · Mind · [1][mind] · [Action]
 *   "[Repeat] [1][mind]\nDeal 1 to up to three units at the same location."
 *   × Vex, Cheerless (SFD-146 → sfd-146-221) — "While I'm in combat, friendly spells cost [1][rainbow] less
 *     to a minimum of [1] …"  × Ezreal, Prodigy (SFD-149 → sfd-149-221) — "Optional additional costs you pay
 *     cost [1] or [rainbow] less."
 *
 * Q: Do Vex's reductions apply to Repeat costs and to [Deflect]? Can 2 Vex + 1 Ezreal make a repeated
 *    Bellows Breath free?
 * A: Yes to both, per this ruling: Vex shaves the spell's TOTAL cost (base + Repeat + the mandatory [Deflect]
 *    surcharge), her "minimum [1]" binds only her own reduction, and Ezreal then takes the last Energy off the
 *    Repeat — total [0].
 * Rules: 356.3/356.4 (static cost changes and their minima), 356.4.c (Ezreal's optional-additional discount),
 *        809.1.c ([Deflect] folded into the total before reductions), 820 ([Repeat]).
 *
 * Note — riftjudge 3713bcd5faac645d says the opposite about Repeat ("Vex's ability does not affect Repeat
 * costs"). The engine follows THIS ruling and the Core Rules' single-total model; that facet is asserted here.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const VEX_CHEERLESS = "sfd-146-221";
const EZREAL_PRODIGY = "sfd-149-221";
const VEX_APATHETIC = "unl-150-219"; // the [Deflect] body to aim at

const totalPower = (r: { power: Record<string, number> }) => Object.values(r.power).reduce((a, b) => a + b, 0);

/**
 * P1's turn. P2 holds bf1 with a body to shoot at; `vexCount` copies of Vex, Cheerless attack into it so they
 * are IN COMBAT, and Ezreal (when present) waits at P1's base. P1's pool is deliberately generous.
 */
async function attackWith(vexCount: number, withEzreal: boolean, defender: string | { might: number; name: string }): Promise<Game> {
  let s = scenario()
    .resources(P1, { energy: 9, power: { mind: 4, rainbow: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", defender, "wall")
    .hand(P1, BELLOWS_BREATH, "bb");
  for (let i = 0; i < vexCount; i++) {
    s = s.unit(P1, "base", VEX_CHEERLESS, `vex${i}`);
  }
  if (withEzreal) {
    s = s.unit(P1, "base", EZREAL_PRODIGY, "ez");
  }
  const game = await s.build();
  if (vexCount > 0) {
    await game.p1.move(Array.from({ length: vexCount }, (_, i) => `vex${i}`), "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  }
  return game;
}

async function spend(game: Game, opts: Parameters<Game["p1"]["cast"]>[1]): Promise<{ energy: number; power: number }> {
  const before = game.p1.resources();
  await game.p1.cast("bb", opts);
  const after = game.p1.resources();
  return { energy: before.energy - after.energy, power: totalPower(before) - totalPower(after) };
}

const WALL = { might: 6, name: "Wall" };

describe("Ruling 46ab63a2362e8568 — Vex shaves the whole cost of a repeated Bellows Breath, [Deflect] included", () => {
  test("baseline: a repeated Bellows Breath is [2] + 2 Power (base [1][mind] plus Repeat [1][mind])", async () => {
    const game = await attackWith(0, false, WALL);

    expect(await spend(game, { repeat: 1, targets: "wall" })).toEqual({ energy: 2, power: 2 });
  });

  test("one Vex in combat takes [1][rainbow] off the REPEATED total — [1] + 1 Power", async () => {
    const game = await attackWith(1, false, WALL);

    expect(await spend(game, { repeat: 1, targets: "wall" })).toEqual({ energy: 1, power: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("two Vex in combat wipe out both Power pips; Energy floors at [1] (each Vex's own minimum)", async () => {
    const game = await attackWith(2, false, WALL);

    expect(await spend(game, { repeat: 1, targets: "wall" })).toEqual({ energy: 1, power: 0 });
  });

  test("Vex also eats the mandatory [Deflect] surcharge: 2 Power without her, 1 Power with her", async () => {
    const bare = await attackWith(0, false, VEX_APATHETIC);
    expect(bare.state("wall").keywords).toContain("Deflect");
    expect(await spend(bare, { targets: "wall" })).toEqual({ energy: 1, power: 2 }); // [1][mind] + [Deflect]

    const oneVex = await attackWith(1, false, VEX_APATHETIC);
    expect(await spend(oneVex, { targets: "wall" })).toEqual({ energy: 1, power: 1 });
  });

  // Expected (this ruling): each Vex's "minimum [1]" binds only that Vex's own reduction, so after the two Vex
  // leave [1] + 0 Power, Ezreal's optional-additional discount takes the Repeat's last Energy to zero — a FREE
  // repeated Bellows Breath. Actual: the engine floors the whole spell at [1] Energy and Ezreal shaves nothing
  // more, so 1 Energy is still charged.
  test.failing("BUG: ruling 46ab63a2362e8568 — 2 Vex + Ezreal should make the repeated spell cost [0]; the engine still charges [1]", async () => {
    const game = await attackWith(2, true, WALL);

    expect(await spend(game, { repeat: 1, targets: "wall" })).toEqual({ energy: 0, power: 0 });
  });
});
