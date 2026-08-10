/**
 * Ruling 16b183d556639342 — Sett, Kingpin (OGN-240 → ogn-240-298) · Champion Unit · Order · [4][order] · 5 Might · Tank
 *     "I get +1 [Might] for each buffed friendly unit at my battlefield."
 *   × Call to Glory (OGN-207 → ogn-207-298) · Reaction spell · [3] "As you play this, you may spend a buff as an
 *     additional cost. If you do, ignore this spell's cost. Give a unit +3 [Might] this turn."
 *   × Thousand-Tailed Watcher (ogn-116-298) "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1."
 *
 * Q: Buffed Sett gets -3 from Watcher, then Call to Glory is played spending Sett's buff for +3 — final Might?
 * A: 5. Buffed Sett alone = 7 (5 + 1 buff + 1 from his own passive counting himself); Watcher -3 → 4; spending
 *    the buff loses 2 (buff and passive) → 2; Call to Glory +3 → 5. Plain arithmetic — no "eating" of modifiers.
 * Rules: 702.2.b (spend a buff), 522 (statics are continuous), might layering is additive.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-240-298";
const CALL_TO_GLORY = "ogn-207-298";
const WATCHER = "ogn-116-298";
/** Inline slow P2 spell so P1 gets a Reaction window on P2's turn after the Watcher has resolved. */
const PONDER = { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", domain: "mind", energyCost: 1, name: "Ponder", timing: "standard" };

/**
 * P2's turn. P1 controls bf1 with a BUFFED Sett on it and holds Call to Glory with 0 energy (so the only way to
 * cast it is by spending Sett's buff). P2 holds Thousand-Tailed Watcher with exactly [7][mind], plus Ponder + [1].
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT, "sett", { buffed: true })
    .hand(P1, CALL_TO_GLORY, "ctg")
    .resources(P1, { energy: 0 })
    .hand(P2, WATCHER, "watcher")
    .hand(P2, PONDER, "ponder")
    .resources(P2, { energy: 8, power: { mind: 1 } });
}

async function watcherResolves(game: Game): Promise<void> {
  await game.p2.play("watcher");
  // Watcher's play trigger goes on the chain; nobody responds.
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("watcher")).toBe("base");
}

describe("Ruling 16b183d556639342 — Sett: buff → Watcher -3 → spend buff for Call to Glory = 5 Might", () => {
  test("step 0: buffed Sett alone at his battlefield is 7 Might (5 base + 1 buff + 1 passive counting himself)", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: true, might: 7 });
  });

  test("step 1: Thousand-Tailed Watcher's -3 this turn takes Sett from 7 to 4", async () => {
    const game = await board().build();
    await watcherResolves(game);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(4);
  });

  test("step 2+3: Call to Glory cast by spending Sett's buff — paying the cost drops him to 2 (buff and passive both gone), resolution adds +3 → final 5", async () => {
    const game = await board().build();
    await watcherResolves(game);
    // Open a Reaction window for P1 on P2's turn.
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.p1.can("cast", "ctg")).toBe(true);
    await game.p1.cast("ctg", { payOptional: true, targets: "sett" });
    expect(game.p1.energy()).toBe(0); // cost ignored
    // Cost paid, spell still on the chain: buff spent → 5 - 3 = 2.
    expect(game.zoneOf("ctg")).toBe("chain");
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.state("sett").might).toBe(2);
    // Resolve Call to Glory (LIFO, before Ponder).
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("sett").might).toBe(5);
    // Ponder then resolves; Sett is unaffected.
    await game.settle();
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: false, might: 5 });
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
  });

  test("no modifier is 'eaten': next turn all this-turn effects expire and unbuffed Sett is back to exactly 5", async () => {
    const game = await board().build();
    await watcherResolves(game);
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    await game.p1.cast("ctg", { payOptional: true, targets: "sett" });
    await game.settle();
    expect(game.state("sett").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 5 });
  });
});
