/**
 * Ruling 8924ab1101798538 — B.F. Sword (SFD-161 → sfd-161-221) · Equipment · Order · [4] · +3 Might
 *     "[Equip] [order] ([order]: Attach this to a unit you control.)"
 *   × Desert's Call (SFD-031 → sfd-031-221) · Spell · [2] · "Play a 2 [Might] Sand Soldier unit token."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Spell · Fury · [1][fury] · "Deal 3 to a unit at a battlefield."
 *
 * Q: My Sand Soldier is wearing a B.F. Sword and something hits it for 3. Does it die?
 * A: No. A Sand Soldier token is 2 Might; the Sword adds 3, so its current Might is 5. A unit dies only when the
 *    damage marked on it is at least its current Might, and 3 < 5 — it survives with 3 damage marked.
 * Rules: 184.3 (Sand Soldier token = 2 Might), 718 (an Equipment's Might bonus is part of the wearer's Might),
 *        142.3 (damage is marked), 150.4 / 372 (a unit is killed when marked damage ≥ its Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BF_SWORD = "sfd-161-221";
const DESERTS_CALL = "sfd-031-221";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P1 holds bf1 with a Sand Soldier (2) wearing the Sword, plus Hextech Ray(s) and [2][fury][fury]. */
function board(withSword: boolean) {
  const s = scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(
      P1,
      "bf1",
      { might: 2, name: "Sand Soldier" },
      "soldier",
      withSword ? ({ equippedWith: ["sword"] } as Record<string, unknown>) : {},
    )
    .hand(P1, HEXTECH_RAY, "ray1")
    .hand(P1, HEXTECH_RAY, "ray2");
  if (withSword) {
    s.card("sword", { def: BF_SWORD, meta: { attachedTo: "soldier" } as Record<string, unknown>, owner: P1, zone: "bf1" });
  }
  return s;
}

/** Fire one Hextech Ray at the Sand Soldier and let it resolve. */
async function shoot(game: Game, ray: string): Promise<void> {
  await game.p1.cast(ray, { targets: "soldier" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf(ray)).toBe("trash");
}

describe("Ruling 8924ab1101798538 — 2 (token) + 3 (Sword) = 5 Might, so 3 damage does not kill it", () => {
  test("premise: a Sand Soldier token really is 2 Might — Desert's Call makes one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, DESERTS_CALL, "call")
      .build();
    await game.p1.cast("call");
    await game.settle();
    const token = game.find({ name: "Sand Soldier", owner: P1 });
    expect(game.state(token)).toMatchObject({ baseMight: 2, isToken: true, might: 2 });
  });

  test("wearing the Sword the Soldier reads 5 Might (2 base + 3 from the Equipment)", async () => {
    const game = await board(true).build();
    expect(game.state("sword").attachedTo).toBe("soldier");
    expect(game.state("soldier")).toMatchObject({ attachments: ["sword"], baseMight: 2, might: 5 });
  });

  test("3 damage is marked and it lives: 3 < 5", async () => {
    const game = await board(true).build();
    await shoot(game, "ray1");
    expect(game.state("soldier")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.p1.units("bf1")).toEqual(["soldier"]);
    expect(game.violations()).toEqual([]);
  });

  test("a second Ray takes it to 6 marked damage, which IS lethal against 5 Might — and the Sword goes with it", async () => {
    const game = await board(true).build();
    await shoot(game, "ray1");
    await shoot(game, "ray2");
    expect(game.zoneOf("soldier")).toBe("trash");
    expect(game.state("sword").attachedTo).toBeUndefined();
  });

  test("control — the bare 2-Might Soldier without the Sword dies to that very same 3 damage", async () => {
    const game = await board(false).build();
    expect(game.state("soldier").might).toBe(2);
    await shoot(game, "ray1");
    expect(game.zoneOf("soldier")).toBe("trash");
  });
});
