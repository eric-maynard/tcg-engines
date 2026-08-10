/**
 * Ruling 26d43c69517a3336 — Portal Rescue (OGN-102 → ogn-102-298, Action, 3 + [mind]) "Banish a friendly unit, then its
 *   owner plays it to their base, ignoring its cost."
 *   × Watchful Sentry (ogn-096-298) "[Deathknell] — Draw 1."
 *   × Thousand-Tailed Watcher (ogn-116-298) "[Accelerate] … When you play me, give enemy units -3 [Might] this turn (min 1)."
 *   × Vanguard Captain (ogn-218-298) "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here."
 *
 * Q: Does banishing a unit with Portal Rescue trigger its Deathknell?
 * A: No — dying means board → trash by a kill/lethal damage; banishing is not dying. But the unit IS played again, so its
 *    "When you play me" effects trigger (Watcher's -3 and its Accelerate option; Captain's Legion tokens, Legion being met
 *    by Portal Rescue itself), and that trigger goes on the same chain rather than starting a new one.
 * Rules: 808 (Deathknell = when killed → trash), 425/428 (banish is not a kill), 346 + 383 (play triggers), 724 (Legion).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const WATCHER = "ogn-116-298";
const VANGUARD_CAPTAIN = "ogn-218-298";

/** P1's turn; P1 controls bf1 where the rescued unit stands; P2's 5-Might Foe in base. */
function board(unitDef: string, alias: string, extra: { energy?: number; mind?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 3 + (extra.energy ?? 0), power: { mind: 1 + (extra.mind ?? 0) } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", unitDef, alias, { exhausted: true })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 5, name: "Foe" }, "foe")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P1, PORTAL_RESCUE, "pr");
}

/** Cast Portal Rescue on `alias` and pass priority once each so that Portal Rescue itself resolves. */
async function rescue(game: Game, alias: string): Promise<void> {
  await game.p1.cast("pr", { targets: alias });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 26d43c69517a3336 — Portal Rescue does not trigger Deathknell", () => {
  test("Watchful Sentry rescued: banished then replayed to base (exhausted, healed of nothing, cost ignored) — NO Deathknell draw, no trigger ever on the chain", async () => {
    const game = await board(WATCHFUL_SENTRY, "sentry").build();
    await game.p1.cast("pr", { targets: "sentry" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    let sawSentryTrigger = false;
    for (let i = 0; i < 10; i++) {
      sawSentryTrigger ||= game.chain().some((c) => c.cardId === "sentry");
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(sawSentryTrigger).toBe(false);
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ controller: P1, location: "base" });
    expect(game.p1.trash()).toEqual(["pr"]); // the Sentry never touched the trash
    expect(game.p1.hand()).toEqual([]); // Deathknell "Draw 1" did not happen
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 26d43c69517a3336 — but 'When you play me' effects DO fire off the replay", () => {
  test("Thousand-Tailed Watcher rescued: its play trigger appears on the chain right behind Portal Rescue (no open state in between) and gives the enemy Foe -3 this turn", async () => {
    const game = await board(WATCHER, "watcher").build();
    await rescue(game, "watcher");
    // Portal Rescue has resolved; an unpayable Accelerate offer (0 resources left) may be shown once — decline it.
    for (let i = 0; i < 3 && game.decision()?.kind === "yes-no"; i++) {
      await game.p1.no();
    }
    expect(game.zoneOf("pr")).toBe("trash");
    expect(game.zoneOf("watcher")).toBe("base");
    // Same chain: the very next decision is priority over the Watcher's trigger — not an open main phase.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("foe").might).toBe(5); // not yet
    await game.settle();
    expect(game.state("foe").might).toBe(2); // 5 - 3
    expect(game.state("holder").might).toBe(2); // friendly units untouched
  });

  test("the replay also offers [Accelerate]: with a spare [1][mind] P1 may pay it and the Watcher enters READY", async () => {
    const game = await board(WATCHER, "watcher", { energy: 1, mind: 1 }).build();
    await rescue(game, "watcher");
    const d: Decision | null = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.prompt).toMatch(/\[1\]\[mind\]/);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("watcher")).toMatchObject({ isReady: true, location: "base" });
    expect(game.state("foe").might).toBe(2);
  });

  test("Vanguard Captain rescued: Portal Rescue itself was 'another card played this turn' → Legion is met → two 1-Might Recruit tokens are played to base ('here')", async () => {
    const game = await board(VANGUARD_CAPTAIN, "captain").build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await rescue(game, "captain");
    expect(game.zoneOf("captain")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "captain", triggered: true })]);
    await game.settle();
    const recruits = game.p1
      .base()
      .filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");
    expect(recruits).toHaveLength(2);
    for (const r of recruits) {
      expect(game.state(r).might).toBe(1);
    }
    expect(game.p1.units("bf1")).toEqual(["holder"]); // "here" is now the base, not bf1
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBeGreaterThanOrEqual(2); // Portal Rescue + the Captain
    expect(game.violations()).toEqual([]);
  });
});
