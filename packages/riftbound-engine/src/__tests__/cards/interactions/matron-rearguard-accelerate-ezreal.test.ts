/**
 * Interaction: Spectral Matron (ogn-226-298) · Unit · Order · 4 energy + [order][order] · 4 Might
 *     "When you play me, you may play a unit costing no more than [3] and no more than [rainbow]
 *      from your trash, ignoring its cost."
 *   × Legion Rearguard (ogn-010-298) · Unit · Fury · 2 energy · 2 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)"
 *   × Ezreal, Prodigy (sfd-149-221) · Unit · Chaos
 *     "… Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * Rules:
 *   206, 356.1.b.1      — Rearguard (cost 2, Power 0) is a legal Matron target; "ignoring its cost"
 *                          zeroes only the BASE Energy/Power cost.
 *   355.1.a, 805.1.a, 805.2, 356.1.b.3 — Accelerate is an optional additional cost chosen while
 *                          playing; it is added after the base is zeroed and must be paid (the CR
 *                          example is literally Legion Rearguard).
 *   805.1.a.1, 135.2.e.5.b — the Power pip must be of the unit's domain (Fury); universal power may
 *                          stand in, an off-domain (Calm) power may not.
 *   805.2.b, 805.6      — paid → enters ready; 143.4 — otherwise a played unit enters exhausted.
 *   356.4.c, 356.4.f, 356.4.f.1 — Ezreal's discount applies to the Accelerate cost (drop the [1] OR
 *                          the pip); a discounted optional cost still counts as "paid" → enters ready.
 *
 * Question: reanimating Rearguard with Matron "ignoring its cost", can you still pay Accelerate and
 * what does it cost — without and with Ezreal? Declining → exhausted? Can Calm power pay the pip?
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";
import type { Decision, ScriptedAnswer } from "../../../harness";

const MATRON = "ogn-226-298";
const REARGUARD = "ogn-010-298";
const EZREAL = "sfd-149-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1 main phase with Matron in hand and Legion Rearguard in trash. `extra` is what is left in the
 * pool AFTER Matron's own 4 energy + [order][order] are paid — i.e. what is available for Accelerate.
 */
function board(extra: { energy?: number; power?: Record<string, number> } = {}, withEzreal = false) {
  const s = scenario()
    .resources(P1, { energy: 4 + (extra.energy ?? 0), power: { order: 2, ...(extra.power ?? {}) } })
    .trash(P1, REARGUARD, "rearguard")
    .trash(P1, { might: 5, energyCost: 5, name: "Too Pricey" }, "pricey") // NOT a legal Matron target
    .hand(P1, MATRON, "matron");
  return withEzreal ? s.unit(P1, "base", EZREAL, "ezreal") : s;
}

/**
 * Scripted answerer for whatever the engine asks while Matron's play effect plays Rearguard:
 * which unit (→ rearguard), pay Accelerate? (→ `accelerate`), where (→ base).
 */
function reanimateAnswers(accelerate: boolean): ScriptedAnswer[] {
  const fn = (d: Decision) => {
    if (d.kind === "pick") {
      const keys = d.options.map((o) => o.card ?? o.key);
      if (keys.includes("rearguard")) {
        return "rearguard";
      }
      const base = d.options.find((o) => o.key === "base" || o.zone === "base");
      if (base) {
        return base.key;
      }
      return undefined;
    }
    if (d.kind === "yes-no") {
      return accelerate;
    }
    return undefined;
  };
  return [fn, fn, fn, fn, fn];
}

/** Play Matron, accept her optional play effect and drive it to completion. */
async function playMatronAndReanimate(game: Game, accelerate: boolean): Promise<void> {
  await game.p1.play("matron");
  await game.settle();
  // Matron's "you may" play effect.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  game.script(P1, reanimateAnswers(accelerate));
  await game.settle();
  game.clearScript(P1);
}

