/**
 * Interaction: Curtain Call (unl-182-219) · Spell · Fury/Mind · [4] · Action
 *     "[Repeat] — [1] / [rainbow] / [1][rainbow] (You may pay each additional cost to repeat this
 *      spell's effect.)  Choose one you haven't already chosen — Draw 1. · Deal 2 to a unit at a
 *      battlefield. · Deal 3 to a unit at a base. · Give a unit at a battlefield -4 [Might] this turn."
 *   × Marai Spire (sfd-211-221) · Battlefield
 *     "While you control this battlefield, friendly [Repeat] costs cost [1] less."
 *   × Ezreal, Prodigy (sfd-149-221) · Champion Unit · Chaos · 3 + [chaos] · 3 Might
 *     "When you play me, discard 1, then draw 2. Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * Question: declaring all three Repeats — total cost, number of executions, must modes differ? Does a
 * Repeat cost that Marai Spire reduces to [0] still count as paid? What does Ezreal add? And when the
 * OPPONENT controls Marai Spire?
 *
 * Expected (rules 820.1.c.2, 820.1.c.3, 820.2, 820.2.a, 820.3, 820.3.a, 356.4.c, 356.4.c.1, 356.4.f,
 * 356.4.f.1, 356.6):
 *   - Each Repeat is a separate optional additional cost, payable once; each paid one = +1 execution;
 *     the spell is played once. All modes/targets for every execution are chosen while playing (820.2);
 *     "choose one you haven't already chosen" forces four DIFFERENT modes when all three are paid.
 *   - Baseline (no Spire): [4]+[1]+[rainbow]+[1][rainbow] = 6 energy + 2 power, 4 executions.
 *   - You control Marai Spire: [1]→0, [rainbow]→[rainbow] (nothing to reduce, 356.6), [1][rainbow]→[rainbow]
 *     ⇒ 4 energy + 2 power, still 4 executions (a cost reduced to 0 is still "paid", 356.4.f.1).
 *   - + Ezreal, Prodigy: every optional cost drops a further [1] or [rainbow] ⇒ total is just [4], 4 executions.
 *   - Opponent controls Marai Spire: no Spire discount for you. Ezreal alone ⇒ [4]+0+0+([1] or [rainbow])
 *     = 5 energy, or 4 energy + 1 power.
 *
 * Power note: P1 is given FURY power (one of Curtain Call's domains) so the [rainbow] repeat pips are
 * payable under either the "any domain" or the "hybrid pip" reading.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CURTAIN_CALL = "unl-182-219";
const MARAI_SPIRE = "sfd-211-221";
const EZREAL_PRODIGY = "sfd-149-221";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

interface BoardOpts {
  /** Who controls Marai Spire as bf1 ("none" = an inert vanilla battlefield controlled by P1). */
  spire?: "p1" | "p2" | "none";
  ezreal?: boolean;
  energy?: number;
  power?: number;
}

/**
 * P1 (caster): Curtain Call in hand, `energy` (default 10) + `power` fury (default 3).
 * P2: a 6-Might unit at bf1 (target for "deal 2" and "-4 Might") and a 5-Might unit in base ("deal 3").
 */
function board(opts: BoardOpts = {}) {
  const b = scenario().resources(P1, { energy: opts.energy ?? 10, power: { fury: opts.power ?? 3 } });
  if (opts.spire === "p1") {
    b.battlefield("bf1", { controller: P1, def: MARAI_SPIRE, inert: false, owner: P1 });
  } else if (opts.spire === "p2") {
    b.battlefield("bf1", { controller: P2, def: MARAI_SPIRE, inert: false, owner: P2 });
  } else {
    b.battlefield("bf1", { controller: P1 });
  }
  b.unit(P2, "bf1", { might: 6 }, "bfFoe").unit(P2, "base", { might: 5 }, "baseFoe").hand(P1, CURTAIN_CALL, "cc");
  if (opts.ezreal) {
    b.unit(P1, "base", EZREAL_PRODIGY, "ezreal");
  }
  return b;
}

/** Target to name for each damage / might mode. */
const TARGET_FOR_MODE: Record<number, string> = { 1: "bfFoe", 2: "baseFoe", 3: "bfFoe" };

