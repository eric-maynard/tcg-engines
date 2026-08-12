/**
 * Ruling 2148b9409a52ad81 — Defy (OGN-045 → ogn-045-298) · Calm · [1][calm] · [Reaction]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   The [calm] pip is paid by RECYCLING a rune.
 *
 * Q: Can an already-exhausted rune be recycled to pay a card's rune (Power) cost?
 * A: Yes. Every rune has both abilities — exhaust for 1 Energy and recycle for 1 Power of its domain — and the
 *    recycle ability does not care whether the rune is readied or exhausted.
 * Rules: 204 / 429.3 (Power is added by recycling a rune), 802 (rune abilities; recycling has no ready cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Action — "Deal 3 to a unit at a battlefield."

/** P2's turn. P2 casts Hextech Ray at P1's Squire. P1 holds Defy, [1] Energy, and ONE exhausted Calm rune. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Squire" }, "squire")
    .rune(P1, "calm", { alias: "r1", exhausted: true })
    .hand(P1, DEFY, "defy")
    .hand(P2, HEXTECH_RAY, "ray");
}

describe("Ruling 2148b9409a52ad81 — an exhausted rune can still be recycled for Power", () => {
  test("the rune really is exhausted: once P1 holds priority its EXHAUST-for-Energy ability is unavailable, but recycling it IS offered", async () => {
    const game = await board().build();
    expect(game.state("r1").isExhausted).toBe(true);
    await game.p2.cast("ray", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("tapRune", "r1")).toBe(false); // already exhausted: no second Energy from it
    expect(game.p1.can("recycleRune", "r1")).toBe(true); // recycling does not care about the state
  });

  test("ruling: P1 recycles the exhausted rune for 1 [calm] and pays Defy with it, countering the Ray", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.power("calm")).toBe(0);
    await game.p1.recycleRune("r1");
    expect(game.p1.power("calm")).toBe(1);
    expect(game.p1.runes()).toEqual([]); // the rune left the pool as it was recycled
    await game.p1.cast("defy", { targets: "ray" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("squire").damage).toBe(0); // countered: it never dealt its 3
    expect(game.violations()).toEqual([]);
  });

  test("control: a READY rune of the same domain recycles identically — the state genuinely makes no difference", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Squire" }, "squire")
      .rune(P1, "calm", { alias: "r1" })
      .hand(P1, DEFY, "defy")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(game.state("r1").isExhausted).toBe(false);
    await game.p2.cast("ray", { targets: "squire" });
    await game.p2.passPriority();
    await game.p1.recycleRune("r1");
    expect(game.p1.power("calm")).toBe(1);
    await game.p1.cast("defy", { targets: "ray" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("squire").damage).toBe(0);
  });
});
