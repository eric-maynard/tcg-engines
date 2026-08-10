/**
 * Ruling 975c018e9f210440 — Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Champion Unit · Fury · [3] · 3 Might
 *   "[Accelerate] (You may pay [1][fury] …) [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   × Desert's Call (sfd-031-221, [2]) "Play a 2 [Might] Sand Soldier unit token." — a domainless unit played by an effect
 *
 * Q: Units given Accelerate by Rek'Sai — do they still pay for it? And which Power type, given Rek'Sai is Fury?
 * A: Yes, Accelerate is never free: [1] Energy + 1 Power, paid in the Pay Costs step of that unit's play (not later, once
 *    it is on the board). The Power follows the ACCELERATING unit's domains, not Rek'Sai's: a domainless token pays with
 *    Power of ANY domain. Unpaid → the unit enters exhausted.
 * Rules: 805.1.a, 805.1.a.2 (no domain → [A]), 805.2 / 805.2.a (only while being played), 357, 143.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REKSAI_BREACHER = "sfd-029-221";
const DESERTS_CALL = "sfd-031-221";

/** P1's turn: Rek'Sai (Fury) in base, Desert's Call in hand; pool = the spell's [2] + `spare` energy + `power`. */
function board(spare: number, power: Record<string, number>) {
  return scenario()
    .resources(P1, { energy: 2 + spare, power })
    .unit(P1, "base", REKSAI_BREACHER, "reksai")
    .hand(P1, DESERTS_CALL, "call");
}

const soldier = (game: Game) => game.p1.units("base").find((id) => game.state(id).name === "Sand Soldier");

/** Cast Desert's Call and settle up to the token's Accelerate offer. */
async function castCall(game: Game): Promise<void> {
  const before = game.p1.energy();
  await game.p1.cast("call");
  expect(game.p1.energy()).toBe(before - 2); // the spell's own [2]
  await game.settle();
}

describe("Ruling 975c018e9f210440 — Rek'Sai-granted Accelerate still costs [1] + 1 Power (any domain for a domainless unit), paid as the unit is played", () => {
  test("the offer names a real price: 'Pay [1][any] to Accelerate' — with [1] + one MIND power spare (Rek'Sai is Fury; the token has no domain) it CAN be accepted", async () => {
    const game = await board(1, { mind: 1 }).build();
    await castCall(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(d?.prompt ?? "").toMatch(/Pay \[1\]\[any\] to Accelerate/i);
    expect(soldier(game)).toBeUndefined(); // asked during the token's play, before it enters
  });

  test("accepting drains exactly [1] + the off-domain mind power and the Sand Soldier enters READY — it was paid for, not free", async () => {
    const game = await board(1, { mind: 1 }).build();
    await castCall(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state(soldier(game) as string)).toMatchObject({ isReady: true, isToken: true, might: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("a Fury power is NOT required — but SOME power is: with [1] spare and no power at all the offer cannot be accepted and the token enters exhausted", async () => {
    const game = await board(1, {}).build();
    await castCall(game);
    for (let i = 0; i < 3 && game.decision()?.kind === "yes-no"; i++) {
      expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
      await game.p1.no();
      await game.settle();
    }
    expect(game.state(soldier(game) as string).isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
  });

  test("likewise Power without the [1] Energy is not enough (fury alone): cannot accept → exhausted, fury untouched", async () => {
    const game = await board(0, { fury: 1 }).build();
    await castCall(game);
    for (let i = 0; i < 3 && game.decision()?.kind === "yes-no"; i++) {
      expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no" });
      await game.p1.no();
      await game.settle();
    }
    expect(game.state(soldier(game) as string).isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(1);
  });

  test("payment timing: declined at play time, the exhausted token cannot be 'accelerated' afterwards — even after resources are added no such action exists for it", async () => {
    const game = await board(1, { mind: 1 }).build();
    await castCall(game);
    await game.p1.no();
    await game.settle();
    const tok = soldier(game) as string;
    expect(game.state(tok).isExhausted).toBe(true);
    await game.p1.do("addResources", { energy: 3, power: { fury: 2, mind: 2 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const forToken = game.p1.legal().filter((o) => o.card === tok);
    expect(forToken.some((o) => /accelerate/i.test(o.label) || /accelerate/i.test(o.moveId))).toBe(false);
    expect(game.state(tok).isExhausted).toBe(true);
  });
});
