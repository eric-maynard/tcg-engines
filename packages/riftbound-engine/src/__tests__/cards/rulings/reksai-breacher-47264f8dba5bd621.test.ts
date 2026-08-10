/**
 * Ruling 47264f8dba5bd621 — Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Champion Unit · Fury · 3 · 3 Might
 *   "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   × Rumble, Hotheaded (sfd-026-221) · Champion Unit · Fury · 4 · 4 Might — played from the CHAMPION ZONE.
 *
 * Q: With Rek'Sai in play, if I play Rumble from my Champion Zone, do I have to pay an Accelerate cost for him to enter
 *    ready via Rek'Sai's ability?
 * A: Yes. The Champion Zone is not your hand, so Rek'Sai gives that play [Accelerate] — but Accelerate is an OPTIONAL
 *    ADDITIONAL COST ([1] + 1 Power) paid as you play the unit; unpaid, the unit enters exhausted. It is never free.
 * Rules: 805.1.a (Accelerate = optional additional cost [1] + 1 Power → enter ready), 143.4 (units enter exhausted),
 *        356 (additional costs are paid in the Pay Costs step), 108 (Champion Zone is its own zone, not the hand).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const REKSAI_BREACHER = "sfd-029-221";
const RUMBLE_HOTHEADED = "sfd-026-221";

/** P1's turn: Rek'Sai in base, Rumble in the Champion Zone; [5] + 1 fury = Rumble's [4] plus exactly one Accelerate payment. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .unit(P1, "base", REKSAI_BREACHER, "reksai")
    .champion(P1, RUMBLE_HOTHEADED, "rumble");
}

describe("Ruling 47264f8dba5bd621 — Rek'Sai's granted Accelerate on a Champion-Zone play still has to be paid", () => {
  test("not paying it: Rumble is played from the Champion Zone for his [4] only and enters EXHAUSTED — Rek'Sai's grant does not make him ready for free; the spare [1] + fury is untouched", async () => {
    const game = await board().build();
    expect(game.zoneOf("rumble")).toBe("championZone");
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.state("rumble")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.violations()).toEqual([]);
  });

  // 805.1.a + Rek'Sai's static: the Champion Zone is "anywhere other than a player's hand", so the champion play OFFERS
  // the Accelerate election ([1] + 1 Power) and, when paid, Rumble enters READY with the pool emptied.
  test("ruling 47264f8dba5bd621 — the Champion-Zone play offers Rek'Sai's granted Accelerate; paying [1]+[fury] makes Rumble enter ready", async () => {
    const game = await board().build();
    const opt = game.p1.option("playChampion");
    const electable =
      (opt?.variants ?? []).some((v) => v.params.paidAdditionalCost === true || v.params.costs !== undefined) ||
      (opt?.fields ?? []).some((f) => f.arg === "accelerate" || f.arg === "payOptional" || f.arg === "costs");
    let enteredReady = false;
    if (electable) {
      await game.p1.choose(opt!.key, { accelerate: true, payOptional: true, to: "base" });
      await game.settle();
      enteredReady = game.state("rumble").isReady;
    } else {
      // Or an in-play prompt ("pay [1][fury] to Accelerate?") like effect plays get.
      await game.p1.playChampion("base");
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && /accelerate/i.test(d.prompt)) {
        await game.p1.yes();
        await game.settle();
        enteredReady = game.state("rumble").isReady;
      }
    }
    expect(enteredReady).toBe(true);
    expect(game.state("rumble").zone).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("control: a unit played FROM HAND gets no Accelerate from Rek'Sai (the grant is only for non-hand plays) — no accelerate election is offered and it enters exhausted", async () => {
    const game = await board().hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Grunt" }, "grunt").build();
    const fields = game.p1.option("play", "grunt")?.fields ?? [];
    expect(fields.some((f) => f.arg === "accelerate" || f.arg === "payOptional")).toBe(false);
    expect((await game.p1.try((p) => p.play("grunt", { accelerate: true }))).ok).toBe(false);
    await game.p1.play("grunt");
    await game.settle();
    expect(game.state("grunt")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
  });
});
