/**
 * Ruling 50ff092f445ebab6 — Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *   × Switcheroo (SFD-145 → sfd-145-221) · Action · [2][chaos][chaos] · "Swap the Might of two units at the same battlefield this turn."
 *   × Sett, Kingpin (OGN-240 → ogn-240-298) · 5 Might · "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."
 *
 * Q: Sett, Kingpin moves into a lane with 2 buffed units; the opponent's Watchful Sentry is there. Opponent Switcheroos Sett
 *    and the Sentry — what happens?
 * A: Might is read at resolution INCLUDING Sett's passive (5 + 2 = 7 vs the Sentry's 1); Switcheroo applies a fixed ±6
 *    modifier for the turn, so they end 1 and 7. It is not a snapshot: buffs/passives stay on their own units and keep
 *    recalculating on top of the modifier — if a buffed ally later leaves Sett's battlefield his Might drops further.
 * Rules: 433 (swap = ± difference modifiers), layered Might calculation (base + passive + modifiers), FAQ #9335/#9201/#2144.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHFUL_SENTRY = "ogn-096-298";
const SWITCHEROO = "sfd-145-221";
const SETT_KINGPIN = "ogn-240-298";
const GUST = "ogn-169-298"; // [1] Reaction — bounce a ≤3-Might unit at a battlefield (to make a buffed ally leave)

/**
 * P1's turn. P1: Sett, Kingpin + two BUFFED 2-Might Pals (→ 3 each) in base, Gust in hand with [1]. P2 controls bf1 with a
 * Watchful Sentry (1) and holds Switcheroo with exactly [2][chaos][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", SETT_KINGPIN, "sett")
    .unit(P1, "base", { might: 2, name: "Pal A" }, "palA", { buffed: true })
    .unit(P1, "base", { might: 2, name: "Pal B" }, "palB", { buffed: true })
    .hand(P1, GUST, "gust")
    .hand(P2, SWITCHEROO, "switcheroo");
}

/** Sett and both Pals move into bf1; P1 passes Focus; P2 Switcheroos Sett ↔ Sentry and it resolves. */
async function switched(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sett").might).toBe(5); // in base: "at my battlefield" counts nothing yet
  await game.p1.move(["sett", "palA", "palB"], "bf1");
  // 1. Current Might before the swap: Sett 5 + 1 per buffed friendly unit here (2) = 7; Sentry 1.
  expect(game.state("sett")).toMatchObject({ location: "bf1", might: 7 });
  expect(game.state("palA").might).toBe(3);
  expect(game.state("sentry").might).toBe(1);
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("switcheroo", { targets: ["sett", "sentry"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority(); // resolves
  expect(game.zoneOf("switcheroo")).toBe("trash");
  return game;
}

describe("Ruling 50ff092f445ebab6 — Switcheroo on Sett, Kingpin (with 2 buffed friends) and Watchful Sentry", () => {
  test("2. resolution: the difference is taken from CURRENT Might (passive included): Sett 7 → 1 (a −6 modifier), Sentry 1 → 7 (+6); buffs stay where they were", async () => {
    const game = await switched();
    expect(game.state("sett")).toMatchObject({ might: 1, mightModifier: -6 });
    expect(game.state("sentry")).toMatchObject({ might: 7, mightModifier: 6 });
    // Nothing was transferred: the Pals keep their buffs, the Sentry did not become buffed.
    expect(game.state("palA").isBuffed).toBe(true);
    expect(game.state("palB").isBuffed).toBe(true);
    expect(game.state("sentry").isBuffed).toBe(false);
    expect(game.state("sett").isBuffed).toBe(false);
  });

  test("3. not a snapshot: when a buffed Pal leaves Sett's battlefield afterwards (P1 Gusts it back to hand), Sett's passive recalculates on top of the modifier — 5 + 1 − 6 = 0 — while the Sentry stays 7", async () => {
    const game = await switched();
    // Focus returns to P1 in the still-open showdown; Gust (Reaction) the 3-Might Pal A.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("gust", { targets: "palA" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("palA")).toBe("hand");
    expect(game.state("sett")).toMatchObject({ might: 0, mightModifier: -6 }); // (5 + 1) − 6
    expect(game.state("sentry").might).toBe(7);
  });

  test("the swap lasts only this turn: after the turn ends both modifiers are gone (Sentry back to 1; Sett back to base 5 + whatever his passive then gives)", async () => {
    const game = await switched();
    await game.settle(); // finish the showdown/combat however it falls
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    if (game.has("sentry") && game.zoneOf("sentry") !== "trash") {
      expect(game.state("sentry")).toMatchObject({ might: 1, mightModifier: 0 });
    }
    if (game.has("sett") && game.zoneOf("sett") !== "trash") {
      expect(game.state("sett").mightModifier).toBe(0);
      expect(game.state("sett").might).toBeGreaterThanOrEqual(5);
    }
    expect(game.violations()).toEqual([]);
  });
});
