/**
 * Ruling 3713bcd5faac645d — Vex, Cheerless (SFD-146 → sfd-146-221) · Unit/Champion · Chaos · [5][chaos] · 5 Might
 *   "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1],
 *    and enemy spells cost [1][rainbow] more."
 *
 * Q: Does Vex make the opponent pay 1 extra Power AND 1 extra Energy?
 * A: Yes — [1][rainbow] is one Energy plus one Power of any Domain, so enemy spells cost 1 Energy and
 *    1 Power more. It only applies while Vex is IN COMBAT at a battlefield; with Vex sitting at base the
 *    opponent pays the printed cost. The mirror clause makes your own spells cost [1][rainbow] less.
 * Rules: 356.3 (static cost increases), 356.4/356.4.e (static reductions and their minimum),
 *        135.2 ([rainbow] = Power of any Domain), 190.3/450 (in combat = at a contested battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX_CHEERLESS = "sfd-146-221";
const STAR_CROSSED = "unl-128-219"; // [Reaction] [3][chaos] — return a friendly and an enemy unit to hand

const totalPower = (r: { power: Record<string, number> }) => Object.values(r.power).reduce((a, b) => a + b, 0);

/**
 * P2's turn. P1 holds bf1 with a Holder; P2's Raider walks in and opens a combat showdown there.
 * Vex sits either at bf1 (in the combat) or at P1's base (not in combat).
 */
async function raidIntoVex(vexAt: "bf1" | "base"): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 9, power: { chaos: 4, rainbow: 4 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, vexAt, VEX_CHEERLESS, "vex")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, STAR_CROSSED, "p1star")
    .hand(P2, STAR_CROSSED, "p2star")
    .build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  return game;
}

describe("Ruling 3713bcd5faac645d — Vex, Cheerless taxes enemy spells 1 Energy AND 1 Power while she is in combat", () => {
  test("Vex in the combat: the opponent's [3][chaos] Reaction costs 4 Energy and 2 Power", async () => {
    const game = await raidIntoVex("bf1");
    const before = game.p2.resources();

    await game.p2.cast("p2star", { targets: ["raider", "holder"] });

    const after = game.p2.resources();
    expect(before.energy - after.energy).toBe(4); // 3 printed + 1
    expect(totalPower(before) - totalPower(after)).toBe(2); // 1 printed [chaos] + 1 of any Domain
    expect(game.violations()).toEqual([]);
  });

  test("Vex at base (not in combat): the very same spell costs its printed 3 Energy and 1 Power", async () => {
    const game = await raidIntoVex("base");
    const before = game.p2.resources();

    await game.p2.cast("p2star", { targets: ["raider", "holder"] });

    const after = game.p2.resources();
    expect(before.energy - after.energy).toBe(3);
    expect(totalPower(before) - totalPower(after)).toBe(1);
  });

  test("the mirror clause: while Vex is in combat, P1's own [3][chaos] Reaction costs [2] with no Power at all", async () => {
    const game = await raidIntoVex("bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });

    // P1 was seeded with exactly 2 Energy and zero Power — only the discounted cost is payable.
    expect(game.p1.resources()).toMatchObject({ energy: 2 });
    expect(totalPower(game.p1.resources())).toBe(0);
    await game.p1.cast("p1star", { targets: ["holder", "raider"] });

    expect(game.p1.energy()).toBe(0);
  });
});
