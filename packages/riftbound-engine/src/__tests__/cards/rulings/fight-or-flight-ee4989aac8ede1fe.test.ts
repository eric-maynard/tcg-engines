/**
 * Ruling ee4989aac8ede1fe — Fight or Flight (OGN-168 → ogn-168-298) · [Hidden][Action] · [2] · "Move a unit from a battlefield to its base."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · [2][order] · "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and
 *     recall it." — the contrasting replacement effect.
 *
 * Q: Fight or Flight moves Hidden Blade's target to base in response — is the unit killed, and does its controller draw 2?
 * A: No and no. When the Blade resolves its target is no longer "at a battlefield" → illegal → the Blade resolves with no effect and
 *    cannot retarget; with no legal target there is no "controller" to draw. Contrast Zhonya's: the target is legal when the Blade
 *    starts resolving, so even though the unit doesn't die (replaced), its controller DOES draw 2 — the death is not the requirement,
 *    a legal target at resolution is.
 * Rules: 359.3.e (target legality re-checked at resolution; illegal → skipped), 355.7 (no retarget), 372 (replacement effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";

/**
 * P1's turn 3, [2]+[order] for Hidden Blade from hand. P2 holds bf1 with Runner (3) + Anchor (1) and hid Fight or Flight there
 * earlier; P2's deck top is known so a draw is observable. Optionally P2 also has a face-up Zhonya's.
 */
function board(opts: { zhonyas?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "bf1", { might: 1, name: "Anchor" }, "anchor")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P1, HIDDEN_BLADE, "hb");
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/** P1 Hidden-Blades the Runner and passes → P2 has priority with [hb] on the chain. */
async function bladeOnRunner(opts: { zhonyas?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("hb", { targets: "runner" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hb", targets: ["runner"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling ee4989aac8ede1fe — Fight or Flight away from Hidden Blade: no kill, no draw (unlike a Zhonya's save)", () => {
  test("P2 flips Fight or Flight on the Runner in response; it resolves first (Runner → base, still with [hb] pending on it — no retarget offered)", async () => {
    const game = await bladeOnRunner();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["runner"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hb", "fof"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "fof"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hb", targets: ["runner"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // plain priority, no re-aim at the Anchor
  });

  test("then Hidden Blade resolves with NO effect: Runner alive in base, Anchor untouched, P2 draws NOTHING; the Blade is in the trash (resolved, not refunded)", async () => {
    const game = await bladeOnRunner();
    await game.p2.reveal("fof", { answers: ["runner"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual([]); // no "its controller draws 2"
    expect(game.p2.deck()[0]).toBe("d1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Zhonya's Hourglass instead of Fight or Flight: the Runner is a LEGAL target when the Blade resolves; it doesn't die (Zhonya's is killed instead, Runner recalled exhausted) yet P2 STILL draws 2", async () => {
    const game = await bladeOnRunner({ zhonyas: true });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the Blade kills the Runner and P2 draws 2", async () => {
    const game = await bladeOnRunner();
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
  });
});
