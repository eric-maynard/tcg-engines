/**
 * Ruling bdcde3cbaf23137e — Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Champion Unit · Fury · 3 · 3 Might
 *     "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   × Shadow Clone tokens (Death Mark VEN-144 / Zed, From the Shadows VEN-023a) — the VEN set is NOT in this card pool, and
 *     unl-194-219 in the scrape is "Shadow" (a different card). Stand-in token maker: Desert's Call (sfd-031-221) · 2 ·
 *     "Play a 2 [Might] Sand Soldier unit token." — the same shape: a unit token PLAYED by an effect, i.e. not from hand.
 *
 * Q: Does Rek'Sai, Breacher work with (Shadow Clone) tokens?
 * A: Yes — tokens are played from somewhere other than a hand, so Rek'Sai grants them Accelerate as they are played; they enter
 *    READY only if you pay the optional Accelerate cost (1 Energy + 1 Power) during that play; unpaid they enter exhausted.
 *    (The ruling adds that a single-domain token's Power must match its domain — untestable here: pool tokens are domainless,
 *    for which any domain pays, 805.1.a.2.)
 * Rules: 805.1.a / 805.2 / 805.6 (Accelerate: optional additional cost at play → enter ready), 143.4 (else exhausted),
 *        185.2.a / 350.2 (tokens are played), 805.1.a.2 (domainless → any Power).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REKSAI = "sfd-029-221";
const DESERTS_CALL = "sfd-031-221";

/** P1's turn: Desert's Call in hand; [3] + 1 calm = the spell's [2] plus exactly one Accelerate payment ([1] + 1 power of any domain). */
function board(opts: { reksai?: boolean } = {}) {
  const s = scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, DESERTS_CALL, "call");
  return opts.reksai === false ? s : s.unit(P1, "base", REKSAI, "reksai");
}

const soldiers = (game: Game) => game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

describe("Ruling bdcde3cbaf23137e — Rek'Sai gives effect-played tokens Accelerate; they enter ready only if the cost is paid", () => {
  test("control (no Rek'Sai): the Sand Soldier token is played with no Accelerate offer and enters EXHAUSTED; the spare [1]+calm is untouched", async () => {
    const game = await board({ reksai: false }).build();
    await game.p1.cast("call");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    const [tok] = soldiers(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isExhausted: true, isToken: true, might: 2, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("with Rek'Sai out, resolving Desert's Call PAUSES at the token's play to ask P1 'pay [1][any] to Accelerate?' — the token is played from no hand, so it has Accelerate", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toMatch(/Accelerate/i);
    expect(soldiers(game)).toHaveLength(0); // the election is part of the token's own play
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("paying it ([1] + the off-domain calm — the token is domainless): the Sand Soldier enters READY and the pool is empty", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const [tok] = soldiers(game);
    expect(game.state(tok as string)).toMatchObject({ isReady: true, isToken: true, might: 2, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("declining it: the token enters EXHAUSTED as normal and nothing extra is spent", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.no();
    await game.settle();
    const [tok] = soldiers(game);
    expect(game.state(tok as string)).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("the cost is real: with only the spell's [2] and no spare energy/power the offer cannot be accepted and the token enters exhausted", async () => {
    const game = await board().resources(P1, { energy: 2, power: {} }).build();
    await game.p1.cast("call");
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
        break;
      }
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    const [tok] = soldiers(game);
    expect(game.state(tok as string).isExhausted).toBe(true);
  });
});
