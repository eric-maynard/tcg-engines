/**
 * Ruling 9b41e775377e00ec — Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Champion Unit · Fury · [3] · 3 Might
 *     "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   × Desert's Call (sfd-031-221) · [2] "Play a 2 [Might] Sand Soldier unit token." — a unit played NOT from hand.
 *
 * Q: Rek'Sai is in base and I play a unit not from hand — is there a cost to Accelerate it?
 * A: Yes. The granted Accelerate is still an OPTIONAL ADDITIONAL COST: to have the unit enter ready you pay [1] + 1 Power
 *    (any domain for a domainless token) during that play; if you don't pay, it simply enters exhausted.
 * Rules: 805.1.a / 805.2 (Accelerate = optional additional cost [1]+[C] → enters ready), 805.1.a.2 (no domain ⇒ any Power),
 *        357 (costs paid as part of the play), 143.4 (units enter exhausted by default).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REKSAI = "sfd-029-221";
const DESERTS_CALL = "sfd-031-221";

/** P1's turn: Rek'Sai in base, Desert's Call in hand; pool = the spell's [2] + exactly one Accelerate payment ([1] + 1 mind). */
function board(pool: { energy: number; power: Record<string, number> } = { energy: 3, power: { mind: 1 } }) {
  return scenario().resources(P1, pool).unit(P1, "base", REKSAI, "reksai").hand(P1, DESERTS_CALL, "call");
}

const soldiers = (game: Game) => game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

describe("Ruling 9b41e775377e00ec — Rek'Sai's granted Accelerate is not free: pay [1] + 1 Power or the unit enters exhausted", () => {
  test("the token's play (from no hand) PAUSES to offer Accelerate as a payable yes/no — it is a cost decision, made before the Sand Soldier exists on the board", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } }); // only the spell's [2] so far
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toMatch(/Accelerate/i);
    expect(soldiers(game)).toHaveLength(0);
  });

  test("paying it: exactly [1] + 1 Power (an off-domain mind pays — the token has no domain) leave the pool, and the Sand Soldier enters READY", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const [tok] = soldiers(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isReady: true, isToken: true, might: 2, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("declining: nothing extra is spent and the Sand Soldier enters EXHAUSTED (the default)", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.no();
    await game.settle();
    const [tok] = soldiers(game);
    expect(game.state(tok as string)).toMatchObject({ isExhausted: true, isToken: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
  });

  test("the cost is real, not waived by Rek'Sai: with only the spell's [2] (no spare energy/power) Accelerate cannot be accepted and the token enters exhausted", async () => {
    const game = await board({ energy: 2, power: {} }).build();
    await game.p1.cast("call");
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
        break;
      }
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    const [tok] = soldiers(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string).isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("control (no Rek'Sai): a token played by the same spell has no Accelerate at all — no question, enters exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, DESERTS_CALL, "call").build();
    await game.p1.cast("call");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    const [tok] = soldiers(game);
    expect(game.state(tok as string).isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
  });
});
