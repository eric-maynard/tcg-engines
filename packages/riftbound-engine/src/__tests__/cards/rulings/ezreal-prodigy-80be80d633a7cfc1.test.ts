/**
 * Ruling 80be80d633a7cfc1 — Ezreal, Prodigy (SFD-149 → sfd-149-221) · 3+[chaos] · 3 Might
 *     "When you play me, discard 1, then draw 2. Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Bullet Time (OGN-268 → ogn-268-298) · Action · [1]
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *
 * Q: Does Ezreal, Prodigy's reduction make Bullet Time's [rainbow] payment cheaper?
 * A: No. Bullet Time's [rainbow] is paid ON RESOLUTION, not as an optional additional cost "as you play" it, so
 *    Ezreal's ability does not apply — you get exactly as much damage as the [rainbow] you actually pay.
 * Rules: 356.2.b/356.4 (optional additional costs are "as you play … you may pay"), 204.3.b (Bullet Time pays
 *        on resolution), 135.2.e ([rainbow] = power of any domain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL_PRODIGY = "sfd-149-221";
const BULLET_TIME = "ogn-268-298";

/** P1's turn: [1] + 2 rainbow, Bullet Time in hand; P2's Foe A (4) and Foe B (3) at P2's bf1. */
function board(withEzreal: boolean) {
  const b = scenario()
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Foe A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Foe B" }, "b")
    .hand(P1, BULLET_TIME, "bt");
  return withEzreal ? b.unit(P1, "base", EZREAL_PRODIGY, "ezreal") : b;
}

/** Cast Bullet Time at bf1 and drive to the on-resolution "pay any amount of [rainbow]" question. */
async function castToPayment(game: Game): Promise<void> {
  await game.p1.cast("bt", { targets: "bf1" });
  // Only the [1] Energy is paid as the spell is played — the [rainbow] is NOT a play-time cost.
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1 })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" } });
}

describe("Ruling 80be80d633a7cfc1 — Ezreal, Prodigy does not cheapen Bullet Time's on-resolution [rainbow] payment", () => {
  test("with Ezreal out: the payment is asked on RESOLUTION and capped at the 2 [rainbow] P1 actually has (no '+1 free' from Ezreal)", async () => {
    const game = await board(true).build();
    await castToPayment(game);
    expect(game.decision()).toMatchObject({ kind: "integer", max: 2, min: 0 });
    const r = await game.p1.try((p) => p.chooseX(3));
    expect(r.ok).toBe(false); // 3 damage for 2 rainbow is not on offer
  });

  test("with Ezreal out: paying 2 [rainbow] costs the full 2 (2 → 0) and deals exactly 2 to each enemy unit there — not 1-for-2, not 2-for-3", async () => {
    const game = await board(true).build();
    await castToPayment(game);
    await game.p1.chooseX(2);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("a").damage).toBe(2);
    expect(game.state("b").damage).toBe(2);
    expect(game.zoneOf("b")).toBe("battlefield-bf1"); // 2 < 3: only a discounted third point would have killed it
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control (no Ezreal): the identical cast behaves identically — same cap, same 2-for-2", async () => {
    const game = await board(false).build();
    await castToPayment(game);
    expect(game.decision()).toMatchObject({ kind: "integer", max: 2, min: 0 });
    await game.p1.chooseX(2);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("a").damage).toBe(2);
    expect(game.state("b").damage).toBe(2);
  });
});
