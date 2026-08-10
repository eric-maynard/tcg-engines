/**
 * Ruling 2b46b43b89b90023 — Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Champion Unit · Fury · [3] · 3 Might
 *   "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   × Vanguard Armory (sfd-168-221, Gear) "[Exhaust]: Play three 1 [Might] Recruit unit tokens."
 *
 * Q: Can Rek'Sai, Breacher make Recruit tokens enter ready?
 * A: Yes. Tokens created by an ability are PLAYED from somewhere other than a hand, so they have Accelerate as they
 *    are played; paying the optional [1] + 1 Power during that play makes the token enter ready, otherwise it enters
 *    exhausted as usual.
 * Rules: 179.1.a / 185.2.a (tokens are played), 805.1.a / 805.2 (Accelerate = optional additional cost at play),
 *        805.1.a.2 (domainless → any Power), 143.4 (default: exhausted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REKSAI_BREACHER = "sfd-029-221";
const VANGUARD_ARMORY = "sfd-168-221";

/** P1's turn: ready Armory in base; [1] + 1 mind floating = exactly ONE Accelerate payment. Optionally Rek'Sai in base. */
function board(withReksai = true) {
  const s = scenario().resources(P1, { energy: 1, power: { mind: 1 } }).gear(P1, VANGUARD_ARMORY, "armory");
  return withReksai ? s.unit(P1, "base", REKSAI_BREACHER, "reksai") : s;
}

const recruits = (game: Game) => game.p1.units("base").filter((id) => game.state(id).name === "Recruit");

/** Crank the Armory and answer each Accelerate offer with the next entry of `answers` (missing → decline). Returns the offers seen. */
async function crank(game: Game, answers: boolean[]): Promise<{ prompt: string; canAccept: boolean | undefined }[]> {
  const seen: { prompt: string; canAccept: boolean | undefined }[] = [];
  await game.p1.activate("armory");
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
      break;
    }
    seen.push({ canAccept: d.canAccept, prompt: d.prompt });
    const want = answers[seen.length - 1] === true && d.canAccept !== false;
    await game.p1.answer(want);
  }
  return seen;
}

describe("Ruling 2b46b43b89b90023 — Rek'Sai, Breacher lets Recruit tokens Accelerate in ready", () => {
  test("control (no Rek'Sai): the Armory's three Recruit tokens are played with no Accelerate offer and all enter EXHAUSTED", async () => {
    const game = await board(false).build();
    const offers = await crank(game, []);
    expect(offers).toEqual([]);
    expect(recruits(game)).toHaveLength(3);
    expect(recruits(game).every((t) => game.state(t).isExhausted && game.state(t).isToken)).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
  });

  test("with Rek'Sai out, each Recruit's play (even three from one ability) offers the Accelerate election — a yes/no for P1 before the first token exists", async () => {
    const game = await board().build();
    await game.p1.activate("armory");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toMatch(/Accelerate/i);
    expect(recruits(game)).toHaveLength(0); // asked as part of the first token's own play
  });

  test("paying [1] + 1 Power (any domain — the token is domainless) for the first Recruit: it enters READY; the other two, unpaid, enter exhausted", async () => {
    const game = await board().build();
    const offers = await crank(game, [true, false, false]);
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers[0]).toMatchObject({ canAccept: true });
    expect(offers.slice(1).every((o) => o.canAccept === false)).toBe(true); // pool empty after the first payment
    const toks = recruits(game);
    expect(toks).toHaveLength(3);
    expect(toks.filter((t) => game.state(t).isReady)).toHaveLength(1);
    expect(toks.filter((t) => game.state(t).isExhausted)).toHaveLength(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("with [3] + 3 Power all three payments can be made: three READY Recruits, pool empty", async () => {
    const game = await board().resources(P1, { energy: 3, power: { mind: 3 } }).build();
    const offers = await crank(game, [true, true, true]);
    expect(offers).toHaveLength(3);
    expect(recruits(game)).toHaveLength(3);
    expect(recruits(game).every((t) => game.state(t).isReady)).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("declining every offer: the three Recruits enter exhausted (the default) and nothing is spent", async () => {
    const game = await board().build();
    await crank(game, [false, false, false]);
    expect(recruits(game)).toHaveLength(3);
    expect(recruits(game).every((t) => game.state(t).isExhausted)).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.violations()).toEqual([]);
  });
});
