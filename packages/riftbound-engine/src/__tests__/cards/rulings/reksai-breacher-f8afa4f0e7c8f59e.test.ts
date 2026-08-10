/**
 * Ruling f8afa4f0e7c8f59e — Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Champion Unit · Fury · [3] · 3 Might
 *     "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   × Vanguard Armory (sfd-168-221, Gear) "[Exhaust]: Play three 1 [Might] Recruit unit tokens." — a token played from an ability
 *
 * Q: Is Accelerate free on units Rek'Sai, Breacher grants it to?
 * A: No. Accelerate is an OPTIONAL ADDITIONAL COST ([1] + 1 Power): Rek'Sai only gives the option. Pay it during the play ⇒ the unit
 *    enters ready; don't (or can't) ⇒ it enters exhausted, the default.
 * Rules: 805.1.a / 805.2 (Accelerate: optional additional cost paid as the unit is played), 805.1.a.2 (domainless ⇒ any Power),
 *        143.4 (units enter exhausted by default).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REKSAI_BREACHER = "sfd-029-221";
const VANGUARD_ARMORY = "sfd-168-221";

/** P1's turn: Rek'Sai, Breacher and a ready Vanguard Armory in base, with the given pool. */
function board(pool: { energy: number; power?: Record<string, number> }) {
  return scenario().resources(P1, pool).unit(P1, "base", REKSAI_BREACHER, "reksai").gear(P1, VANGUARD_ARMORY, "armory");
}

const recruits = (game: Game) => game.p1.units("base").filter((id) => game.state(id).name === "Recruit");

/** Crank the Armory; answer each Accelerate yes/no with `answer` when acceptable (else decline). Returns the offers seen. */
async function crank(game: Game, answer: boolean): Promise<{ canAccept: boolean | undefined }[]> {
  const seen: { canAccept: boolean | undefined }[] = [];
  await game.p1.activate("armory");
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
      break;
    }
    expect(d.seat).toBe(P1);
    expect(d.prompt).toMatch(/Accelerate/i);
    seen.push({ canAccept: d.canAccept });
    await game.p1.answer(answer && d.canAccept !== false);
  }
  return seen;
}

describe("Ruling f8afa4f0e7c8f59e — Rek'Sai, Breacher's granted Accelerate still costs [1] + 1 Power", () => {
  test("paying it: with exactly [1] + 1 Power, accepting the first Recruit's Accelerate SPENDS the pool (→ 0/0) and that Recruit enters READY; the rest can't be paid for and enter exhausted", async () => {
    const game = await board({ energy: 1, power: { fury: 1 } }).build();
    const offers = await crank(game, true);
    expect(offers[0]).toMatchObject({ canAccept: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // not free
    const toks = recruits(game);
    expect(toks).toHaveLength(3);
    expect(toks.filter((t) => game.state(t).isReady)).toHaveLength(1);
    expect(toks.filter((t) => game.state(t).isExhausted)).toHaveLength(2);
    expect(offers.slice(1).every((o) => o.canAccept === false)).toBe(true);
  });

  test("optional: declining every offer spends nothing and all three Recruits enter EXHAUSTED (the default)", async () => {
    const game = await board({ energy: 1, power: { fury: 1 } }).build();
    await crank(game, false);
    expect(recruits(game)).toHaveLength(3);
    expect(recruits(game).every((t) => game.state(t).isExhausted)).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("with an EMPTY pool the option cannot be taken at all (canAccept:false or not offered) — no Recruit enters ready for free", async () => {
    const game = await board({ energy: 0 }).build();
    const offers = await crank(game, true);
    expect(offers.every((o) => o.canAccept === false)).toBe(true);
    expect(recruits(game)).toHaveLength(3);
    expect(recruits(game).every((t) => game.state(t).isExhausted)).toBe(true);
  });
});
