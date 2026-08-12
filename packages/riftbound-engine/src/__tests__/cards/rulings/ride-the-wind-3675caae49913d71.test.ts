/**
 * Ruling 3675caae49913d71 — Ride the Wind (OGN-173 → ogn-173-298) · Chaos · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: Does a spell that says "move" let a unit go battlefield-to-battlefield without [Ganking], and does it
 *    exhaust the unit?
 * A: A move made by a spell or ability has no destination restriction and costs no exhausting — those belong to
 *    the STANDARD move only. [Ganking] and the exhaust cost gate the standard move, not effect moves.
 * Rules: 445–447 (the standard move: exhaust the unit; battlefield→battlefield needs [Ganking]), 446 (a move
 *        made by an effect is performed as written).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P1 controls bf1 and bf2. `exhausted` sets the Runner's state; `ganking` gives it the keyword. */
function board(opts: { exhausted?: boolean; ganking?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(
      P1,
      "bf1",
      opts.ganking
        ? { abilities: [{ keyword: "Ganking", type: "keyword" }], keywords: ["Ganking"], might: 3, name: "Runner" }
        : { might: 3, name: "Runner" },
      "runner",
      { exhausted: opts.exhausted === true },
    )
    .hand(P1, RIDE_THE_WIND, "wind");
}

describe("Ruling 3675caae49913d71 — a spell's move ignores both [Ganking] and the standard move's exhaust cost", () => {
  test("standard move: a ready Runner without [Ganking] may only go home — bf2 is not on offer", async () => {
    const game = await board().build();
    expect(game.state("runner").keywords).not.toContain("Ganking");
    const moves = game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank").map((o) => o.key);
    expect(moves.some((k) => k.includes("base"))).toBe(true);
    expect(moves.some((k) => k.includes("bf2"))).toBe(false);
    expect((await game.p1.try((p) => p.move("runner", "bf2"))).ok).toBe(false);
  });

  test("standard move: an EXHAUSTED Runner cannot make one at all — exhausting is its cost", async () => {
    const game = await board({ exhausted: true }).build();
    expect(game.state("runner").isExhausted).toBe(true);
    expect(game.p1.can("move", "runner")).toBe(false);
  });

  test("ruling: Ride the Wind moves that same exhausted, non-[Ganking] Runner from bf1 straight to bf2 — and readies it", async () => {
    const game = await board({ exhausted: true }).build();
    await game.p1.cast("wind", { targets: "runner" });
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("battlefield-bf2");
      await game.p1.pick("battlefield-bf2");
    }
    await game.settle();
    expect(game.zoneOf("wind")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner").isExhausted).toBe(false); // readied, and never exhausted as a cost
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // not a standard move
    expect(game.violations()).toEqual([]);
  });

  test("control: give the Runner [Ganking] and the STANDARD move to bf2 becomes legal — and exhausts it", async () => {
    const game = await board({ ganking: true }).build();
    expect(game.state("runner").keywords).toContain("Ganking");
    await game.p1.gank("runner", "bf2");
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner").isExhausted).toBe(true);
  });
});
