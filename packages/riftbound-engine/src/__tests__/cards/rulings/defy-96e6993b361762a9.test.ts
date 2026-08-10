/**
 * Ruling 96e6993b361762a9 — Defy (OGN-045 → ogn-045-298) / Wind Wall (OGN-064 → ogn-064-298) — "Counter a spell …"
 *   × Harnessed Dragon (OGN-234 → ogn-234-298) · 8+[order][order] · 6 Might · "When you play me, kill an enemy unit."
 *   × Solari Shieldbearer (ogn-051-298) · 3 · "When you play me, stun a unit."
 *   × Zhonya's Hourglass (ogn-077-298) / Fight or Flight (ogn-168-298) / Retreat (ogn-104-298) as the suggested answers.
 *
 * Q: Can Defy or Wind Wall counter play abilities like Shieldbearer's stun or Harnessed Dragon's kill?
 * A: No — they counter SPELLS; a "When you play me" trigger is an ability. To dodge the kill use a replacement (Zhonya's,
 *    The Boss) or take the unit off the board (Retreat). Harnessed Dragon's kill has no "at a battlefield" restriction, so
 *    merely moving the unit to base does not help.
 * Rules: 425 (counter), 383 (triggered abilities are chain items but not spells), 372 (replacement), 359.3.f (target legality on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const HARNESSED_DRAGON = "ogn-234-298";
const SOLARI_SHIELDBEARER = "ogn-051-298";
const ZHONYAS = "ogn-077-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const RETREAT = "ogn-104-298";

/** P1's turn; P2's X (3) at P2's bf1; P2 holds Defy AND Wind Wall with plenty to pay for either ([4] + 3 calm). */
function board(unit: string, p1: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, p1)
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "X" }, "x")
    .hand(P1, unit, "u")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "ww");
}

/** Play the unit, name X for its play trigger if asked, and hand priority to P2 with the trigger on the chain. */
async function playAndTargetX(game: Game): Promise<void> {
  await game.p1.play("u");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("x");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "u", controller: P1, targets: ["x"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 96e6993b361762a9 — Defy / Wind Wall can't counter 'When you play me' abilities", () => {
  test("Harnessed Dragon's kill trigger is an ABILITY on the chain: with priority, P2 can cast neither Defy nor Wind Wall (no spell to target); it resolves and X dies", async () => {
    const game = await board(HARNESSED_DRAGON, { energy: 8, power: { order: 2 } }).build();
    await playAndTargetX(game);
    expect(game.chain()[0]?.triggered).toBe(true);
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.can("cast", "ww")).toBe(false);
    expect((await game.p2.try((p) => p.cast("ww", { targets: "u" }))).ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("u")).toBe("base");
    expect(game.p2.hand().sort()).toEqual(["defy", "ww"]);
  });

  test("Solari Shieldbearer's stun trigger likewise: not Defy-able / Wind Wall-able; X ends up stunned", async () => {
    const game = await board(SOLARI_SHIELDBEARER, { energy: 3 }).build();
    await playAndTargetX(game);
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.can("cast", "ww")).toBe(false);
    await game.settle();
    expect(game.state("x")).toMatchObject({ isStunned: true, zone: "battlefield-bf1" });
  });

  test("what DOES work (1): a replacement — P2's Zhonya's Hourglass dies instead; X is healed, exhausted and recalled to base", async () => {
    const game = await board(HARNESSED_DRAGON, { energy: 8, power: { order: 2 } }).gear(P2, ZHONYAS, "zh").build();
    await playAndTargetX(game);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("what DOES work (2): take it off the board — P2 Retreats X to hand in response; the kill finds nothing", async () => {
    const game = await board(HARNESSED_DRAGON, { energy: 8, power: { order: 2 } }).hand(P2, RETREAT, "retreat").build();
    await playAndTargetX(game);
    expect(game.p2.can("cast", "retreat")).toBe(true);
    await game.p2.cast("retreat", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.trash()).not.toContain("x");
  });

  test("what does NOT work: Harnessed Dragon says 'an enemy unit' (no 'at a battlefield') — moving X home with a flipped Fight or Flight doesn't save it; it is killed in base", async () => {
    const game = await board(HARNESSED_DRAGON, { energy: 8, power: { order: 2 } }).facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof").build();
    await playAndTargetX(game);
    await game.p2.reveal("fof", { answers: ["x"] });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("x");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["u", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves: X → base
    expect(game.zoneOf("x")).toBe("base");
    await game.settle(); // the kill still lands
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
