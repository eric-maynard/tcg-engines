/**
 * Ruling db97831347314073 — Hard Bargain (SFD-136 → sfd-136-221) · Reaction · [2] · "[Repeat] [2] Counter a spell unless its
 *     controller pays [2]."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: I play Hard Bargain paying its Repeat; my opponent Defies it. Is the repeated effect countered too?
 * A: Yes. Repeat is an additional cost paid on play; the repeated spell is ONE chain item. Defy counters the whole thing —
 *    none of its effects happen (the "unless pays [2]" question is never asked) and nothing, Repeat included, is refunded.
 * Rules: 820 (Repeat = optional additional cost, same item executed again), 425.1.a–c (countered: no effect, trash, no refund).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";
const DEFY = "ogn-045-298";
const DREDGE_UP = "ven-049-166"; // P2's plain [2] "Draw 1" spell — the thing Hard Bargain tries to counter

/** P2's turn. P2: Dredge Up + Defy in hand, [2]+[1]+[calm] and 2 spare (so it COULD pay a bargain). P1: Hard Bargain, exactly [4]. */
async function bargainRepeatedThenDefied(): Promise<{ game: Game; p2HandAfterCasts: number }> {
  const game = await scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { calm: 1 } })
    .resources(P1, { energy: 4 })
    .hand(P2, DREDGE_UP, "dredge")
    .hand(P2, DEFY, "defy")
    .hand(P1, HARD_BARGAIN, "hb")
    .build();
  await game.p2.cast("dredge");
  await game.p2.passPriority();
  await game.p1.cast("hb", { repeat: 1, targets: "dredge" });
  expect(game.p1.energy()).toBe(0); // base [2] + Repeat [2] both paid on play
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb"]); // ONE Hard Bargain item
  expect(game.chain().filter((c) => c.cardId === "hb")).toHaveLength(1);
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "hb" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb", "defy"]);
  return { game, p2HandAfterCasts: game.p2.hand().length };
}

describe("Ruling db97831347314073 — Defy on a repeated Hard Bargain counters the entire spell", () => {
  test("Defy resolves first and counters Hard Bargain wholesale: P2 is never asked to pay [2] (not once, not twice), Dredge Up resolves and draws", async () => {
    const { game, p2HandAfterCasts } = await bargainRepeatedThenDefied();
    const energyP2 = game.p2.energy();
    // Drain the chain by passing; a yes/no "pay [2]?" for P2 must never appear.
    for (let i = 0; i < 10 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind).toBe("action");
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2HandAfterCasts + 1); // Dredge Up was NOT countered → drew 1
    expect(game.p2.energy()).toBe(energyP2); // never paid any bargain
    expect(game.violations()).toEqual([]);
  });

  test("no refund: P1 stays at 0 energy — the Repeat cost is gone along with the base cost (425.1.c)", async () => {
    const { game } = await bargainRepeatedThenDefied();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("contrast — without Defy the repeated Hard Bargain asks Dredge Up's controller about [2] and, declined, counters it (no draw)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5, power: { calm: 1 } })
      .resources(P1, { energy: 4 })
      .hand(P2, DREDGE_UP, "dredge")
      .hand(P1, HARD_BARGAIN, "hb")
      .build();
    await game.p2.cast("dredge");
    const handAfter = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.cast("hb", { repeat: 1, targets: "dredge" });
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    // A second execution may ask again (same spell targeted twice) — decline that too.
    for (let i = 0; i < 2; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P2) {
        await game.p2.no();
      }
    }
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handAfter); // countered → no draw
  });
});
