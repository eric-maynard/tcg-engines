/**
 * Ruling 85fe59fd2f29e5f9 — Guardian Angel (SFD-051 → sfd-051-221) · Equipment · +1 [Might]
 *   "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *   × Long Sword (SFD-022 → sfd-022-221) · Equipment · +2 [Might] · as the "other equipment".
 *
 * Q: When a unit is saved by Guardian Angel, does its OTHER equipment stay attached?
 * A: Yes. Guardian Angel is a replacement effect: the unit never dies and never leaves the board — it is healed,
 *    exhausted and recalled to base. Because it stays in play, it keeps its damage-free body, its status and every
 *    other attachment. Only Guardian Angel itself goes to the trash.
 * Rules: 370.1.a.1 / 370.2 (replacement, the death never happens), 373.2 (Guardian Angel's replacement text),
 *        718.6 (attached cards do not move separately from their top-most card).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";
const LONG_SWORD = "sfd-022-221";

/** P2's turn. P1 defends bf1 with a 1-Might Bearer wearing BOTH pieces (1 + 1 + 2 = 4); P2 attacks with a 6. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Bearer" }, "bearer", { equippedWith: ["ga", "sword"] })
    .gear(P1, GUARDIAN_ANGEL, "ga", { attachedTo: "bearer" })
    .gear(P1, LONG_SWORD, "sword", { attachedTo: "bearer" })
    .unit(P2, "base", { might: 6, name: "Executioner" }, "exec");
}

async function lethalCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bearer")).toMatchObject({ attachments: expect.arrayContaining(["ga", "sword"]), might: 4 });
  await game.p2.move("exec", "bf1");
  await game.settle();
  return game;
}

describe("Ruling 85fe59fd2f29e5f9 — Guardian Angel dies in the unit's place; every other attachment stays put", () => {
  test("Guardian Angel is the one that goes to the trash — the Bearer never dies", async () => {
    const game = await lethalCombat();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("bearer")).not.toBe("trash");
  });

  test("the OTHER equipment is still attached to the very same unit", async () => {
    const game = await lethalCombat();
    expect(game.state("sword").attachedTo).toBe("bearer");
    expect(game.state("bearer").attachments).toEqual(["sword"]);
    expect(game.state("bearer").might).toBe(3); // 1 printed + Long Sword's +2, minus the departed +1
  });

  test("the rest of the replacement runs: the Bearer is healed, exhausted and recalled to base", async () => {
    const game = await lethalCombat();
    expect(game.state("bearer")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.locationOf("bearer")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("and because the Bearer left, P2 takes the battlefield it was defending", async () => {
    const game = await lethalCombat();
    expect(game.zoneOf("exec")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