/**
 * Drive every P1 prompt Curtain Call produces: modes are taken in ascending order among those still
 * offered (0 draw, 1 deal-2@bf, 2 deal-3@base, 3 -4 Might@bf), card picks name the unit for the mode
 * last chosen. Passes priority for both seats in between. Returns the mode menus that were offered.
 */
async function playOutCurtainCall(game: G): Promise<number[][]> {
  const menus: number[][] = [];
  const chosen: number[] = [];
  for (let i = 0; i < 40; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision() as Decision;
    if (d.kind !== "pick" || d.seat !== P1) {
      break;
    }
    const modes = d.options.filter((o) => o.mode !== undefined).map((o) => o.mode as number);
    if (modes.length > 0) {
      menus.push(modes);
      const next = modes.filter((m) => !chosen.includes(m)).sort()[0] ?? modes[0];
      chosen.push(next as number);
      const key = d.options.find((o) => o.mode === next)?.key as string;
      await game.p1.answer({ keys: [key], kind: "pick" });
      continue;
    }
    const want = TARGET_FOR_MODE[chosen.at(-1) ?? 1] ?? "bfFoe";
    const opt = d.options.find((o) => o.card === want || o.key === want) ?? d.options[0];
    await game.p1.answer({ keys: [opt?.key as string], kind: "pick" });
  }
  return menus;
}

