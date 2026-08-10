/**
 * Ruling 5804ca8d5959c574 — Hard Bargain (SFD-136 → sfd-136-221) · Reaction · [2] · "[Repeat] [2] Counter a spell unless its
 *     controller pays [2]."
 *   × Ezreal, Prodigy (SFD-149 → sfd-149-221) · 3 Might · "… Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * Q: With 1 Ezreal out, what does Hard Bargain's Repeat cost me — and with 2 or 3 Ezreals?
 * A: Repeat [2] is an optional additional cost, so each Ezreal knocks [1] off it, stacking, never below 0:
 *    1 Ezreal → Repeat costs [1]; 2 Ezreals → [0]; 3 Ezreals → still [0].
 * Rules: 820 (Repeat = optional additional cost), 353.4.c–d (discounts apply to additional costs, down to 0), 353.5 (not
 *        below 0), FAQ #8415 / #6329 (multiple Ezreals stack).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";
const EZREAL = "sfd-149-221";
const DREDGE_UP = "ven-049-166"; // P2's plain [2] "Draw 1" spell — something for Hard Bargain to counter

/** P2's turn: P2 casts Dredge Up ([2]) and passes. P1 holds Hard Bargain with `energy` and `ezreals` copies of Ezreal in base. */
async function bargainWindow(ezreals: number, energy: number): Promise<Game> {
  const b = scenario().active(P2).resources(P2, { energy: 2 }).resources(P1, { energy }).hand(P2, DREDGE_UP, "dredge").hand(P1, HARD_BARGAIN, "hb");
  for (let i = 0; i < ezreals; i++) {
    b.unit(P1, "base", EZREAL, `ez${i + 1}`);
  }
  const game = await b.build();
  await game.p2.cast("dredge");
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

const repeatOffered = (game: Game) => (game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat")?.options ?? []) as number[];

describe("Ruling 5804ca8d5959c574 — Ezreal, Prodigy discounts Hard Bargain's Repeat [2]: 1 → [1], 2 → [0], 3 → [0]", () => {
  test("baseline (no Ezreal): base [2] + Repeat [2] = 4 — at 3 energy the Repeat is not offered, at 4 it is and leaves 0", async () => {
    const poor = await bargainWindow(0, 3);
    expect(repeatOffered(poor)).not.toContain(1);
    const rich = await bargainWindow(0, 4);
    expect(repeatOffered(rich)).toContain(1);
    await rich.p1.cast("hb", { repeat: 1, targets: "dredge" });
    expect(rich.p1.energy()).toBe(0);
  });

  test("ONE Ezreal: Repeat costs [1] — castable repeated with exactly 3 energy (2 + 1 → 0 left); with only 2 the Repeat is not offered", async () => {
    const game = await bargainWindow(1, 3);
    expect(repeatOffered(game)).toContain(1);
    await game.p1.cast("hb", { repeat: 1, targets: "dredge" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb"]);
    const short = await bargainWindow(1, 2);
    expect(repeatOffered(short)).not.toContain(1); // 2 pays the base cost only; the discounted Repeat still needs [1]
  });

  test("TWO Ezreals: the reductions stack — Repeat costs [0]; with exactly 2 energy (just the base cost) the Repeat is offered and casting repeated leaves 0", async () => {
    const game = await bargainWindow(2, 2);
    expect(repeatOffered(game)).toContain(1);
    await game.p1.cast("hb", { repeat: 1, targets: "dredge" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb"]);
  });

  test("THREE Ezreals: can't go below [0] — same as two: 2 energy in, repeated cast, exactly 0 left (nothing 'refunded' into the pool)", async () => {
    const game = await bargainWindow(3, 2);
    expect(repeatOffered(game)).toContain(1);
    await game.p1.cast("hb", { repeat: 1, targets: "dredge" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.resources().energy).toBeGreaterThanOrEqual(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb"]);
    expect(game.violations()).toEqual([]);
  });
});