describe("Spectral Matron → Legion Rearguard (Accelerate) × Ezreal, Prodigy", () => {
  test("baseline: Matron costs 4 energy + [order][order], enters the base, and her optional play effect asks P1", async () => {
    const game = await board({ energy: 1, power: { fury: 1 } }).build();
    await game.p1.play("matron");
    expect(game.zoneOf("matron")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    // Saying no leaves the trash untouched.
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("rearguard")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  });

  test("declining Accelerate — Rearguard is played from trash for a total cost of 0 and enters EXHAUSTED (356.1.b.1, 143.4)", async () => {
    // Expected: Rearguard (cost 2 ≤ 3, Power 0) is offered, is played to base costing nothing, and
    // enters exhausted; the 5-cost unit is not offered. Actual: Matron's play-from-trash effect
    // resolves without ever offering/playing anything — Rearguard stays in the trash.
    const game = await board({ energy: 1, power: { fury: 1 } }).build();
    await playMatronAndReanimate(game, false);
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.zoneOf("pricey")).toBe("trash");
    expect(game.state("rearguard").isExhausted).toBe(true);
    // Nothing beyond Matron's own cost was spent.
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  });

  test("paying Accelerate on the free Rearguard costs exactly [1][fury] and it enters READY (356.1.b.3, 805.2.b)", async () => {
    // Expected: base cost ignored (0) + optional Accelerate [1][fury] = total [1][fury]; paid → ready.
    // Actual: Rearguard is never played from the trash (see above).
    const game = await board({ energy: 1, power: { fury: 1 } }).build();
    await playMatronAndReanimate(game, true);
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
  });

  test("a universal ([rainbow]) power may be spent as the Fury pip of Accelerate (135.2.e.5.b) → ready", async () => {
    // Expected: [1] + rainbow-as-Fury pays Accelerate; Rearguard enters ready, pool emptied.
    // Actual: Rearguard is never played from the trash.
    const game = await board({ energy: 1, power: { rainbow: 1 } }).build();
    await playMatronAndReanimate(game, true);
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
  });

  test("an off-domain (Calm) power cannot pay the Fury pip (805.1.a.1) — Rearguard still comes back but EXHAUSTED, Calm untouched", async () => {
    // Expected: with only [1] + a Calm power available, Accelerate is unaffordable, so even a
    // player who wants to accelerate gets an exhausted Rearguard and keeps the Calm power.
    // Actual: Rearguard is never played from the trash.
    const game = await board({ energy: 1, power: { calm: 1 } }).build();
    await playMatronAndReanimate(game, true);
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard").isExhausted).toBe(true);
    expect(game.p1.power("calm")).toBe(1);
  });

  test("with Ezreal, Prodigy the Accelerate cost drops to just [fury] — paying only the pip still enters READY (356.4.c, 356.4.f.1)", async () => {
    // Expected: Ezreal removes the [1]; P1 (0 spare energy, 1 fury) pays [fury] → ready, fury 0.
    // Actual: Rearguard is never played from the trash; Ezreal's discount static is not implemented.
    const game = await board({ energy: 0, power: { fury: 1 } }, true).build();
    await playMatronAndReanimate(game, true);
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
  });

  test("with Ezreal, Prodigy P1 may instead drop the pip and pay just [1] → READY with no Fury power at all", async () => {
    // Expected: the discount removes the [rainbow]-class component (the Fury pip); P1 pays [1] → ready.
    // Actual: Rearguard is never played from the trash; Ezreal's discount static is not implemented.
    const game = await board({ energy: 1 }, true).build();
    await playMatronAndReanimate(game, true);
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  // ── Control: the same Accelerate economics on a Rearguard played normally from hand ─────────

  test("control (from hand, no Ezreal): Accelerate is [1][fury] on top of the base 2 → 3 energy + 1 fury, enters ready; declined → 2 energy, exhausted", async () => {
    const paid = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, REARGUARD, "rg").build();
    await paid.p1.play("rg", { accelerate: true });
    await paid.settle();
    expect(paid.state("rg").isReady).toBe(true);
    expect(paid.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });

    const declined = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, REARGUARD, "rg").build();
    await declined.p1.play("rg", { accelerate: false });
    await declined.settle();
    expect(declined.state("rg").isExhausted).toBe(true);
    expect(declined.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("control (from hand, WITH Ezreal): Accelerate costs [1] less — 3 energy and no Fury power suffices, enters ready (356.4.c, 356.4.f.1)", async () => {
    // Expected: 2 (base) + Accelerate discounted to [fury]→dropped pip or [1]→dropped energy; with
    // 3 energy and no power P1 drops the pip and pays 3 total → ready. Actual: Ezreal's "optional
    // additional costs cost [1] or [rainbow] less" is not implemented, so the accelerated play is
    // unaffordable / rejected.
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", EZREAL, "ezreal")
      .hand(P1, REARGUARD, "rg")
      .build();
    await game.p1.play("rg", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.state("rg").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});
