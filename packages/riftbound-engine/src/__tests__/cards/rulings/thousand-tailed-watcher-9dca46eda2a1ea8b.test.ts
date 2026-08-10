/**
 * Ruling 9dca46eda2a1ea8b — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7 Might · "When you play me, give enemy
 *     units -3 Might this turn, to a minimum of 1."
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow], exhaust
 *     me, and spend its buff to heal it, exhaust it, and recall it instead."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust
 *     it, and recall it."
 *
 * Q: Does Sett's heal restore Might that Thousand-Tailed Watcher took away?
 * A: No. Healing only removes damage; Might gains/losses are separate and stay. Same for Zhonya's.
 * Rules: 157 (heal = remove damage), 700-series (Might modifications), 371–372 (die replacements).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const THE_BOSS = "ogn-269-298";
const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298"; // [3][fury] Action — "Deal 4 to a unit at a battlefield. Draw 1."

/** P1's turn with Watcher + Void Seeker and [10] + mind + fury. P2's Bruiser (5) stands at P2's bf1. */
function base() {
  return scenario()
    .resources(P1, { energy: 10, power: { mind: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .hand(P1, WATCHER, "watcher")
    .hand(P1, VOID_SEEKER, "vs");
}

async function watcherThenSeeker(game: Game, expectedMightAfterWatcher: number): Promise<void> {
  await game.p1.play("watcher");
  await game.settle();
  expect(game.zoneOf("watcher")).toBe("base");
  expect(game.state("bruiser").might).toBe(expectedMightAfterWatcher);
  await game.p1.cast("vs", { targets: "bruiser" });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 9dca46eda2a1ea8b — heals (The Boss / Zhonya's) don't undo Thousand-Tailed Watcher's -3 Might", () => {
  test("The Boss: buffed Bruiser 6 → 3 after Watcher; Void Seeker would kill it; P2 is ASKED, says yes → healed (0 damage), exhausted, recalled, buff spent — and its Might is 2 (5 − 3), NOT restored to 5", async () => {
    const game = await base()
      .legend(P2, THE_BOSS, "boss")
      .resources(P2, { power: { body: 1 } })
      .unit(P2, "bf1", { might: 5, name: "Bruiser" }, "bruiser", { buffed: true })
      .build();
    expect(game.state("bruiser").might).toBe(6);
    await watcherThenSeeker(game, 3);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "boss" } });
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("base"); // saved, recalled
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power("body")).toBe(0);
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    // The heal removed the 4 damage only — the -3 Might (this turn) is retained.
    expect(game.state("bruiser").might).toBe(2);
    expect(game.state("bruiser").baseMight).toBe(5);
    expect(game.violations()).toEqual([]);
    // …and it is a this-turn effect: next turn the Bruiser is back to its printed 5.
    await game.advanceTurn();
    expect(game.state("bruiser").might).toBe(5);
  });

  test("Zhonya's Hourglass: Bruiser 5 → 2 after Watcher; Void Seeker would kill it; Zhonya's dies instead, Bruiser healed/exhausted/recalled — still 2 Might this turn", async () => {
    const game = await base()
      .gear(P2, ZHONYAS, "zhonyas")
      .unit(P2, "bf1", { might: 5, name: "Bruiser" }, "bruiser")
      .build();
    await watcherThenSeeker(game, 2);
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("bruiser").might).toBe(2);
    expect(game.state("bruiser").baseMight).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