describe("Curtain Call × Marai Spire × Ezreal, Prodigy — three Repeat costs", () => {
  // ---------------------------------------------------------------- baseline (no Spire, no Ezreal)

  test("baseline: declaring all three Repeats costs [4]+[1]+[rainbow]+[1][rainbow] = 6 energy + 2 power (820.1.c.2, 820.3)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max).toBe(3);
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.p1.resources()).toEqual({ energy: 10 - 6, power: { fury: 3 - 2 } });
  });

  test("baseline: each Repeat may be paid individually — 0/1/2/3 repeats cost 4 / 5 / 5+P / 6+2P (820.1.c.2)", async () => {
    const expected = [
      { energy: 4, power: 0 },
      { energy: 5, power: 0 },
      { energy: 5, power: 1 },
      { energy: 6, power: 2 },
    ];
    for (const [n, cost] of expected.entries()) {
      const game = await board().build();
      await game.p1.cast("cc", n === 0 ? {} : { repeat: n });
      expect(game.p1.energy()).toBe(10 - cost.energy);
      expect(game.p1.power("fury")).toBe(3 - cost.power);
    }
  });

  test("baseline: exactly 6 energy + 2 power is enough for all three Repeats; 5 energy + 2 power is not (each cost payable once, 820.1.c.3)", async () => {
    const enough = await board({ energy: 6, power: 2 }).build();
    expect(enough.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max).toBe(3);
    const short = await board({ energy: 5, power: 2 }).build();
    expect(short.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max ?? 0).toBeLessThan(3);
    await expect(short.p1.cast("cc", { repeat: 3 })).rejects.toThrow();
  });

  test("the spell is played only once however many Repeats are paid: one chain item, one card to trash (820.3.a)", async () => {
    const game = await board().build();
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "cc", controller: P1, triggered: false });
    await playOutCurtainCall(game);
    expect(game.zoneOf("cc")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test.failing("BUG: all mode/target choices are made while PLAYING the spell, before anyone gets priority (820.2)", async () => {
    // Expected: either the cast bundle asks for the modes, or P1 is prompted for them before the
    // priority window opens. Actual: the spell goes on the chain with nothing chosen; the single
    // "Choose a mode" prompt only appears at resolution.
    const game = await board().build();
    const upFront = (game.p1.option("cast", "cc")?.fields ?? []).some((f) => f.name !== "repeatCount");
    await game.p1.cast("cc", { repeat: 3 });
    const d = game.decision() as Decision;
    const promptedBeforePriority = d.seat === P1 && d.kind === "pick";
    expect(upFront || promptedBeforePriority).toBe(true);
  });

  test("with all three Repeats paid the effect executes 4 times with 4 DIFFERENT modes: draw 1, 2 to the battlefield unit, 3 to the base unit, -4 Might to the battlefield unit", async () => {
    const game = await board().build();
    await game.p1.cast("cc", { repeat: 3 });
    const menus = await playOutCurtainCall(game);
    expect(game.p1.hand()).toHaveLength(1); // cc left the hand, mode 0 drew exactly 1
    // rule 142.4.b — Lethal Damage is non-zero damage >= the unit's CURRENT Might, so the
    // 6-Might battlefield unit survives mode 1 (2 damage) and is then killed by mode 3
    // (-4 [Might] ⇒ Might 2 with 2 damage marked). Its death is the proof both modes ran.
    expect(game.zoneOf("bfFoe")).toBe("trash");
    expect(game.state("baseFoe").damage).toBe(3);
    // A mode already chosen is never offered again.
    for (const [i, menu] of menus.entries()) {
      for (const earlier of menus.slice(0, i)) {
        const taken = earlier.filter((m) => !menu.includes(m));
        expect(taken.length).toBeGreaterThan(0);
      }
    }
  });

  // ---------------------------------------------------------------- you control Marai Spire

  test("you control Marai Spire — each Repeat cost is [1] less: [1]→0, [rainbow] stays, [1][rainbow]→[rainbow] ⇒ 4 energy + 2 power total (356.4.c, 356.6)", async () => {
    // Expected: 10→6 energy, 3→1 fury. Actual: Marai Spire's static is ignored; 6 energy are charged.
    const game = await board({ spire: "p1" }).build();
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.p1.resources()).toEqual({ energy: 10 - 4, power: { fury: 3 - 2 } });
  });

  test("you control Marai Spire — with only 4 energy + 2 power all three Repeats can still be declared (a Repeat reduced to [0] is still paid, 356.4.f / 356.4.f.1)", async () => {
    // Expected: repeatCount 3 is legal and leaves the pool empty. Actual: only repeatCount 0 is offered.
    const game = await board({ spire: "p1", energy: 4, power: 2 }).build();
    expect(game.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max).toBe(3);
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toHaveLength(1);
  });

  test("Marai Spire never discounts the BASE cost: with no Repeats declared Curtain Call still costs [4]", async () => {
    const game = await board({ spire: "p1" }).build();
    await game.p1.cast("cc");
    expect(game.p1.resources()).toEqual({ energy: 10 - 4, power: { fury: 3 } });
  });

  // ---------------------------------------------------------------- + Ezreal, Prodigy

  test("Marai Spire + Ezreal, Prodigy — every optional cost is reduced to 0 ([1]→Spire; [rainbow]→Ezreal; [1][rainbow]→Spire+Ezreal): total is just [4] for four executions (356.4.c, 356.4.c.1)", async () => {
    const game = await board({ spire: "p1", ezreal: true, energy: 4, power: 0 }).build();
    expect(game.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max).toBe(3);
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Ezreal alone (opponent's Spire): [4] + 0 + 0 + [1] — all three Repeats are payable with 5 energy and no power", async () => {
    const game = await board({ spire: "p2", ezreal: true, energy: 5, power: 0 }).build();
    expect(game.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max).toBe(3);
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.p1.energy()).toBe(0);
  });

  test("Ezreal alone (opponent's Spire): alternatively [4] + [rainbow] — payable with 4 energy + 1 power", async () => {
    const game = await board({ spire: "p2", ezreal: true, energy: 4, power: 1 }).build();
    expect(game.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max).toBe(3);
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  // ---------------------------------------------------------------- opponent controls Marai Spire

  test("opponent controls Marai Spire (no Ezreal): 'friendly Repeat costs' is from THEIR side — you pay the full 6 energy + 2 power", async () => {
    const game = await board({ spire: "p2" }).build();
    await game.p1.cast("cc", { repeat: 3 });
    expect(game.p1.resources()).toEqual({ energy: 10 - 6, power: { fury: 3 - 2 } });
    const short = await board({ spire: "p2", energy: 4, power: 2 }).build();
    expect(short.p1.option("cast", "cc")?.fields.find((f) => f.name === "repeatCount")?.max ?? 0).toBe(0);
  });
});
